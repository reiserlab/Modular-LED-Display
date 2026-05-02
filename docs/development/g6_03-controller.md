# G6 — Controller (Teensy SW)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Controller Teensy SW" lines 1572–1714 + "Major updates for v2" lines 1715–1859 + "v3 and onwards…" lines 1860–1864) · Last reviewed: 2026-05-02 by mreiser
Status: **Draft (v1 spec) + Teaser (v2) + Stub (v3+)** — verbatim migration only; **no G6 controller firmware exists yet**, so all controller-side behavior described below is aspirational. The G4.1 slim controller ([floesche/LED-Display_G4.1_ArenaController_Slim](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim)) is the G4 baseline against which G6 deltas will be reconciled.

This file describes the host-PC ↔ controller interface and the controller-side responsibilities for slicing, packing, and transmitting frames over SPI to G6 v1 panels. The controller acts as a transport-and-timing engine: it preserves the G4 host command set, loads/streams full arena frames, slices them per panel, encodes G6 v1 panel messages, and transmits them on one or more SPI buses.

> **⚠ Flag — no reconciliation in this commit.** This file is the verbatim baseline. Reconciliation against the G4.1 slim controller (which commands carry over, which need modification, which are net-new for G6, which can be dropped) lands in a separate commit.

---

## Controller requirements for supporting G6 Protocol v1

The G6 controller preserves the G4 host interface and display-mode semantics, while internally targeting G6 v1 LED panels and using an SD card for pattern storage. The controller acts as a transport and timing engine, responsible for slicing full arena frames into per-panel subframes and forwarding them over one or two SPI buses.

### 1. Host Interface (G4-Compatible)

The host communicates with the controller using the existing G4 command set, including:

- Trial-params
- Set-frame-rate
- Set-frame-position
- Stream-frame
- Stop-display, all-on, etc.

The host remains responsible for LED mapping, arena layout, and pattern composition.

### 2. Pattern Backend (SD Card)

For Modes 2–4 (see below), the controller loads full arena frames from the SD card. The frame size is determined from the pattern header:

```
frame_size = 4 + (num_panels × block_size)
num_panels = row_count × col_count
block_size = 53 (GS2) or 203 (GS16)
```

Each stored pattern may be:

- "GS2" 2-level (binary)
- "GS16" 16-level grayscale

The controller uses the frame index from G4 commands to select which arena frame to load and display.

> **⚠ Flag — block size 53/203 includes header+command+pixeldata+stretch.** Section 3 below describes the same panels as "51 bytes for 2-level (1 bit/pixel) + stretch" and "201 bytes for 16-level (4 bits/pixel) + stretch", which is pixel-data + stretch only (no panel-protocol header byte and no command byte). The two are not contradictory — the on-disk panel block is 53/203 bytes (the format actually written by `maDisplayTools`, see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)) — but the spec wording in Section 3 elides the +2 (header+command) bytes. Resolve in Phase 2.

### 3. Frame Slicing

All frames — whether streamed from the host or loaded from SD — are provided as full arena images, organized as subframes stored sequentially by **panel set**.

For each frame update, the controller must:

1. Slice the full arena frame into 20×20 subframes, one per panel.
2. Use Panel Mask in the Pattern Header to determine which panels are being sent (for v1 implementation, it will be fine to assume all panels are present, sending pattern data to all).
3. Pack each subframe into the G6 v1 pixel formats:
   - 51 bytes for 2-level (1 bit/pixel) + stretch
   - 201 bytes for 16-level (4 bits/pixel) + stretch
4. Send each subframe to the appropriate panel using G6 v1 oneshot commands.

> **⚠ Flag — pixel-format byte counts vs Section 2.** 51 bytes (GS2) / 201 bytes (GS16) here refers to pixel data + 1 stretch byte; the per-panel block in the on-disk pattern file (Section 2) is 2 bytes larger because it also carries the panel-protocol header byte and the command byte (53 / 203). See cross-doc divergence in [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) (D-numbered table).

### 4. Panel Routing (Panel Map)

The controller loads a **static panel map** that defines panel routing and arena geometry. Each panel map entry specifies (region, panel_row, panel_col), with panel IDs implicit from row-major order. There is an alternative suggestion to store the minimal version of this in the pattern header (to be resolved soon).

From the panel map, the controller derives:

- the number of panels (and therefore "subframes" in the arena frame)
- the number of rows (SPI chip-select lines)
- the number of columns
- the number of regions (SPI buses)

Panels are grouped into **panel sets**, where each set contains **one panel per region** sharing the same `panel_row` and within-region column offset. To transmit a frame, the controller iterates over panel sets: it enables the chip-select for the corresponding row, sends pattern data to all regions in parallel, then disables the chip-select.

> **⚠ Flag — "to be resolved soon" is RESOLVED.** Per direction adopted in [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md), the standalone panel-map data structure has been merged into the pattern header in v2 (`maDisplayTools` writes a 6-byte panel mask + `row_count` + `col_count` directly into the 18-byte pattern header). However, **region / SPI-bus information is NOT in the v2 pattern header** — that has to come from elsewhere (arena config, sidecar file, or computed). See `g6_04` Open Question #6.

### 5. Panel Protocol v1 Messaging

Each panel update uses a [v1 panel message](g6_01-panel-protocol.md#panel-version-1). The controller strictly handles formatting, transmission and timing.

### 6. Mode Behavior on G6

The controller must support **G4 display Modes 2, 3, 4, and 5:**

- **Mode 2 (Open Loop)**
  - At each frame interval: load frame from SD → slice → pack → send.
- **Mode 3 (host-commanded position)**
  - Host gives frame index via `set-frame-position`; controller loads → slices → sends.
- **Mode 4 (Closed Loop Velocity)**
  - Controller measures analog voltage to compute frame rate, integrates rate to determine frame index, then loads → slices → sends.
- **Mode 5 (Streaming)**
  - Host sends raw arena frames; controller slices → packs → sends immediately.

Mode 4 is the lowest priority, with some final details depending on arena hardware.

> **⚠ Flag — Mode 1 absent.** The Modes section here is "2, 3, 4, 5" — Mode 1 is reserved and only introduced in v2 (see "Major updates for v2 § 4. Mode 1 Support via TSI Files" below). Phase 2 should add a Modes table that explicitly enumerates all five modes (1–5) with version-introduced columns.

### 7. Utility Commands

- `all-on`
  - Optional but helpful. Send appropriate subframe patterns to all active panels. As a simplification, only implement `all-on`, but not `all-off` since `stop-display` should do the same thing.
- `stop-display`, `set-refresh-rate`, `get-ethernet-ip-address`, to be implemented as in G4.1.
- Do **not** implement `switch-grayscale` and `display-reset` in v1, as they are not required.

> **⚠ Flag — drop list of commands needs sign-off against G4.1 baseline.** The slim G4.1 controller currently implements both `SWITCH_GRAYSCALE_CMD` (0x06) and `DISPLAY_RESET_CMD` (0x01). The latter is already a no-op in slim (only sends a response string "Reset Command Sent to FPGA") — so dropping it is largely a paperwork change. `switch-grayscale` is functional in slim and may be useful for G6 ergonomics; reconcile.

---

## Host Command Summary

This is a copy of the G4.1 commands. Possibly adjust for G6 use.

| Name | G4 Starting bytes | Version | Comment |
|---|---|---|---|
| Trial-params | `0x0c, 0x08` | v1 | "Combined command" |
| Set-frame-rate | `0x03, 0x12` | v1 | |
| Set-frame-position | `0x03, 0x70` | v1 | |
| Stream-Frame | `0x32` | v1 | This needs a different length. |
| Stop-Display | `0x01, 0x30` | v1 | Also doubles as "all off" |
| all-on | `0x01, 0xff` | v1 | |

> **⚠ Flag — `set-frame-rate 0x12` is not in the G4.1 slim controller.** The slim controller has `SET_REFRESH_RATE_CMD = 0x16` (refresh rate, the SPI re-transmission rate) but no separate `SET_FRAME_RATE_CMD`. Frame rate is set via the `frame_rate` field in `TRIAL_PARAMS_CMD (0x08)` and is `int16_t` (negative = reverse). Decide whether G6 needs a standalone `set-frame-rate` opcode (and if so, fix `0x12` since that opcode is unused in G4.1 — no collision risk).

> **⚠ Flag — Stream-Frame "needs a different length".** The G4.1 stream-frame layout is `[0x32, len_lo, len_hi, analog_x_lo, analog_x_hi, analog_y_lo, analog_y_hi, frame_data...]` (7-byte header). G6 panels are 20×20 (vs G4 16×16), so the per-frame data length differs. The "different length" is implicitly the binary frame size (32-byte panel × N panels) or the grayscale frame size; specify exactly which.

> **⚠ Flag — table is incomplete.** Section 7 names `set-refresh-rate` and `get-ethernet-ip-address` as required commands, but neither appears in this table. Phase 2 should consolidate into a single command-summary table covering every command the G6 controller is expected to honor (with G4.1 opcode, G6 status: carry-over / modify / new / drop, version introduced).

---

## Major updates for v2

Version 2 of G6 introduces local storage on the panels (PSRAM) and expands the controller's responsibilities accordingly. We also introduce support for trial **Mode 1** and a new **Time Series Index (TSI)** data structure. This section describes only what changes relative to v1.

### 1. Two Backend Modes: SD Mode vs Local Storage Mode

To simplify implementation, we will not support hybrid operations in which controller switches between some patterns stored on the SD card, and others stored on panels. We assume that most users will want the performance of local storage, and so the implementation should make this as simple as possible. There is no good use case for mixing SD with panel-based storage **unless there isn't enough space, which we will address in later updates.**

The controller now supports two mutually exclusive operating modes:

1. **SD Mode (v1-like behavior)**
   - Frames are read from SD on demand, sliced into 20×20 subframes, and streamed to panels using v1-style oneshot commands.
   - Modes 2, 3, 4, and 5 work exactly as in v1.
   - Mode 1 is not supported in SD Mode.
2. **Local Storage Mode (new in v2)**
   - Controller performs a **load phase** after switching into this mode:
     - All patterns/frames on SD for the current experiment are copied to panel PSRAM.
     - A unified internal table is built mapping `(PatternID, FrameIndex16) → PSRAMAddress24`.
   - After loading, Modes 1–4 use index-based v2 panel commands instead of streaming full frames.
   - No hybrid mode: runtime uses either SD Mode or Local Storage Mode exclusively.
   - For later version, evaluate removing SD usage entirely. Pattern-frames could be streamed over Ethernet, sliced and sent out to panels for storage.

Pattern IDs and frame indices remain 16-bit externally; only the internal PSRAM addresses are 24-bit. This mode switch does not change Pattern IDs or frame index values as seen by the host — only the controller's internal implementation.

### 2. Unified Frame Index Space (Host Still Uses 16-bit IDs)

Externally (host ↔ controller), Pattern IDs and Frame indices remain 16-bit values exactly as in G4.

Internally, in Local Storage Mode, the controller maps:

```
(PatternID, FrameIndex16) → GlobalFrameIndex16 → PSRAMAddress24
```

- Panels only receive 3-byte PSRAM indices during v2 display commands.
- This mapping layer is entirely internal to the controller.

### 3. Local Storage Load Phase

Upon entering Local Storage Mode:

1. Controller scans SD metadata for pattern and frame structure.
2. Assigns each frame a global `FrameIndex16`.
3. Uploads every frame to panel PSRAM using v2 write commands.
4. Builds the mapping from `(PatternID, FrameIndex16)` to `PSRAMAddress24`.

After this phase, Modes 1–4 run without reading arena frames from SD (except for TSI files in Mode 1).

### 4. Mode 1 Support via TSI Files

Mode 1 (formerly Position Function Mode) introduced in v2, valid only in Local Storage Mode, and is driven by **Time Series Index (TSI)** files stored on the SD card.

**TSI File Storage and Naming**

- Stored on SD as `001.TSI`, `002.TSI`, … (or similar, following `.PAT` file conventions).
- To avoid adding a new host-side command, use existing fields in `trial-params`:
  - `InitPos-LO` / `InitPos-HI` → together encode the TSI file index (1 → `001.TSI`, 2 → `002.TSI`, etc.)

> **⚠ Flag — TSI naming convention.** The text says "`001.TSI`, `002.TSI`, … (or similar, following `.PAT` file conventions)" but the `.PAT` convention is `pat<NNNN>_<descriptive-name>.pat` (zero-padded ID + underscore + descriptive name). Decide: are TSI files just `<NNN>.TSI` or do they follow the same `tsi<NNNN>_<name>.tsi` form?

**TSI Record Format (5 bytes per time slice)**

| Bytes | Meaning |
|---|---|
| 0–1 | `FrameIndex16` — same index space as Modes 2–4 |
| 2 | Digital Output (DO) — 1 byte. Could encode multiple output lines, depending on arena design. |
| 3–4 | Analog Output (AO) — 16-bit value. 2 AO lines might be interesting, depending on arena design. TBD. |

**Mode 1 Operation**

At each time step (rate set by `trial-params` arguments: `Frame Rate-LO` / `Frame Rate-HI`):

1. Controller reads next 5-byte record from the selected `.TSI` file.
2. Resolves `FrameIndex16 → PSRAMAddress24` (based on `trial-params` arguments: `PatternID-LO` / `PatternID-HI`).
3. Sends a **display-by-index** panel command (`0x50` — Display PSRAM Index v2 command).
4. Updates DO and AO outputs accordingly.

Mode 1 is invalid in SD Mode.

> **⚠ Flag — DO/AO arena dependency unspecified.** Both the Digital Output byte and the two-byte Analog Output value are described as "depending on arena design" / "TBD". Phase 2 needs concrete pin assignments tied to the arena hardware (`Generation 6/Arena/`) — currently `v1.1.7` in production. Until then, this section is implementation-blocking.

### 5. G6-specific controller commands

- Switching from **SD mode** (the default) to **local storage mode.** Initiates copying files from SD card to the panels' storage.
  - e.g. `g6-panel-storage-mode`

> **⚠ Flag — opcode unspecified.** No byte assignment for `g6-panel-storage-mode` is given. Phase 2 should pick a free opcode (avoid 0x00, 0x01, 0x06, 0x08, 0x16, 0x30, 0x32, 0x66, 0x70, 0xFF — already taken by G4.1 slim) and document the request/response framing.

### 6. Controller Error Display

- Visual error indicators, similar to G3 implementation to aid troubleshooting during development (and usage). When an error is detected, the controller will send an error code to all panels (or only a subset if that's relevant) to a small predefined pattern representing an error index.
- Suggested error message format: with 20×20 pixels, have plenty of space for 2×2 characters, so suggested messages would be: `"CE / 01 - 99"`
  - `CE` = controller error; on the top row, and the error code would be displayed on the lower row.
  - During implementation, [peterpolidoro@gmail.com](mailto:peterpolidoro@gmail.com) should decide which errors are most relevant, but some suggestions are:
    - Unknown command
    - Unsupported Protocol Version
    - Invalid Payload length (before sending)
    - Invalid (out-of-range) parameters
    - Arena Addressing Error
    - Transmission Timeout (Panel didn't acknowledge)
    - Panel Response Checksum Error
    - other …
- To make this error visible — we will need to keep them displayed for a short interval, at least 500 ms. This feature is not required for protocol v1 compliance but provides a quick, hardware-level diagnostic without needing extensive debugging.

> **⚠ Flag — depends on predefined-pattern flash mechanism.** The error display assumes a "small predefined pattern" can be flashed onto panels for diagnostic purposes. Per the [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) v4/v5 reconciliation, **no firmware support for predefined patterns exists** in either `iorodeo/g6_firmware_devel` (v1) or `G6_Panels_Test_Firmware` (v3 prototype). This feature is currently unbuilt anywhere; if the controller error display is desired in v2, it either needs panel-firmware support or a different display strategy (e.g., compose the error pattern client-side and send via `0x30` SetFrame).

---

## v3 and onwards…

- At this stage, let's agree on v1 and v2, work on their implementation and then come back and worry about these details… but can add suggestions here.
- v3 mainly adds more display modes to the panels (trigger, gates, persistent, gated-persistent — if we implement all of these), but controller changes will be quite minimal, but will require some new commands and testing.

> **⚠ Flag — v3 controller scope deliberately deferred.** Spec source provides only the two bullets above. Detailed v3 controller-side work is gated on v1+v2 implementation reaching maturity. Cross-reference: [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v3 documents the panel-side gated/persistent/triggered modes and the prototype-only `G6_Panels_Test_Firmware` evidence; the controller side has no spec text or implementation yet.

---

## Open Questions / TBDs

1. **No G6 controller firmware exists.** All controller-side behavior described in this file is aspirational. The [G4.1 slim controller](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) is the G4 baseline. Reconciliation pass (next commit) will produce a carry-over / modify / new / drop classification.
2. **Block size 53/203 vs 51/201** wording inconsistency between Section 2 and Section 3 (with-vs-without panel-protocol header+command bytes). Resolve in Phase 2.
3. **Set-frame-rate opcode `0x12`** is not currently in G4.1 slim; opcode is free. Decide whether G6 introduces this as a standalone command or keeps frame rate as a `trial-params` field only.
4. **Stream-Frame "different length"** for G6 — specify the exact frame-data byte count for both binary (GS2) and grayscale (GS16) modes given 20×20 panels and an N-row × M-col arena.
5. **Drop list (`switch-grayscale`, `display-reset`)** — sign off on dropping these from the G6 baseline. The slim G4.1 has both; `display-reset` is already a no-op string-only response.
6. **Mode 5 numbering** vs G4.1 slim's mode numbering (which has Mode 2/3/4 only — no Mode 5). Clarify the Mode 5 = streaming convention and update the controller-side mode dispatcher to recognize it.
7. **Mode 1 (TSI) DO/AO pin assignments** depend on arena hardware. Coordinate with `Generation 6/Arena/docs/arena.md` (`v1.1.7` production).
8. **TSI filename convention** (`001.TSI` vs `tsi<NNNN>_<name>.tsi`)?
9. **`g6-panel-storage-mode` opcode assignment.**
10. **Region / SPI-bus information missing from v2 pattern header.** Where does the controller get region info from? Cross-doc question — see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) Open Question #6.
11. **Controller error-display feature requires predefined-pattern flash mechanism** that doesn't exist in any firmware today. Either de-scope to "compose error pattern client-side and send via `0x30` SetFrame" (works on v1/v2 today) or wait for v4/v5 predefined-pattern support to land.
12. **Closed-loop (Mode 4) analog voltage source.** G4.1 slim has `gain_` field stored but never read; closed loop runs on an internal counter, not an actual analog input. Decide where the analog voltage signal comes from on G6 hardware.
13. **`all-on` semantics in v2 + Local Storage Mode.** When all frames are in PSRAM, does `all-on` still build a one-shot all-on subframe (v1 behavior) or is it a new opcode? Either approach works but spec must pick.
14. **Pattern Backend section says "Modes 2–4"** but Section 6 lists Modes 2, 3, 4, **and 5** as the v1 mode set. Mode 5 is streaming (host-supplied, no SD read). The v2 update text says "Modes 2, 3, 4, and 5 work exactly as in v1" in SD Mode. Reconcile the two-vs-four-vs-five language.

---

## Cross-references

- [Source Google Doc, "Controller Teensy SW" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v1 controller requirements.
- [Source Google Doc, "Major updates for v2" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v2 controller updates.
- [Source Google Doc, "v3 and onwards…" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v3+ stub.
- [`g6_00-architecture.md`](g6_00-architecture.md) — overall host/controller/panel responsibilities.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel Protocol v1 messaging (the wire format the controller emits).
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping (host-side concern; the controller treats the 20×20 grid as an opaque 51-byte/201-byte payload).
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — on-disk pattern file format (the controller's SD reader consumes these).
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side workflow (the producer of the commands listed in Host Command Summary above).
- [floesche/LED-Display_G4.1_ArenaController_Slim](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) — G4 baseline controller implementation. The reconciliation pass (next commit) will diff this verbatim spec against that codebase and produce explicit carry-over / modify / new / drop labels per requirement.
