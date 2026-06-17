# G6 development docs (Phase 1)

This directory holds the G6 specification dev docs. It is **excluded from the Jekyll site** (`_config.yml`) and is not for public consumption. Once the docs stabilize, content gets distilled into 2–3 public-facing pages alongside `docs/g6_system.md` (Phase 2 — deferred until the dev set is explicitly called stable).

All Phase-1 files are prefixed `g6_` so a future second generation of dev material can sit alongside without confusion.

## How to read these docs

Each `g6_*.md` file opens with a two-line plain-prose header (source attribution + status), followed by the body, then a "Current state" / "Open Questions / TBDs" section, then "Cross-references". The git log is the audit trail — these docs carry forward-looking facts only, not history.

Implementation-readiness is the design goal: a firmware author or future Claude session should be able to open any of these and have everything they need to build against, with no archeology. **Cross-cutting documentation conventions for this repo are in [`/CLAUDE.md`](../../CLAUDE.md).**

## File status

| File | Source tab(s) | Status | Implementation evidence |
|---|---|---|---|
| [`g6_00-architecture.md`](g6_00-architecture.md) | Introduction | **Draft** | — |
| [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) | Panel Version 1 / 2 / 3 / 4 / Version Summary | **Specified (v1) + Teaser (v2/v3) + Stub (v4/v5)** | v1 firmware: [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel); v3 prototype: [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) |
| [`g6_02-led-mapping.md`](g6_02-led-mapping.md) + [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) | Panel LED Mappings + panel hardware reference | **Specified for panel v0.2 + v0.3** | Hardware: [`reiserlab/LED-Display_G6_Hardware_Panel`](https://github.com/reiserlab/LED-Display_G6_Hardware_Panel); v0.2 cross-checked against `g6_firmware_devel/panel/src/constants.cpp`. v0.2/v0.3 LED designator tables verified identical to v0.1 (extracted from KiCad). |
| [`g6_03-controller.md`](g6_03-controller.md) | Controller Teensy SW + Major updates for v2 + v3 and onwards | **Draft (v1) + Teaser (v2) + Stub (v3+)** | G4 baseline: [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim). No G6 controller firmware yet. |
| [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) | Pattern Format / Panel Map (merged) | **v2 canonical** | [`Generation 6/maDisplayTools/g6/g6_save_pattern.m`](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m); JS round-trip via [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) |
| [`g6_05-host-software.md`](g6_05-host-software.md) | Host PC Matlab SW | **Stub (firmware-contract framing)** | Authoritative host docs: `Generation 6/maDisplayTools/docs/*.md`. |
| [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md) | G6 arena design (v1/v2) | **Thin firmware-interface reference** | Production arena: [`reiserlab/LED-Display_G6_Hardware_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) v1.1.7. |
| [`g6_arena_configs.h`](g6_arena_configs.h) | — (controller-side panel map, keyed by Arena ID) | **Codegen-emitted** | Generated from [`Generation 6/maDisplayTools/`](../../Generation%206/maDisplayTools/) `configs/arena_registry/index.yaml` + `configs/arenas/G6_*.yaml` + `configs/arena_hardware/<profile>.yaml` via [`tools/gen_arena_configs.py`](../../Generation%206/maDisplayTools/tools/gen_arena_configs.py). Includes G6_2x10 and G6_2x8of10 (sharing `arena_10-10_v1p1r7` hardware profile); G6_3x12of18 skipped (no 18-col hardware). Unvalidated against firmware end-to-end. |

Status values: `Specified` (concrete enough to implement against), `Draft` (mostly there, gaps marked), `Teaser` (sketched), `Stub` (placeholder).

## Conventions

- **No Jekyll front matter or `{:toc}`.** These files are not published. Front matter is added at Phase 2.
- **Verbatim on technical content** — every byte, opcode, payload size, table row, worked example, parity rule, and named external entity from the source spec must round-trip into the migrated file.
- **Flag, don't smooth over** — wherever the source is inconsistent or omits an implementation-blocking detail, insert an inline `> **⚠ Flag — …**` callout.
- **Cross-tab references become Markdown links** — when a source tab points at "see Pattern File Format tab", the migration replaces it with a link to the appropriate `g6_*.md` file.

## Sources cited from these docs

- **Primary spec source:** [`G6 panels protocol v1 proposal`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit) (Google Doc, multi-tab).
- **Precursor message-format proposal** (cited where v1 diverges or where the precursor flagged still-relevant design questions): [`G6 message format proposal`](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit).
- **v1 panel firmware (authoritative for v1 reconciliation):** [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel).
- **v3 proof-of-concept (not a v1 reference):** [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — debug test code that proved BCM-via-PIO, gating, and the experimental `PIXEL` command on G6 panels v0.2.1 / v0.3.1. Not deployable.
- **G4.1 slim controller (G4 baseline):** [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim).
- **G6 submodule docs in the public Jekyll site** — authoritative for their own scope; cross-link out rather than restate:
  - `Generation 6/Arena/docs/arena.md` (hardware revisions)
  - `Generation 6/maDisplayTools/docs/g6_quickstart.md`, `sd_card_deployment_notes.md`, `experiment_pipeline_guide.md`, `pattern_library_convention.md`, `pattern_tools_quickstart.md`, `patterns.md`
  - `Generation 6/webDisplayTools/` (browser tools usage)

## Phase 2 (deferred — do not start)

Once the dev set has stabilized, Phase 2 consolidates everything into 2–3 public-facing docs at `docs/` (likely `docs/g6_protocol.md` covering panel + pattern + panel-map + LED-mapping, plus `docs/g6_implementation.md` covering controller + host, optionally folding into the existing `docs/g6_system.md` overview). Phase 2 also adds Jekyll front matter, status banners, and `{:toc}`. Do not begin Phase 2 until the user explicitly calls the dev docs stable.
