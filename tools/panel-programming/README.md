# Panel programming tools (staging)

Streamlined flashing for G6 LED-display panels (RP2350 / RP2354): a `g6-flash`
command-line tool and a zero-install WebUSB browser flasher, fed by CI-published
prebuilt UF2 artifacts. Programs **new (blank)** panels and **re-flashes** old ones,
single or in bench batches.

Full design + rationale: [`docs/development/g6_07-panel-programming.md`](../../docs/development/g6_07-panel-programming.md).

## ⚠ This is a staging directory

These files belong in **two separate submodule repos**, not the parent
`Modular-LED-Display`. They are staged here because this session could only push to
the parent repo. A maintainer with access should relocate them as below, then this
directory can be deleted (leaving only the `g6_07` spec doc as the reference).

| Staged file | Final home |
|---|---|
| `g6_flash.py` | `panel/tools/g6_flash.py` in [`reiserlab/LED-Display_G6_Firmware_Panel`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel) |
| `release.yml` | `.github/workflows/release.yml` in the same firmware repo |
| `flasher/index.html`, `flasher/flasher.js` | `flasher/` in [`reiserlab/webDisplayTools`](https://github.com/reiserlab/webDisplayTools) (served via GitHub Pages) |

### Firmware repo `pixi.toml` additions

Add the `picotool` dependency and convenience tasks (replacing the hardcoded-serial
demo tasks `deploy21a` / `deploy31a`):

```toml
[dependencies]
picotool = "*"          # conda-forge

[tasks]
flash21 = "python panel/tools/g6_flash.py --rev v0.2.1"
flash31 = "python panel/tools/g6_flash.py --rev v0.3.1"
```

The legacy `deploy.sh` / `deploy_all.sh` stay for the firmware-developer `pio` flow.

## Quick reference

**CLI** (Linux; needs `picotool` on PATH):

```sh
python g6_flash.py --rev v0.3.1                # flash all connected v0.3.1 panels (latest fw)
python g6_flash.py --rev v0.2.1 --port 3-1.4   # one board on a specific USB port
python g6_flash.py --rev v0.3.1 --uf2 <file>   # flash a local UF2 build
python g6_flash.py --list                      # list connected panels
python g6_flash.py --help                      # all options (incl. --no-exec, --jobs, --force)
```

Handles both new and old panels: it uses `picotool` to reboot a running panel into
BOOTSEL automatically, and flashes blank/BOOTSEL boards directly. `--rev` is mandatory
(the two hardware revs need different binaries and can't be told apart on a blank
board); every flash is verified afterwards via the panel's USB product string.

Batch ceiling is ~10–20 panels per **externally-powered** USB hub — the limit is
post-flash LED inrush + re-enumeration, not flashing. Use `--no-exec` for larger trays
and power-cycle in small groups.

**Web flasher**: open `flasher/index.html` over https (GitHub Pages) in **Chrome/Edge**,
pick the rev, put the panel in BOOTSEL (hold BOOTSEL while plugging in USB), click flash.

## Status / TODO

Reference implementation; **not yet validated against hardware**, and the default
download path needs the first `panel-fw-v*` firmware release to exist. See the
"Open Questions / TBDs" in [`g6_07-panel-programming.md`](../../docs/development/g6_07-panel-programming.md)
(PCB silkscreen marking, picoflash integration, bench validation against the two known
panels).
