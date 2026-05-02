# G6 — Host PC Software (firmware-contract perspective)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Host PC Matlab SW", lines 2409–2482) · Last reviewed: 2026-05-02 by mreiser
Status: **Stub** — verbatim migration of a deliberately thin source tab, with a light reconciliation pass (2026-05-02) noting what `maDisplayTools v2` already implements and what remains a firmware-side TBD. The spec author wrote "It is premature to produce detailed specs for the host-side software until the team reviews/comments/updates the proposed Panel software (Version 1 and Version 2 teaser) and the supporting Teensy Controller SW changes" — so this file stays a high-level checklist of what the host PC must do for the firmware to work. **Today's focus is firmware-side; a deep migration of the MATLAB display tools spec is deferred** until those tools are formally migrated to G6.

This file captures the firmware-side perspective on host-PC software responsibilities for G6 v1 (and anticipated v2 updates). It defines the firmware's contract with the host: what data formats, addressing schemes, and command sequences the firmware assumes the host will produce. The deep MATLAB-side spec migration (covering `Generation 6/maDisplayTools/`'s pattern-generation, arena-config, and experiment-pipeline tooling) is deferred.

> **Opening preamble (verbatim from source):** It is premature to produce detailed specs for the host-side software until the team reviews/comments/updates the proposed Panel software ([Version 1](g6_01-panel-protocol.md#panel-version-1) and [Version 2 (teaser)](g6_01-panel-protocol.md#panel-version-2)) and the supporting [Teensy Controller SW](g6_03-controller.md) changes, so this is supplied as very high-level checklist to capture major changes.

---

## Current state

The host-side MATLAB tooling already exists and is partially G6-aware: `Generation 6/maDisplayTools/` (HEAD `a51fe18`) supplies `g6/g6_save_pattern.m` (writes the v2 18-byte pattern header) and `g6/g6_encode_panel.m` (encodes per-panel GS2/GS16 blocks), validated end-to-end against the JS encoder in `webDisplayTools` via the round-trip JSON test vectors at `g6/g6_encoding_reference.json`. The submodule's own docs (`Generation 6/maDisplayTools/docs/{g6_quickstart, sd_card_deployment_notes, experiment_pipeline_guide, pattern_library_convention, pattern_tools_quickstart, patterns}.md`) are authoritative for the actual MATLAB workflow today and are published in the public Jekyll site.

**Deep host-side spec migration is explicitly deferred.** This file's role is to capture the firmware ↔ host contract — what data formats and command sequences the firmware assumes the host will produce — not to re-document maDisplayTools. The deferral applies until either (a) the maDisplayTools tooling itself migrates further toward G6 (e.g., adds a v3 trigger workflow, Mode 1 TSI authoring, or PSRAM-mode preload management), at which point this file expands; or (b) the controller doc (`g6_03`) surfaces a host-side requirement not yet built in maDisplayTools.

### Light reconciliation pass (2026-05-02)

What `maDisplayTools v2` already supplies (covers the firmware contract):

- 18-byte v2 pattern header with G6PT magic + version + Arena/Observer IDs + frame count + row/col counts + gs_val + 6-byte panel mask + XOR checksum (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)).
- Per-panel GS2 (53-byte) and GS16 (203-byte) block encoding, including the 1-byte panel-protocol header byte, 1-byte command byte, pixel data (row-major from bottom-left, MSB-first packing), and 1-byte stretch (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) v1 message format and [`g6_02-led-mapping.md`](g6_02-led-mapping.md) pixel-coordinate conventions).
- Round-trip-validated cross-platform encoding via `g6_encoding_reference.json` (identical bit-level output between MATLAB and JS encoders).

What is **not** yet supplied host-side and remains a firmware-side TBD:

- `get-controller-version` / `get-controller-capabilities` opcode (required by both v1 G6-mode detection and v2 feature detection). Spec belongs in [`g6_03-controller.md`](g6_03-controller.md).
- `g6-panel-storage-mode` opcode (host-callable command to switch SD ↔ Local Storage). Spec belongs in `g6_03`.
- Region / SPI-bus info source for the controller (the v2 pattern header dropped this; host needs to supply it from somewhere — most likely an arena-config sidecar). See [`g6_03-controller.md`](g6_03-controller.md) Open Question #7 and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) Open Question #6.
- TSI authoring tools and DO/AO output drivers — pin assignments depend on `Generation 6/Arena/` hardware; tooling is host-side but the firmware contract is captured in [`g6_03-controller.md`](g6_03-controller.md) § Mode 1.
- Pattern-match check between SD and panel PSRAM — algorithm depends on v2 panel firmware features (does the panel store/return a hash?). Defer.

---

## Anticipated PC host updates for G6 v1

### Arena configuration for G6 panels

- Host needs a way to describe a G6 arena: number of 20×20 panels and their positions/orientations (U/D), since the controller is ignorant about geometry. This will be handled via the panel map.
- In addition to the features described in the [Panel Map proposal](g6_04-pattern-file-format.md), the host may include additional fields for host-specific uses in supporting pattern making:
  - `flip_ud` (a flag to indicate if panels are upside down, and patterns should then be inverted)
  - the pixel indices for each panel (may not be needed, but were previously useful)

> **⚠ Flag — "controller is ignorant about geometry" is the firmware contract.** This is the load-bearing claim about what the host must supply. The G6 firmware (controller + panels) does not encode arena geometry anywhere — it must be told via the pattern header / panel map. Cross-doc: this is the same gap discussed in [`g6_03-controller.md`](g6_03-controller.md) and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — region/SPI-bus information is not in the v2 pattern header and must come from somewhere host-side.
>
> 🟢 **Partial (2026-05-02) vs `maDisplayTools v2`:** the *panel-presence* part of arena geometry IS supplied today — the v2 pattern header carries `row_count`, `col_count`, and the 6-byte panel mask. The *panel-orientation* (`flip_ud`) and per-panel pixel-index fields named in this section are NOT in the v2 header — they live host-side in maDisplayTools and never reach the controller. Region/SPI-bus information is the open gap (see Current state above).

### G4 controller target = "G6 mode"

Same G4 command set, but the host must know it's talking to a G6 controller (via ID/version) so it can:

- Use G6-compatible pattern sizes (20×20 per panel)
- Avoid any legacy G4 hardware assumptions.

> **⚠ Flag — controller version/ID query opcode is unspecified.** Source says "via ID/version" but no opcode or response format is defined. The G4.1 baseline (`LED-Display_G4.1_ArenaController_Slim`) has no controller-identification command in its `ArenaCommands` enum. For G6, a `get-controller-version` (or `get-capabilities`) command is implied; opcode assignment is a `g6_03` task.
>
> 🔴 **Divergence (2026-05-02) vs slim G4.1 @ `8f1029f`:** confirmed — `commands.h:6-17` lists 10 opcodes, none of which return a controller version or capability bitmap. The same gap blocks v2 capability detection (see flag below). Consolidating into a single `get-controller-info` command (one opcode, two response shapes by version) is the most efficient resolution. Opcode TBD; tracked in `g6_03` Open Question #2.

### Pattern and file format expectations

- Pattern generation tools need to support the G6 geometry and produce full-arena frames that slice cleanly into 20×20 chunks (2-level and 16-level), with an updated G6 header (format TBD).
- The on-disk representation might stay similar, but the host needs to be aware of the new arena shape.
- Implement appropriate LED mapping per panel (following G6 [LED Mappings](g6_02-led-mapping.md)).

> **⚠ Flag — "G6 header (format TBD)" was ambiguous in source; the format is now defined.** The 18-byte v2 pattern header is canonical (see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). The "TBD" wording is stale — the header is implemented today by `maDisplayTools/g6/g6_save_pattern.m`.
>
> 🟢 **Resolved (2026-05-02) vs `maDisplayTools v2`:** 18-byte v2 header is canonical and round-trip-validated (MATLAB ↔ JS) per `g6/g6_encoding_reference.json`. Phase-2 cleanup will rewrite the source-doc "TBD" wording.

### Streaming (Mode 5) to a sliced arena

Wherever the host currently streams frames to G4, it now must generate full-arena frames that the G6 controller can slice.

With Mode 5 implemented, we will implement **host-controlled utility functions** that further simplify the set of commands required of the controller:

- `all_on`
- `all_off`
- `show_panel_IDs`

> **⚠ Flag — `all_on` / `all_off` placement: controller-side opcode or host-composed?** Slim G4.1 has both `ALL_ON_CMD (0xFF)` and `ALL_OFF_CMD (0x00)`. This section proposes implementing them host-side as composed full-arena frames sent via Stream-Frame (Mode 5). The two are not equivalent: controller-side opcodes work without Mode 5 being functional (e.g., during arena bring-up), while host-composed all-on/all-off requires the streaming path to be working end-to-end. Decide which semantics G6 supports.

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

> **⚠ Flag — capability detection requires a controller-side response.** Same gap as the v1 "G6 mode" question above. Needs a `get-controller-capabilities` opcode and response schema (probably bitfield: `[v2_local_storage, mode_1_tsi, v3_gated, …]`). Wire-format specification belongs in [`g6_03-controller.md`](g6_03-controller.md).

---

## Open Questions / TBDs

1. **Controller version/capability query opcode** — required by both v1 ("G6 mode" detection) and v2 (feature detection). Not in slim G4.1; spec belongs in `g6_03`. Same opcode could serve both, with a bitfield response.
2. **`all_on` / `all_off` placement** — controller-side opcode (slim has both) or host-composed via Mode 5? Affects arena bring-up workflows.
3. **PSRAM-vs-SD pattern integrity check** — algorithm and host/panel responsibility split. Open until v2 panel firmware exists.
4. **Region / SPI-bus info source** — same cross-doc question as `g6_03` Open Question #7 and `g6_04` Open Question #6. Pattern header dropped this in v2; host needs to supply it from somewhere (arena-config sidecar most likely).
5. **`show_panel_IDs` test pattern** — defined as a host-composed visualization (each panel displays its `panel_id`). Useful for verifying the panel map is correct end-to-end. Implementation owner: maDisplayTools-side; firmware just receives a Mode 5 frame.
6. **Deep MATLAB display-tools spec migration** — deferred until display tools are formally migrated to G6. Today's reference: `Generation 6/maDisplayTools/docs/{g6_quickstart, sd_card_deployment_notes, experiment_pipeline_guide, pattern_library_convention, pattern_tools_quickstart, patterns}.md` (already in the submodule's public Jekyll site).

---

## Cross-references

- [Source Google Doc, "Host PC Matlab SW" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [`g6_00-architecture.md`](g6_00-architecture.md) — host/controller/panel responsibility split
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — panel protocol v1 + v2 + v3 + v4/v5 (the firmware that the host writes for)
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping (host-side concern; firmware sees opaque payload)
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side firmware contracts (the other half of host ↔ firmware spec)
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — on-disk pattern file format (the canonical wire format between host and controller)
- `Generation 6/maDisplayTools/docs/{g6_quickstart, sd_card_deployment_notes, experiment_pipeline_guide, pattern_library_convention, pattern_tools_quickstart, patterns}.md` — current host-side documentation in the submodule (authoritative on the actual MATLAB workflow today; deeper migration deferred)
