# G6 — Host PC Software (firmware-contract perspective)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Host PC Matlab SW", lines 2409–2482) · Last reviewed: 2026-05-02 by mreiser
Status: **Stub — verbatim migration of a deliberately thin source tab.** The spec author wrote "It is premature to produce detailed specs for the host-side software until the team reviews/comments/updates the proposed Panel software (Version 1 and Version 2 teaser) and the supporting Teensy Controller SW changes" — so this file is a high-level checklist of what the host PC must do for the firmware to work. **Today's focus is firmware-side; a deep migration of the MATLAB display tools is deferred** until those tools are formally migrated to G6.

This file captures the firmware-side perspective on host-PC software responsibilities for G6 v1 (and anticipated v2 updates). It defines the firmware's contract with the host: what data formats, addressing schemes, and command sequences the firmware assumes the host will produce. The deep MATLAB-side spec migration (covering `Generation 6/maDisplayTools/`'s pattern-generation, arena-config, and experiment-pipeline tooling) is deferred.

> **Opening preamble (verbatim from source):** It is premature to produce detailed specs for the host-side software until the team reviews/comments/updates the proposed Panel software ([Version 1](g6_01-panel-protocol.md#panel-version-1) and [Version 2 (teaser)](g6_01-panel-protocol.md#panel-version-2)) and the supporting [Teensy Controller SW](g6_03-controller.md) changes, so this is supplied as very high-level checklist to capture major changes.

---

## Anticipated PC host updates for G6 v1

### Arena configuration for G6 panels

- Host needs a way to describe a G6 arena: number of 20×20 panels and their positions/orientations (U/D), since the controller is ignorant about geometry. This will be handled via the panel map.
- In addition to the features described in the [Panel Map proposal](g6_04-pattern-file-format.md), the host may include additional fields for host-specific uses in supporting pattern making:
  - `flip_ud` (a flag to indicate if panels are upside down, and patterns should then be inverted)
  - the pixel indices for each panel (may not be needed, but were previously useful)

> **⚠ Flag — "controller is ignorant about geometry" is the firmware contract.** This is the load-bearing claim about what the host must supply. The G6 firmware (controller + panels) does not encode arena geometry anywhere — it must be told via the pattern header / panel map. Cross-doc: this is the same gap discussed in [`g6_03-controller.md`](g6_03-controller.md) and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — region/SPI-bus information is not in the v2 pattern header and must come from somewhere host-side.

### G4 controller target = "G6 mode"

Same G4 command set, but the host must know it's talking to a G6 controller (via ID/version) so it can:

- Use G6-compatible pattern sizes (20×20 per panel)
- Avoid any legacy G4 hardware assumptions.

> **⚠ Flag — controller version/ID query opcode is unspecified.** Source says "via ID/version" but no opcode or response format is defined. The G4.1 baseline (`LED-Display_G4.1_ArenaController_Slim`) has no controller-identification command in its `ArenaCommands` enum. For G6, a `get-controller-version` (or `get-capabilities`) command is implied; opcode assignment is a `g6_03` task.

### Pattern and file format expectations

- Pattern generation tools need to support the G6 geometry and produce full-arena frames that slice cleanly into 20×20 chunks (2-level and 16-level), with an updated G6 header (format TBD).
- The on-disk representation might stay similar, but the host needs to be aware of the new arena shape.
- Implement appropriate LED mapping per panel (following G6 [LED Mappings](g6_02-led-mapping.md)).

> **⚠ Flag — "G6 header (format TBD)" was ambiguous in source; the format is now defined.** The 18-byte v2 pattern header is canonical (see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). The "TBD" wording is stale — the header is implemented today by `maDisplayTools/g6/g6_save_pattern.m`.

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
