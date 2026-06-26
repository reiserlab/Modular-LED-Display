# Panel-programming handoff — finishing & testing

Continuation guide for finishing the streamlined panel-programming work
(PR [reiserlab/Modular-LED-Display#60](https://github.com/reiserlab/Modular-LED-Display/pull/60))
in a local session. Full design: [`docs/development/g6_07-panel-programming.md`](../../docs/development/g6_07-panel-programming.md).

## What exists now

Staged in this directory (`tools/panel-programming/`) on branch
`claude/panels-programming-streamline-2h5f8c`:

| File | Final home | Status |
|---|---|---|
| `g6_flash.py` | `panel/tools/g6_flash.py` (firmware repo) | compiles + `--help` OK; **not hardware-tested**; **Linux-only** (see caveat) |
| `release.yml` | `.github/workflows/release.yml` (firmware repo) | valid YAML; never run |
| `flasher/index.html`, `flasher/flasher.js` | `flasher/` (webDisplayTools repo) | `node --check` OK; **not hardware-tested**; fetches firmware from Release only |
| `g6_07-panel-programming.md` | stays in `docs/development/` | reference spec |

Firmware repo: `reiserlab/LED-Display_G6_Firmware_Panel` (`Generation 6/Panel-Firmware`).
Web repo: `reiserlab/webDisplayTools` (`Generation 6/webDisplayTools`).

## ⚠ macOS caveat

`g6_flash.py` enumerates panels via Linux **sysfs** (`/sys/bus/usb/devices`), which
does **not** exist on macOS.
- ✅ WebUSB flasher → cross-platform (test in Chrome/Edge on the Mac).
- ✅ `picotool` itself → works on macOS (`brew install picotool`); manual single-panel
  flashing works.
- ❌ `g6_flash.py` batch CLI → run it on the **Linux bench machine** (where `deploy*.sh`
  already run), or ask Claude to refactor enumeration to use `picotool info` (cross-platform).

## Steps

### 1. Cut the first firmware release (unblocks both tools' default download path)
In `reiserlab/LED-Display_G6_Firmware_Panel`:
```sh
mkdir -p .github/workflows
cp <this-repo>/tools/panel-programming/release.yml .github/workflows/release.yml
git add .github/workflows/release.yml && git commit -m "Add firmware release workflow"
git push
git tag panel-fw-v0.0.1 && git push origin panel-fw-v0.0.1
```
Confirm the Action publishes `g6-panel-v0.2.1.uf2`, `g6-panel-v0.3.1.uf2`, and
`manifest.json` to a GitHub Release. If the build can't find Python for
`tools/gen_predef_patterns.py`, the `setup-python` step in the workflow covers it.

### 2. Relocate the tools into their real repos
- `g6_flash.py` → firmware `panel/tools/g6_flash.py`.
- Add to firmware `pixi.toml`:
  ```toml
  [dependencies]
  picotool = "*"          # conda-forge

  [tasks]
  flash21 = "python panel/tools/g6_flash.py --rev v0.2.1"
  flash31 = "python panel/tools/g6_flash.py --rev v0.3.1"
  ```
- `flasher/` → webDisplayTools `flasher/`; enable GitHub Pages for that repo.
- Once relocated, delete `tools/panel-programming/` here (keep the `g6_07` spec doc).

### 3. Test the WebUSB flasher (Mac, Chrome) — most user-facing
Needs step 1 done first (it fetches the UF2 from the latest Release). Then: open the
Pages URL → pick rev → hold the panel's **BOOTSEL** button while plugging in USB →
**Connect & flash** → confirm the green "Verified: G6 Panel vX.Y ✓" line.
- If you want to test *before* cutting a release, ask Claude to add a "load local .uf2"
  file picker to `flasher.js` (small change).

### 4. Test the CLI (Linux bench) against the two known panels
Panels: `319A5199EE357F77` (v0.2.1), `A5D4B82BA2B9FB51` (v0.3.1).
```sh
# needs picotool on PATH (pixi run, or conda-forge picotool)
python panel/tools/g6_flash.py --list                       # see connected panels
python panel/tools/g6_flash.py --rev v0.3.1                  # re-flash running panel(s), latest fw
python panel/tools/g6_flash.py --rev v0.2.1 --uf2 panel/.pio/build/pico_v021/firmware.uf2
```
Validate:
1. **Re-flash a running panel** — cross-check against `pixi run deploy31a`.
2. **Blank/BOOTSEL panel (new capability)** — hold BOOTSEL while plugging in so it
   enumerates as PICOBOOT, then `--rev` flashes it with no `pio` and no serial.
3. **Rev guard** — wrong `--rev` on a running board → loud abort (override `--force`).
4. **Post-flash verify** — tool confirms the panel re-enumerates with the expected
   `G6 Panel vX.Y` product string.
5. Optional visual: flash a `*_bcmtest` env UF2 (30-s BCM self-test), then re-flash
   production (bcmtest has no SPI ingest — do not leave it on a deployed panel).

## Open items (also in g6_07 § Open Questions)
- Confirm the exact PCB silkscreen rev marking (from `Generation 6/Panels`) and add it
  (plus a photo) to the web flasher's help panel.
- Decide: import `piersfinlayson/picoflash`'s PICOBOOT module vs. keep the thin
  reimplementation in `flasher.js`; validate framing against real RP2350 hardware.
- Optional: a firmware serial "reboot to BOOTSEL" command so the web tool can auto-enter
  BOOTSEL via a Web Serial pre-step (removes the manual hold-BOOTSEL step).

## Paste-in prompt for the local session
> Continue the G6 panel-programming work from PR reiserlab/Modular-LED-Display#60.
> Read `tools/panel-programming/HANDOFF.md` and `docs/development/g6_07-panel-programming.md`.
> Do: (1) add `release.yml` to the firmware repo's `.github/workflows/` and cut a
> `panel-fw-v0.0.1` release; (2) relocate `g6_flash.py` and `flasher/` into the firmware
> and webDisplayTools repos with the `pixi.toml` additions; (3) help me test the WebUSB
> flasher in Chrome and the CLI against panels `319A5199EE357F77`/`A5D4B82BA2B9FB51`.
> I'm on macOS — `g6_flash.py` currently needs Linux (sysfs); offer to make it
> cross-platform if useful.
