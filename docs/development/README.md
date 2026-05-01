# G6 development docs (Phase 1)

This directory (`docs/development/`) holds work-in-progress G6 specification docs. It is **excluded from the Jekyll site** (`_config.yml`) and is not for public consumption. Once the docs stabilize, content gets distilled into 2–3 public-facing pages alongside `docs/g6_system.md` (Phase 2). All Phase-1 files are prefixed `g6_` so a future second generation of dev material can sit alongside without confusion — though right now everything in here is G6. The path matches the convention used by `Generation 6/maDisplayTools/docs/development/` and `Generation 6/webDisplayTools/docs/development/`.

## How to read these docs

Source of truth right now is the multi-tab Google Doc **"G6 panels protocol v1 proposal"** ([Drive](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit), owner `loeschef@janelia.hhmi.org`, last modified 2026-01-15). The Phase-1 files break that doc into focused topical pieces, preserving every byte/opcode/table verbatim and adding `⚠ Flag` callouts wherever the source is inconsistent, hand-wavy, or omits a detail needed to implement.

Each file opens with a three-line plain-prose header — source tab + last-reviewed date, and a status — followed by the body, then a "Current state" block (linking to the relevant firmware repo and what's been verified), then the migrated content with inline flags, then a consolidated "Open Questions / TBDs" section.

## File status

| File | Source tab(s) | Status | Implementation evidence |
|---|---|---|---|
| [`g6_00-architecture.md`](g6_00-architecture.md) | Introduction | _not yet migrated_ | — |
| [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) | Panel Version 1 / 2 / 3 / 4 / Version Summary | _not yet migrated_ | v1 ↔ [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel); v3 ↔ [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) (proof-of-concept only) |
| [`g6_02-led-mapping.md`](g6_02-led-mapping.md) | Panel LED Mappings | _not yet migrated_ | Hardware: `Generation 6/Panels/` (production `v0p2r0`; `v0.3.0` in draft) |
| [`g6_03-controller.md`](g6_03-controller.md) | Controller Teensy SW + Major updates for v2 + v3 and onwards | _gated on G4.1-slim review_ | G4 baseline: [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) |
| [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) | Pattern Format / Panel Map | _not yet migrated_ | Compare against `LED-Display_G4.1_ArenaController_Slim/src/PatternHeader.h` |
| [`g6_05-panel-map.md`](g6_05-panel-map.md) | Panel Map proposal | _not yet migrated_ | — |
| [`g6_06-host-software.md`](g6_06-host-software.md) | Host PC Matlab SW | _not yet migrated_ | Reconcile with `Generation 6/maDisplayTools/docs/g6_quickstart.md` and `sd_card_deployment_notes.md` |
| _Arena firmware interface_ | G6 arena design (v1/v2) | _decision deferred_ | Source tab is superseded by the built arena hardware (v1.1.7); a thin firmware-relevant arena reference will be added only if the controller doc surfaces an actual gap |

Status values: `Specified` (concrete enough to implement against), `Draft` (mostly there, gaps marked), `Teaser` (sketched), `Stub` (placeholder). v1 sections may upgrade to `Specified — implementation verified` once reconciled against `iorodeo/g6_firmware_devel`.

## Doc-by-doc review loop

Each file goes through a four-step loop, with explicit user sign-off before moving on to the next:

1. **Migrate** — produce the file from the Google Doc tab(s), verbatim on technical content (every byte, every opcode, every table row), with inline `⚠ Flag` callouts for inconsistencies/gaps and an Open Questions section.
2. **Reconcile current state** — check against the relevant firmware/code: `iorodeo/g6_firmware_devel` for v1 protocol, `LED-Display_G4.1_ArenaController_Slim` for the controller, `Generation 6/maDisplayTools/` for the host workflow, `Generation 6/Arena/docs/arena.md` for arena hardware, `G6_Panels_Test_Firmware` for v3 prototype-level claims only.
3. **Update status** — refine the file's status line, refresh the "Current state" block, and consolidate the Open Questions list.
4. **Sign-off** — review with the user; incorporate feedback before the next file.

For `g6_01-panel-protocol.md` specifically the loop sub-divides by version: v1 first (because it sets all the wire-format conventions and is the only version with deployable firmware), then v2 (PSRAM + indexed display), then v3 (gated/persistent + BCM reconciliation against the test-rig firmware), then v4/v5 sketches.

## Sources cited from these docs

- **Primary spec source**: [`G6 panels protocol v1 proposal`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit) (Google Doc, multi-tab; 2523 lines as exported).
- **Precursor message-format proposal** (cited where v1 diverges from upstream wording or where the precursor flagged design questions still relevant today): [`G6 message format proposal`](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) (will@iorodeo.com, ~18 KB).
- **v1 panel firmware (authoritative for v1 reconciliation)**: [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — Will Dickson's G6 panel firmware development repo. Last push 2026-02-12. Top-level `panel/` and `test_arena/`. Not yet a submodule of this repo.
- **v3 proof-of-concept / test rig (NOT a v1 reference)**: [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) (with `iorodeo/` upstream) — debug-style test code that proved BCM-via-PIO, gating, and the experimental `PIXEL` command on G6 panels v0.2.1 / v0.3.1. Hosts the AD3 capture tooling used for timing characterization. **Explicitly not deployable, not the v1 implementation.**
- **G4.1 slim controller (G4 baseline for the controller doc)**: [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) — PlatformIO Teensy project with `CommandProcessor`, `NetworkManager` (Ethernet/UDP host link), `SpiManager`, `SdManager`, `commands.h`, `modes.h`, `PatternHeader.h`, `timing.md` (~93 KB).
- **G6 submodule docs already published in the public Jekyll site** — these are authoritative for their own scope and the Phase-1 files cross-link out rather than restate:
  - `Generation 6/Arena/docs/arena.md` (hardware revisions, board files, errata)
  - `Generation 6/Hardware/docs/test-arena.md` (Test Arena, historical)
  - `Generation 6/maDisplayTools/docs/g6_quickstart.md`, `sd_card_deployment_notes.md`, `experiment_pipeline_guide.md`, `pattern_library_convention.md`, `pattern_tools_quickstart.md`, `patterns.md`
  - `Generation 6/webDisplayTools/` (browser tools usage)

## Conventions

- **No Jekyll front matter, no `{:toc}`, no formal status banner block.** These files are not published. Front matter and TOC are added at Phase 2 when content moves out of `docs/development/` and into the published portion of `docs/`.
- **Verbatim on technical content** — every byte, opcode, payload size, table row, worked example, parity rule, and named external entity from the source doc must round-trip into the migrated file. Editorial changes are limited to fixing Google-Doc artifacts (smart quotes, escaped backslashes, malformed lists), normalizing headings, and converting tables to Markdown.
- **Flag, don't smooth over** — wherever the source is inconsistent, hand-wavy, or omits an implementation-blocking detail, insert an inline `> **⚠ Flag — …** <description>` callout. The whole point of Phase 1 is to surface these.
- **Cross-tab references become Markdown links** — when a source tab points at "see Pattern File Format tab", the migration replaces it with a link to the appropriate `g6_*.md` file.

## Phase 2 (deferred — do not start)

Once the dev set has been reviewed end-to-end and the content has stabilized, Phase 2 consolidates everything down to 2–3 public-facing docs at the published level of `docs/` (likely `docs/g6_protocol.md` covering panel + pattern + panel-map + LED-mapping, plus `docs/g6_implementation.md` covering controller + host, optionally folding into the existing `docs/g6_system.md` overview). Phase 2 also adds Jekyll front matter, status banners, and `{:toc}` to the consolidated files. Do not begin Phase 2 until the user explicitly calls the dev docs stable.
