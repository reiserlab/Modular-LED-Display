# G6 — Host PC Software (firmware-contract perspective)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Host PC Matlab SW", lines 2409–2482) · Last reviewed: 2026-05-02 by mreiser
Status: **Stub** — thin source tab migrated, reconciled against `maDisplayTools v2` and slim G4.1 (firmware-contract framing). The spec author noted detailed host-side specs are premature until the panel and controller specs solidify, so this file stays a high-level checklist of what the host PC must do for the firmware to work. **Deep migration of the MATLAB display tools spec is deferred** until those tools formally migrate to G6.

This file captures the firmware-side perspective on host-PC software responsibilities for G6 v1 (and anticipated v2 updates). It defines the firmware's contract with the host: what data formats, addressing schemes, and command sequences the firmware assumes the host will produce. The deep MATLAB-side spec migration (covering `Generation 6/maDisplayTools/`'s pattern-generation, arena-config, and experiment-pipeline tooling) is deferred.

> **Opening preamble (verbatim from source):** It is premature to produce detailed specs for the host-side software until the team reviews/comments/updates the proposed Panel software ([Version 1](g6_01-panel-protocol.md#panel-version-1) and [Version 2 (teaser)](g6_01-panel-protocol.md#panel-version-2)) and the supporting [Teensy Controller SW](g6_03-controller.md) changes, so this is supplied as very high-level checklist to capture major changes.

---

## Current state

The host-side MATLAB tooling already exists and is partially G6-aware: `Generation 6/maDisplayTools/` (HEAD `a51fe18`) supplies `g6/g6_save_pattern.m` (writes the v2 18-byte pattern header) and `g6/g6_encode_panel.m` (encodes per-panel GS2/GS16 blocks), validated end-to-end against the JS encoder in `webDisplayTools` via the round-trip JSON test vectors at `g6/g6_encoding_reference.json`. The submodule's own docs (`Generation 6/maDisplayTools/docs/{g6_quickstart, sd_card_deployment_notes, experiment_pipeline_guide, pattern_library_convention, pattern_tools_quickstart, patterns}.md`) are authoritative for the actual MATLAB workflow today and are published in the public Jekyll site.

**Deep host-side spec migration is explicitly deferred.** This file's role is to capture the firmware ↔ host contract — what data formats and command sequences the firmware assumes the host will produce — not to re-document maDisplayTools. The deferral applies until either (a) the maDisplayTools tooling itself migrates further toward G6 (e.g., adds a v3 trigger workflow, Mode 1 TSI authoring, or PSRAM-mode preload management), at which point this file expands; or (b) the controller doc (`g6_03`) surfaces a host-side requirement not yet built in maDisplayTools.

**maDisplayTools v2 already supplies the firmware contract** for v1 patterns: 18-byte v2 pattern header (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)), per-panel GS2/GS16 block encoding (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) v1 message format), and round-trip-validated cross-platform encoding via `g6_encoding_reference.json`. Host-side gaps still TBD are tracked under Open Questions; reconciliation detail in History & Reconciliation at the bottom.

---

## Anticipated PC host updates for G6 v1

### Arena configuration for G6 panels

- Host needs a way to describe a G6 arena: number of 20×20 panels and their positions/orientations (U/D), since the controller is ignorant about geometry. This will be handled via the panel map.
- In addition to the features described in the [Panel Map proposal](g6_04-pattern-file-format.md), the host may include additional fields for host-specific uses in supporting pattern making:
  - `flip_ud` (a flag to indicate if panels are upside down, and patterns should then be inverted)
  - the pixel indices for each panel (may not be needed, but were previously useful)

**Geometry-supply status (2026-05-02):** the *panel-presence* part is in the v2 pattern header (`row_count`, `col_count`, 6-byte panel mask — `maDisplayTools/g6/g6_save_pattern.m`). `flip_ud` and per-panel pixel-index fields stay host-only (never reach the controller). **Region/SPI-bus assignment is the open gap** — same cross-doc question as [`g6_03-controller.md`](g6_03-controller.md) and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md).

### G4 controller target = "G6 mode"

Same G4 command set, but the host must know it's talking to a G6 controller (via ID/version) so it can:

- Use G6-compatible pattern sizes (20×20 per panel)
- Avoid any legacy G4 hardware assumptions.

G6 adds opcode `0x67 = get-controller-info` (single command with version-dispatched response shape) covering both v1 G6-mode detection and v2 capability bitmap. Specification lives in [`g6_03-controller.md`](g6_03-controller.md) § Host Command Summary.

### Pattern and file format expectations

- Pattern generation tools need to support the G6 geometry and produce full-arena frames that slice cleanly into 20×20 chunks (2-level and 16-level), with an updated G6 header (format TBD).
- The on-disk representation might stay similar, but the host needs to be aware of the new arena shape.
- Implement appropriate LED mapping per panel (following G6 [LED Mappings](g6_02-led-mapping.md)).

**G6 header format (2026-05-02):** the 18-byte v2 header is canonical and round-trip-validated (MATLAB ↔ JS) per `maDisplayTools/g6/g6_encoding_reference.json`. The source-tab's "TBD" wording is stale; see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) for the byte-level layout.

### Streaming (Mode 5) to a sliced arena

Wherever the host currently streams frames to G4, it now must generate full-arena frames that the G6 controller can slice.

With Mode 5 implemented, the host can additionally compose the following test patterns as full-arena frames, since they don't need dedicated controller commands:

- `show_panel_IDs` — each panel displays its `panel_id`, useful for verifying panel-map correctness end-to-end.

`all_on` (`0x01, 0xff`) and `all_off` (`0x01, 0x00`) remain as **controller-side opcodes** carried over from slim G4.1 — they work during arena bring-up before the Mode 5 streaming path is fully functional, which is critical for diagnostics. See [`g6_03-controller.md`](g6_03-controller.md) § Host Command Summary.

---

## Anticipated PC host updates for G6 v2

### Storage mode awareness (SD vs Local Storage)

Host needs a notion of "run in SD mode" vs "run in local storage mode" and call the new `g6-panel-storage-mode` command. It might also make sense (and save time) to check if the stored patterns match the SD card (efficiently, somehow), so we don't copy them unnecessarily (the importance of this will depend on how long it takes to copy patterns).

> **⚠ Flag — pattern-match check is unspecified.** Source says "efficiently, somehow" — no algorithm or protocol proposed. Likely candidates: SHA per pattern stored on panel + verified by host; per-pattern modification-timestamp comparison; or skip optimization entirely. Algorithm choice intersects panel-side capability (does the panel store/return a hash?) — defer until v2 panel protocol firms up. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v2.

### Pattern library management for Local Storage Mode

Host must define what the 'active' pattern set is that lives on the SD for a given experiment, knowing that in Local Storage Mode all of them will be preloaded into panel PSRAM before playback.

### TSI / Mode 1 support

Tools for generating and managing `.TSI` files will be needed (borrowing heavily from position function and AO methods in G4), plus update in trial-params command to use mode 1.

> **⚠ Flag — TSI tooling is host-side; the firmware contract is the 5-byte record format.** The firmware's contract on TSI files is captured in [`g6_03-controller.md`](g6_03-controller.md) § Mode 1 Support via TSI Files: 5-byte records of `[FrameIndex16 (LE), DO, AO_lo, AO_hi]`, indexed via the existing `InitPos-LO`/`InitPos-HI` fields of `trial-params`. Host-side TSI authoring tools are a maDisplayTools-side concern; deferred.

### Diagnostics / capability detection

Host should query controller version / capabilities to know whether v2 features (Local Storage Mode, Mode 1, TSI) are available, and provide appropriate error messages if not available.

v2 capability detection shares the v1 "G6 mode" gap above — same `get-controller-info` command, version-dispatched response. Bitfield response schema (likely `[v2_local_storage, mode_1_tsi, v3_gated, …]`) belongs in [`g6_03-controller.md`](g6_03-controller.md).

---

## Open Questions / TBDs

1. **PSRAM-vs-SD pattern integrity check** — algorithm and host/panel responsibility split. Open until v2 panel firmware exists.
2. **Region / SPI-bus info source** — same cross-doc question as `g6_03` Open Question #2 and `g6_04` flag in § Panel Map. For the production `arena_10-10`, the implicit "5 cols / region" rule works; for future arenas, investigate whether `maDisplayTools` arena-config files already cover this on the host side.
3. **`show_panel_IDs` test pattern** — host-composed visualization (each panel displays its `panel_id`); useful for verifying the panel map end-to-end. Implementation owner: maDisplayTools-side; firmware just receives a Mode 5 frame.
4. **Deep MATLAB display-tools spec migration** — deferred until display tools are formally migrated to G6. Reference: `Generation 6/maDisplayTools/docs/*.md` in the submodule (public Jekyll site).

## History & Reconciliation

**Light reconciliation pass (2026-05-02)** against `maDisplayTools v2` and slim G4.1, framed from the firmware-contract perspective.

What `maDisplayTools v2` already supplies:

- 18-byte v2 pattern header with G6PT magic + version + Arena/Observer IDs + frame count + row/col counts + gs_val + 6-byte panel mask + XOR checksum.
- Per-panel GS2 (53-byte) and GS16 (203-byte) block encoding (header + command + pixel data row-major from bottom-left, MSB-first packing + stretch).
- Round-trip-validated cross-platform encoding via `g6_encoding_reference.json` (identical bit-level output between MATLAB and JS encoders).

What's not yet supplied host-side and remains a firmware-side TBD (each tracked under specific Open Question above or in a sibling doc):

- `get-controller-info` opcode `0x67` (v1 G6-mode detection + v2 capability bitmap) — spec in [`g6_03-controller.md`](g6_03-controller.md) Host Command Summary.
- `g6-panel-storage-mode` opcode `0x40` (host-callable SD ↔ Local Storage switch) — spec in `g6_03`.
- Region / SPI-bus info source — see Open Q #2.
- TSI authoring tools and DO/AO output drivers — pin assignments resolved in [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md); host tooling is maDisplayTools-side, deferred.
- Pattern-match check between SD and panel PSRAM — see Open Q #1.

### Major decisions log

- **2026-05-01** — `0x67 = get-controller-info` opcode assigned (commit `508da9e`); single command with version-dispatched response shape covers v1 G6-mode detection + v2 capability bitmap.
- **2026-05-01** — `0x40 = g6-panel-storage-mode` opcode assigned (commit `508da9e`); switches controller from SD Mode → Local Storage Mode.
- **2026-05-02** — v2 18-byte header confirmed canonical; source-tab "TBD" wording obsolete (commit `7b7e804`).

---

## Cross-references

- [Source Google Doc, "Host PC Matlab SW" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [`g6_00-architecture.md`](g6_00-architecture.md) — host/controller/panel responsibility split
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — panel protocol v1 + v2 + v3 + v4/v5 (the firmware that the host writes for)
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping (host-side concern; firmware sees opaque payload)
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side firmware contracts (the other half of host ↔ firmware spec)
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — on-disk pattern file format (the canonical wire format between host and controller)
- `Generation 6/maDisplayTools/docs/{g6_quickstart, sd_card_deployment_notes, experiment_pipeline_guide, pattern_library_convention, pattern_tools_quickstart, patterns}.md` — current host-side documentation in the submodule (authoritative on the actual MATLAB workflow today; deeper migration deferred)
