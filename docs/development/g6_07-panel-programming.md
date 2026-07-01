# G6 — Panel Programming (flashing tools)

Source: G6 panel programming streamlining work; grounds against [`reiserlab/LED-Display_G6_Firmware_Panel`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel) (`panel/platformio.ini`, `panel/tools/deploy*.sh`, `pixi.toml`).
Status: **Specified** — design + reference implementation staged at [`tools/panel-programming/`](../../tools/panel-programming/); pending relocation into the firmware/web submodule repos and end-to-end hardware validation.

This file specifies how G6 panels get their firmware: a `g6-flash` command-line tool
and a zero-install WebUSB browser flasher, both fed by CI-published, prebuilt UF2
artifacts. It covers programming **new (blank)** panels and **re-flashing** existing
ones, single panels and bench batches (~10–20 per powered hub). In-arena ISP-over-SPI
(panel protocol opcodes `0xE0–0xE4`, controller `0x41`, see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md))
is a separate, future path and out of scope here.

---

## What makes this easy (and the one hard part)

- **RP2350 / RP2354** MCU with a native **BOOTSEL** USB bootloader (UF2 + PICOBOOT).
  No external programmer (SWD/J-Link) is needed.
- **Panels are stateless.** No per-panel ID or address is burned in — every panel of a
  given hardware revision gets the **identical** binary. Panel addressing is the arena
  controller's job at runtime (`(spi_bus, cs_gpio)` per [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md)).
  So there is **no provisioning step**.
- **The one footgun: hardware revision.** The two revs need different binaries —
  `pico_v021` → **v0.2.1**, `pico_v031` → **v0.3.1** (`panel/platformio.ini`) — and the
  rev **cannot be detected over USB on a blank board** (the USB product string only
  reflects the *currently running* firmware). Rev selection is therefore unavoidable
  human input, but it is **once per batch**, not per panel, and every flash is
  **verified afterwards** by reading back the panel's USB product string.

USB identities (from `panel/platformio.ini`): VID `0x2E8A`; running firmware PID
`0x0009` (USB-serial, product `G6 Panel v0.2` / `G6 Panel v0.3`); BOOTSEL PID `0x000f`
(mass-storage + PICOBOOT).

### Why not the existing `deploy*.sh`

`panel/tools/deploy.sh` / `deploy_all.sh` drive `pio … -t upload` and match panels only
in **USB-serial mode** — so they **cannot flash a blank/BOOTSEL board** (the common case
for a freshly assembled panel), require a full PlatformIO build env, and `deploy_all.sh`
is sequential. The tools below use **`picotool`**, which can reboot a running panel into
BOOTSEL itself (`reboot -f -u`) *and* flash a board already in BOOTSEL — one code path for
both new and old panels — and consume prebuilt UF2s so no build env is needed. The legacy
scripts remain for the firmware-developer `pio` flow.

---

## A. Firmware release artifacts (shared foundation)

CI builds and publishes per-rev UF2s so neither tool needs PlatformIO.

- Workflow: `.github/workflows/release.yml` in the firmware repo (reference copy at
  [`tools/panel-programming/release.yml`](../../tools/panel-programming/release.yml)).
  Triggers on tag `panel-fw-v*` (and manual dispatch).
- Matrix over the **production envs only** (`pico_v021`, `pico_v031` — never the
  `_bcmtest` / `_spidiag` bench builds, which carry a `*** DO NOT DEPLOY ***` banner).
  Build via `pio run -d panel -e <env>`; the build already runs
  `tools/gen_predef_patterns.py` and enforces the 2 MiB cap, so a broken/oversize image
  fails in CI.
- Release assets: `g6-panel-v0.2.1.uf2`, `g6-panel-v0.3.1.uf2`, and a **`manifest.json`**:

  ```json
  { "version": "panel-fw-v1.0.0",
    "artifacts": [
      { "rev": "v0.2.1", "env": "pico_v021", "file": "g6-panel-v0.2.1.uf2",
        "sha256": "…", "usb_product": "G6 Panel v0.2" },
      { "rev": "v0.3.1", "env": "pico_v031", "file": "g6-panel-v0.3.1.uf2",
        "sha256": "…", "usb_product": "G6 Panel v0.3" } ] }
  ```

  `usb_product` drives post-flash verification; `sha256` is checked on download.

## B. `g6-flash` CLI (bench)

Reference: [`tools/panel-programming/g6_flash.py`](../../tools/panel-programming/g6_flash.py);
final home `panel/tools/g6_flash.py`. Python 3, stdlib-only; needs `picotool` on PATH
(add to `pixi.toml [dependencies]`, conda-forge has it). Linux (enumerates via sysfs,
like the by-id scripts).

Per panel: if it is running firmware, `picotool reboot -f -u --bus B --address A` →
wait for BOOTSEL; then `picotool load [-x] --bus B --address A <uf2>`; then (when executed)
wait for re-enumeration as PID `0x0009` and confirm the product string matches `--rev`.

- **Identity = sysfs USB port path** (e.g. `3-1.4`), which is stable across the
  BOOTSEL↔app re-enumeration; bus/address (busnum/devnum) target picotool.
- `--rev {v0.2.1,v0.3.1}` is **mandatory**. A running board whose current product string
  disagrees with `--rev` triggers a loud abort (override with `--force`).
- Batch: enumerate all VID-`0x2E8A` boards, flash in parallel (`--jobs`, default 4),
  end-of-run summary. **Realistic ceiling ~10–20 panels per externally-powered hub** —
  the limit is post-flash LED-matrix inrush + USB re-enumeration, not flashing. `--no-exec`
  loads without running, so trays can be power-cycled in small groups.
- Firmware source: default = latest GitHub Release (manifest + sha256-checked UF2, cached
  under `~/.cache/g6-flash/`); `--fw-version <tag>` pins a release; `--uf2 <path>` flashes
  a local build.

```sh
g6_flash.py --rev v0.3.1                 # re-flash all connected v0.3.1 panels, latest fw
g6_flash.py --rev v0.2.1 --port 3-1.4    # one board on a specific USB port
g6_flash.py --rev v0.3.1 --uf2 panel/.pio/build/pico_v031/firmware.uf2   # local build
g6_flash.py --list                       # show connected panels
```

Suggested `pixi.toml` tasks (replacing the hardcoded-serial demo tasks):
`flash21 = "python panel/tools/g6_flash.py --rev v0.2.1"`,
`flash31 = "python panel/tools/g6_flash.py --rev v0.3.1"`.

## C. WebUSB browser flasher (nontechnical users)

Reference: [`tools/panel-programming/flasher/`](../../tools/panel-programming/flasher/);
final home `flasher/` in [`reiserlab/webDisplayTools`](https://github.com/reiserlab/webDisplayTools),
served over GitHub Pages (WebUSB requires a secure context). **Chromium/Edge only.**

A standalone static page (plain HTML + ES module, no build step), separate from the
existing Web *Serial* arena console — bootloader flashing needs Web **USB** (the RP2350
PICOBOOT vendor interface), not Web Serial, and browsers cannot use the UF2 mass-storage
drag-drop. The page parses the UF2 client-side and streams its 256-byte blocks over
PICOBOOT (`EXCLUSIVE_ACCESS → EXIT_XIP → FLASH_ERASE → WRITE → REBOOT2`). Modeled on
[`piersfinlayson/picoflash`](https://github.com/piersfinlayson/picoflash) (MIT, proven
RP2350 over WebUSB).

Operator flow: pick rev (no default; inline help on reading the PCB rev) → put panel in
BOOTSEL and click **Connect & flash** → progress → verify (re-reads product string, or
asks for a visual confirm if a re-grant gesture is needed). Firmware UF2s are fetched from
the latest release via the same `manifest.json`, so the page auto-tracks new firmware.

## D. Rev-mismatch safety (both tools)

- Mandatory, deliberate rev selection; neither tool guesses.
- Both read back the post-flash USB product string and prefix-match it against the
  manifest's `usb_product` (`G6 Panel v0.2` / `v0.3`, same casing as `deploy.sh`), so a
  wrong-rev flash is caught immediately on the bench rather than in an arena.
- PCB-identification guidance is shown in both UIs.

---

## Current state

Design and reference implementations are complete and staged in the parent repo at
[`tools/panel-programming/`](../../tools/panel-programming/) (the firmware and webDisplayTools
submodules are separate repos). A maintainer relocates them to their final homes —
`panel/tools/g6_flash.py`, `.github/workflows/release.yml`, webDisplayTools `flasher/` —
and adds the `picotool` dependency + `flash*` tasks to the firmware `pixi.toml`. No
firmware release has been cut yet, so the tools' default download path is untested until
the first `panel-fw-v*` tag.

## Open Questions / TBDs

- **PCB silkscreen rev marking** — confirm the exact location/text of the v0.2.1 / v0.3.1
  marking from `Generation 6/Panels` and add it (plus a photo) to the web help panel.
- **picoflash integration** — decide whether to import picoflash's PICOBOOT module
  directly or keep the thin reimplementation in `flasher/flasher.js`; validate the
  framing against real RP2350 hardware and the picoflash reference.
- **End-to-end hardware validation** — verify against the two bench panels
  (`319A5199EE357F77` v0.2.1, `A5D4B82BA2B9FB51` v0.3.1): a re-flash of a running board
  (cross-checked vs `pixi run deploy31a`), and a blank/BOOTSEL board (the new capability),
  plus the rev-guard abort path.
- **Optional** — a firmware serial command to reboot-to-BOOTSEL would let the web tool
  auto-enter BOOTSEL via a Web Serial pre-step, removing the manual hold-BOOTSEL step.

## Cross-references

- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — panel protocol; ISP `0xE0–0xE4`
  (the separate in-arena programming path, out of scope here).
- [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md) — panel
  addressing is controller-side `(spi_bus, cs_gpio)`; panels carry no ID.
- [`g6_05-host-software.md`](g6_05-host-software.md) — host transports; webDisplayTools
  Web Serial console (distinct from this WebUSB flasher).
- Firmware build/flash: `Generation 6/Panel-Firmware/README.md`, `panel/platformio.ini`,
  `panel/tools/deploy.sh`, `pixi.toml`.
