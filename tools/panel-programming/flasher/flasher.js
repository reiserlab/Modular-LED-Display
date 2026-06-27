// G6 Panel WebUSB flasher — drives the RP2350 PICOBOOT interface to write flash.
//
// FINAL HOME: flasher/ in reiserlab/webDisplayTools (deploy via GitHub Pages — WebUSB
// needs a secure context, which Pages https provides). Chromium/Edge only.
//
// Why WebUSB (not Web Serial): the existing webDisplayTools console uses Web *Serial*
// to talk to the arena controller, but flashing a panel's bootloader needs the RP2350
// PICOBOOT vendor interface, which is Web *USB*. Browsers also cannot use the UF2
// mass-storage drag-drop path, so we parse the UF2 client-side and stream its blocks
// over PICOBOOT (EXCLUSIVE_ACCESS -> EXIT_XIP -> FLASH_ERASE -> WRITE -> REBOOT2).
//
// The PICOBOOT framing here follows the RP2350 datasheet / picoboot interface. It is
// modeled on piersfinlayson/picoflash (MIT) — validate against real hardware and that
// reference before production use.

const RP_VID = 0x2e8a;
const FW_REPO = "reiserlab/LED-Display_G6_Firmware_Panel";
const FLASH_XIP_BASE = 0x10000000;
const SECTOR = 4096;           // RP2350 flash erase granularity
const WRITE_CHUNK = 256;       // PICOBOOT WRITE granularity (UF2 payloads are 256B)

// rev -> expected USB product string prefix (set in panel/platformio.ini).
const REV_PRODUCT = { "v0.2.1": "G6 Panel v0.2", "v0.3.1": "G6 Panel v0.3" };

// --- PICOBOOT command framing ---------------------------------------------------
const PICOBOOT_MAGIC = 0x431fd10b;
const CMD = {
  EXCLUSIVE_ACCESS: 0x01,
  FLASH_ERASE: 0x03,
  WRITE: 0x05,
  EXIT_XIP: 0x06,
  REBOOT2: 0x0a, // RP2350 reboot
};
let token = 1;

const $ = (id) => document.getElementById(id);
const logEl = $("log");
function log(msg, cls) {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}
function setStatus(msg, cls) { const s = $("status"); s.textContent = msg; s.className = cls || ""; }

// --- UF2 parsing ----------------------------------------------------------------
// Returns sorted [{addr, data:Uint8Array(256)}], one per 512-byte UF2 block.
function parseUF2(buf) {
  const dv = new DataView(buf);
  const blocks = [];
  for (let off = 0; off + 512 <= buf.byteLength; off += 512) {
    if (dv.getUint32(off, true) !== 0x0a324655) continue;       // magicStart0 "UF2\n"
    if (dv.getUint32(off + 4, true) !== 0x9e5d5157) continue;   // magicStart1
    if (dv.getUint32(off + 508, true) !== 0x0ab16f30) continue; // magicEnd
    const flags = dv.getUint32(off + 8, true);
    if (flags & 0x00000001) continue;                            // "not main flash" block
    const addr = dv.getUint32(off + 12, true);
    const size = dv.getUint32(off + 16, true);
    const data = new Uint8Array(buf, off + 32, Math.min(size, 256));
    blocks.push({ addr, data: data.slice() });
  }
  blocks.sort((a, b) => a.addr - b.addr);
  if (!blocks.length) throw new Error("no flashable UF2 blocks found");
  return blocks;
}

// --- PICOBOOT device ------------------------------------------------------------
class Picoboot {
  constructor(device) {
    this.dev = device;
    this.epOut = null;
    this.epIn = null;
    this.iface = null;
  }

  async open() {
    await this.dev.open();
    if (this.dev.configuration === null) await this.dev.selectConfiguration(1);
    // The PICOBOOT interface is the vendor-specific one (class 0xFF) with two bulk EPs.
    for (const iface of this.dev.configuration.interfaces) {
      const alt = iface.alternate;
      if (alt.interfaceClass !== 0xff) continue;
      const out = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      const inp = alt.endpoints.find((e) => e.direction === "in" && e.type === "bulk");
      if (out && inp) {
        this.iface = iface.interfaceNumber;
        this.epOut = out.endpointNumber;
        this.epIn = inp.endpointNumber;
        break;
      }
    }
    if (this.iface === null) throw new Error("no PICOBOOT interface — is the panel in BOOTSEL mode?");
    await this.dev.claimInterface(this.iface);
  }

  async close() {
    try { await this.dev.releaseInterface(this.iface); } catch {}
    try { await this.dev.close(); } catch {}
  }

  // Build a 32-byte PICOBOOT command packet.
  _packet(cmdId, transferLen, args) {
    const b = new ArrayBuffer(32);
    const dv = new DataView(b);
    dv.setUint32(0, PICOBOOT_MAGIC, true);
    dv.setUint32(4, token++, true);
    dv.setUint8(8, cmdId);
    dv.setUint8(9, args ? args.byteLength : 0);
    dv.setUint16(10, 0, true);
    dv.setUint32(12, transferLen, true);
    if (args) new Uint8Array(b, 16).set(new Uint8Array(args));
    return b;
  }

  // Command with no data phase: send packet, then read a ZLP ack on IN.
  async _cmd(cmdId, args) {
    await this.dev.transferOut(this.epOut, this._packet(cmdId, 0, args));
    await this.dev.transferIn(this.epIn, 1); // status / ZLP ack
  }

  // Command with an OUT data phase: send packet, send data, read ZLP ack on IN.
  async _cmdWrite(cmdId, args, data) {
    await this.dev.transferOut(this.epOut, this._packet(cmdId, data.byteLength, args));
    await this.dev.transferOut(this.epOut, data);
    await this.dev.transferIn(this.epIn, 1);
  }

  _args(...u32) {
    const b = new ArrayBuffer(16);
    const dv = new DataView(b);
    u32.forEach((v, i) => dv.setUint32(i * 4, v >>> 0, true));
    return b;
  }

  exclusiveAccess() { return this._cmd(CMD.EXCLUSIVE_ACCESS, this._args(1)); } // 1 = EXCLUSIVE
  exitXip() { return this._cmd(CMD.EXIT_XIP); }
  flashErase(addr, size) { return this._cmd(CMD.FLASH_ERASE, this._args(addr, size)); }
  write(addr, data) { return this._cmdWrite(CMD.WRITE, this._args(addr, data.byteLength), data); }
  reboot() { return this._cmd(CMD.REBOOT2, this._args(0, 100, 0, 0)); } // normal reboot, 100ms delay
}

async function flashBlocks(pb, blocks, onProgress) {
  await pb.exclusiveAccess();
  await pb.exitXip();

  // Erase the sector-aligned span covering every write.
  const minAddr = blocks[0].addr & ~(SECTOR - 1);
  const lastEnd = blocks[blocks.length - 1].addr + blocks[blocks.length - 1].data.byteLength;
  const maxAddr = (lastEnd + SECTOR - 1) & ~(SECTOR - 1);
  log(`Erasing 0x${minAddr.toString(16)}…0x${maxAddr.toString(16)} (${(maxAddr - minAddr) / 1024} KiB)`);
  for (let a = minAddr; a < maxAddr; a += SECTOR) await pb.flashErase(a, SECTOR);

  // Write each 256-byte block.
  for (let i = 0; i < blocks.length; i++) {
    const { addr, data } = blocks[i];
    let chunk = data;
    if (chunk.byteLength < WRITE_CHUNK) {
      const padded = new Uint8Array(WRITE_CHUNK).fill(0xff);
      padded.set(chunk);
      chunk = padded;
    }
    await pb.write(addr, chunk);
    onProgress((i + 1) / blocks.length);
  }
  log("Rebooting panel into firmware…");
  try { await pb.reboot(); } catch { /* device drops as it reboots — expected */ }
}

// --- Firmware resolution (latest GitHub Release) --------------------------------
let firmware = { version: null, byRev: {} }; // rev -> uf2 download url

async function resolveFirmware() {
  const rel = await (await fetch(`https://api.github.com/repos/${FW_REPO}/releases/latest`)).json();
  const assets = Object.fromEntries((rel.assets || []).map((a) => [a.name, a.browser_download_url]));
  const manifest = await (await fetch(assets["manifest.json"])).json();
  firmware.version = manifest.version || rel.tag_name;
  for (const a of manifest.artifacts || []) {
    if (assets[a.file]) firmware.byRev[a.rev] = assets[a.file];
  }
  $("fw-version").textContent = firmware.version;
  log(`Firmware release: ${firmware.version} (revs: ${Object.keys(firmware.byRev).join(", ")})`);
}

// --- Verify after flash ---------------------------------------------------------
// After REBOOT2 the panel re-enumerates as the firmware USB-serial device. We can't
// silently re-grab it (WebUSB needs a user gesture per device), so confirm via the
// product string of any already-granted device, else ask the operator to confirm.
async function verifyRev(rev) {
  const want = REV_PRODUCT[rev];
  const granted = await navigator.usb.getDevices();
  const match = granted.find((d) => d.vendorId === RP_VID && (d.productName || "").startsWith(want));
  if (match) {
    setStatus(`Verified: ${match.productName} ✓`, "status-ok");
    log(`Verified panel reports "${match.productName}".`, "status-ok");
  } else {
    setStatus(`Flashed ${rev}. Confirm the panel boots its normal pattern.`, "status-ok");
    log("Flash complete. (Auto-verify needs a re-grant; visually confirm the panel runs.)");
  }
}

// --- UI wiring ------------------------------------------------------------------
let chosenRev = null;

function setupRevButtons() {
  for (const btn of document.querySelectorAll("#rev-group button")) {
    btn.addEventListener("click", () => {
      chosenRev = btn.dataset.rev;
      for (const b of document.querySelectorAll("#rev-group button"))
        b.setAttribute("aria-pressed", String(b === btn));
      $("flash-btn").disabled = !(chosenRev && firmware.byRev[chosenRev]);
      if (chosenRev && !firmware.byRev[chosenRev])
        setStatus(`Latest firmware has no ${chosenRev} build.`, "status-err");
      else setStatus("");
    });
  }
}

async function onFlashClick() {
  if (!chosenRev) return;
  const url = firmware.byRev[chosenRev];
  if (!url) { setStatus(`No firmware for ${chosenRev}.`, "status-err"); return; }

  let device, pb;
  try {
    $("flash-btn").disabled = true;
    setStatus("Requesting panel…");
    device = await navigator.usb.requestDevice({ filters: [{ vendorId: RP_VID }] });

    if (device.productId !== 0x000f) {
      setStatus("That panel is not in BOOTSEL mode.", "status-err");
      log(`Picked device "${device.productName || "?"}" (pid 0x${device.productId.toString(16)}). ` +
          "Unplug it, hold BOOTSEL while plugging back in, then retry.", "status-err");
      $("flash-btn").disabled = false;
      return;
    }

    log(`Downloading firmware ${chosenRev}…`);
    const uf2 = await (await fetch(url)).arrayBuffer();
    const blocks = parseUF2(uf2);
    log(`UF2: ${blocks.length} blocks (${(blocks.length * 256 / 1024).toFixed(0)} KiB).`);

    pb = new Picoboot(device);
    await pb.open();

    const prog = $("progress");
    prog.hidden = false; prog.value = 0;
    setStatus(`Flashing ${chosenRev}…`);
    await flashBlocks(pb, blocks, (f) => { prog.value = Math.round(f * 100); });

    await verifyRev(chosenRev);
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "status-err");
    log(`ERROR: ${err.message}`, "status-err");
    $("flash-btn").disabled = false;
  } finally {
    if (pb) await pb.close();
  }
}

function main() {
  if (!("usb" in navigator)) {
    $("unsupported").style.display = "block";
    $("app").style.display = "none";
    return;
  }
  setupRevButtons();
  $("flash-btn").addEventListener("click", onFlashClick);
  resolveFirmware().catch((e) => {
    $("fw-version").textContent = "unavailable";
    log(`Could not resolve latest firmware: ${e.message}`, "status-err");
  });
}

main();
