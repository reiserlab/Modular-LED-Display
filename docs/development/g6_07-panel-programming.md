# G6 — Panel Programming (flashing tools)

Source: G6 panel programming streamlining work; grounds against [`reiserlab/LED-Display_G6_Firmware_Panel`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel) (`panel/platformio.ini`, `panel/tools/g6_flash.py`, `pixi.toml`).
Status: **Specified** — `g6-flash` CLI and the release/diag build pipeline live in
`panel/tools/` (firmware repo); the WebUSB flasher lives in webDisplayTools' `flasher/`.
End-to-end hardware validation and cutting the first `panel-fw-v*` release are still open
(see Open Questions / TBDs).

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

### Why not the retired `deploy*.sh`

`panel/tools/deploy.sh` / `deploy_all.sh` used to drive `pio … -t upload` and matched
panels only in **USB-serial mode** — so they **could not flash a blank/BOOTSEL board**
(the common case for a freshly assembled panel), required a full PlatformIO build env,
and `deploy_all.sh` flashed sequentially. The tools below use **`picotool`**, which can
reboot a running panel into BOOTSEL itself (`reboot -f -u`) *and* flash a board already
in BOOTSEL — one code path for both new and old panels — and consume prebuilt UF2s so no
build env is needed. Both scripts have since been retired: their functionality (build a
local env, flash one panel by USB serial or all panels of a rev) now lives in `g6-flash`
itself, driven by the `deploy*`/`deploy*a`/`deploy*a-diag` pixi tasks (`pixi.toml`).

---

## A. Firmware release artifacts (shared foundation)

CI builds and publishes per-rev UF2s so neither tool needs PlatformIO.

- Workflow: `.github/workflows/release.yml` in the firmware repo. Triggers on tag
  `panel-fw-v*` (and manual dispatch).
- The release catalog isn't a hardcoded list — `panel/tools/build_release.py`
  discovers it from `panel/platformio.ini` itself: an env belongs to the
  **release** group if it `extends = common` (a deployable hardware-rev
  build — currently `pico_v021`, `pico_v031`); an env that instead `extends`
  another `pico_v*` env (`_bcmtest`, `_spidiag`, or any future variant)
  belongs to the separate **diag** group (`pixi run diag`) —
  bench/diagnostic builds, never published by CI, which only ever runs
  `pixi run release`. Adding a new hardware rev or variant to
  `platformio.ini` with the right `extends` is the only thing needed for it
  to show up in the right group automatically. CI installs pixi
  (`prefix-dev/setup-pixi`, `locked: true`) instead of a separate
  `pip install platformio`, so it resolves the exact same PlatformIO (and
  Python) versions as running `pixi run release` on a bench machine, and a
  developer can preview the whole release payload locally before ever
  pushing a tag. The build already runs `tools/gen_predef_patterns.py` and
  enforces the 2 MiB cap, so a broken/oversize image fails before it's ever
  staged.
- Release assets: `g6-panel-v0.2.1.uf2`, `g6-panel-v0.3.1.uf2`, their ISP-footer
  `.bin` counterparts (`pixi run release` always builds both formats — one build
  pipeline, not two), and a **`manifest.json`**:

  ```json
  { "version": "panel-fw-v1.0.0",
    "artifacts": [
      { "rev": "v0.2.1", "env": "pico_v021", "variant": "production",
        "label": "v0.2.1 — Production", "usb_product": "G6 Panel v0.2", "default": false,
        "uf2": { "file": "g6-panel-v0.2.1.uf2", "sha256": "…" },
        "bin": { "file": "g6-panel-v0.2.1.bin", "sha256": "…" } },
      { "rev": "v0.3.1", "env": "pico_v031", "variant": "production",
        "label": "v0.3.1 — Production", "usb_product": "G6 Panel v0.3", "default": true,
        "uf2": { "file": "g6-panel-v0.3.1.uf2", "sha256": "…" },
        "bin": { "file": "g6-panel-v0.3.1.bin", "sha256": "…" } } ] }
  ```

  `usb_product` drives post-flash verification; `sha256` is checked on download. `bin` is the
  ISP-footer image for the arena controller's over-SPI push — that path is out of scope for this
  doc (see [`g6_03-controller.md`](g6_03-controller.md) § Panel firmware update (ISP)) —
  `g6-flash`/the WebUSB flasher only ever look at `uf2`.

## B. `g6-flash` CLI (bench)

Location: `panel/tools/g6_flash.py` (firmware repo). Python 3, stdlib-only; needs `picotool`, which is
**not** a conda-forge package so it isn't a pinned `pixi.toml` dependency — the tool
prefers the copy PlatformIO already vendors under `~/.platformio/packages/tool-picotool*/`
(present for anyone who's run `pixi run release`/`diag`, which build via `pio`
under the hood), falling back to PATH. Linux (enumerates via sysfs, like the by-id scripts).

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

The firmware repo's `pixi.toml` wraps this into `flash21-github-release`/`flash31-github-release`
(flash the latest published release, no local build) and `flash21`/`flash31` (build
the full release catalog first via `depends-on = ["release"]`, then flash the resulting
`dist/g6-panel-<rev>.uf2`) — see `pixi.toml`'s own comments for the exact task definitions.

## C. WebUSB browser flasher (nontechnical users)

Location: `flasher/` in [`reiserlab/webDisplayTools`](https://github.com/reiserlab/webDisplayTools),
served over GitHub Pages (WebUSB requires a secure context). **Chromium/Edge only.** This
section describes the core design (WebUSB/PICOBOOT mechanics); the live tool's UI/catalog
features (build dropdown grouping, local dev builds, etc.) have continued to evolve past it —
see `flasher/flasher.js` itself for current behavior.

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
  manifest's `usb_product` (`G6 Panel v0.2` / `v0.3`), so a wrong-rev flash is caught
  immediately on the bench rather than in an arena.
- PCB-identification guidance is shown in both UIs.

---

## Current state

`g6-flash` (`panel/tools/g6_flash.py`), the release/diag build pipeline
(`panel/tools/build_release.py`, `.github/workflows/release.yml`, `pixi.toml`), and the
WebUSB flasher (webDisplayTools `flasher/`) are implemented in their final homes (`picotool`
is not pinned as a `pixi.toml` dependency — see §B). No firmware release has been cut yet,
so the tools' default download path is untested until the first `panel-fw-v*` tag.

## Open Questions / TBDs

- **PCB silkscreen rev marking** — confirm the exact location/text of the v0.2.1 / v0.3.1
  marking from `Generation 6/Panels` and add it (plus a photo) to the web help panel.
- **picoflash integration** — decide whether to import picoflash's PICOBOOT module
  directly or keep the thin reimplementation in `flasher/flasher.js`; validate the
  framing against real RP2350 hardware and the picoflash reference.
- **End-to-end hardware validation** — verify against the two bench panels
  (`319A5199EE357F77` v0.2.1, `A5D4B82BA2B9FB51` v0.3.1): a re-flash of a running board
  (cross-checked vs a direct `g6_flash.py --serial <SERIAL>` call), and a blank/BOOTSEL
  board (the new capability), plus the rev-guard abort path.
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
  `panel/tools/g6_flash.py`, `pixi.toml`.
