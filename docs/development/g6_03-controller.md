# G6 — Controller (Teensy SW)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Controller Teensy SW" lines 1572–1714 + "Major updates for v2" lines 1715–1859 + "v3 and onwards…" lines 1860–1864) · Last reviewed: 2026-05-02 by mreiser
Status: **Draft (v1 spec) + Teaser (v2) + Stub (v3+)** — verbatim migration of three Google Doc tabs, reconciled 2026-05-02 against the G4.1 slim controller baseline ([floesche/LED-Display_G4.1_ArenaController_Slim](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) @ `8f1029f`). **No G6 controller firmware exists yet** — all G6-specific behavior below remains aspirational. The reconciliation classifies which G4.1 functionality carries over unchanged for G6, which needs modification, which is net-new, and which can be dropped.

This file describes the host-PC ↔ controller interface and the controller-side responsibilities for slicing, packing, and transmitting frames over SPI to G6 v1 panels. The controller acts as a transport-and-timing engine: it preserves the G4 host command set, loads/streams full arena frames, slices them per panel, encodes G6 v1 panel messages, and transmits them on one or more SPI buses.

---

## Current state

There is **no G6 controller firmware** yet. Both candidate G6 panel firmwares ([`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) for v1 and [`G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) for the v3 prototype rig) target the panel side, not the controller. The G4 baseline is the **slim G4.1 Arena Controller** ([`LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) @ `8f1029f`, 2026-04-28; PlatformIO Teensy 4.1 project, ~1/4 the LOC of the legacy G4.1 controller, no QP framework). All controller-side claims in this file are reconciled against that codebase.

### Reconciliation: Controller spec vs G4.1 slim baseline (run 2026-05-02)

Inventory of the slim G4.1 controller used to produce the four classifications below:

- 11 source files: `main.cpp`, `CommandProcessor.{cpp,h}`, `NetworkManager.{cpp,h}`, `SpiManager.{cpp,h}`, `SdManager.{cpp,h}`, `PatternHeader.h`, `commands.h`, `constants.h`, `modes.h`
- 1 timing characterization: `timing.md` (~93 KB; only SD/init timing is captured — no SPI/refresh/BCM/Ethernet RTT measurements)
- `README.md` and `docs/BRING_UP_GUIDE.md`

**Carry-over from G4 (use as-is for G6):**

| Item | Slim G4.1 source | G6 fit |
|---|---|---|
| `ALL_OFF_CMD` (0x00), `STOP_DISPLAY_CMD` (0x30) | `commands.h:7,12`, `CommandProcessor.cpp:38-51` | ✓ same semantics |
| `ALL_ON_CMD` (0xFF) | `commands.h:15`, `CommandProcessor.cpp:43-46`, `SpiManager::fillBufferAllOn` | ✓ semantically identical (buffer composition changes — see Modify) |
| `SET_FRAME_POSITION_CMD` (0x70) | `commands.h:14`, `CommandProcessor.cpp:121-133` | ✓ unchanged |
| `SET_REFRESH_RATE_CMD` (0x16) | `commands.h:11`, `CommandProcessor.cpp:71-81` | ✓ generic 16-bit Hz setter |
| `GET_ETHERNET_IP_ADDRESS_CMD` (0x66) | `commands.h:13`, `CommandProcessor.cpp:117-119` | ✓ utility command |
| TCP framing (port 62222, `[len, cmd, ...]` binary form, `[0x32, len_lo, len_hi, …]` stream form) | `NetworkManager.cpp:50-95`, `constants.h:126,127,128` | ✓ retained |
| Response framing `[len, status, echo_cmd, ASCII msg]` (200 B response buffer) | `NetworkManager.cpp:106-119`, `constants.h:129` | ✓ |
| Single-client TCP server with `setNoDelay(true)`; DHCP-only IP | `NetworkManager.h:37-38`, `NetworkManager.cpp:5-18` | ✓ |
| `IntervalTimer`-driven refresh ISR | `SpiManager.cpp:37-48` | ✓ |
| ISR priority scheme (SPI=0, Ethernet=64, SDIO=96) | `main.cpp:74-80` | ✓ |
| State machine `ALL_OFF`/`ALL_ON`/`PLAYING_PATTERN`/`SHOWING_PATTERN_FRAME`/`STREAMING_FRAME`/`ANALOG_CLOSED_LOOP` | `CommandProcessor.h:10-17` | ✓ extended (Mode 1 adds a state; see New) |
| Whole-file SD caching with 32 KB heap reserve | `SdManager.cpp:96-128`, `SdManager.h:33` | ✓ |
| Alphabetical pattern-ID sort, 1-based, in `/patterns/` | `SdManager.cpp:14-77`, `constants.h:99` | ✓ |
| Top-level main loop: `serviceTcp / processCommand / serviceDisplay / flushResponses` | `main.cpp:34-39` | ✓ |
| Boot Morse "OK" pattern (300/100/100 ms) | `main.cpp:48-72` | ✓ |

**Modify for G6 (exists in slim, needs adjustment):**

| Item | Slim source | What changes for G6 |
|---|---|---|
| Frame slicing: 16×16 quarter-panel layout → 20×20 G6 subframes | `SpiManager::decodePatternFrame` (`SpiManager.cpp:101-142`), `SpiManager::fillBufferFromDecoded` (`:144-168`); `[8][4]` and `[2][2]` panel-decomposition constants in `constants.h:16-19,45-48`; struct shapes in `SpiManager.h:9-23` | Re-derive geometry for G6 panels (20×20 = 400 pixels, organized as one block per panel rather than 4 quarter-panels). Touches all SPI-buffer composition. |
| SPI framing: emit v1 panel-protocol bytes with parity | `SpiManager::transferPanelSet` (`SpiManager.cpp:70-84`) writes panel buffer raw — no parity computed | Add controller-side parity per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) v1 message format. |
| Pattern header: G4 has 7-byte/8-byte union → G6 needs 18-byte v2 header | `PatternHeader.h:6-15`, `constants.h:100` (`pattern_header_size = 7`) | Adopt the 18-byte v2 layout from [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md): G6PT magic + version + Arena/Observer IDs + frame count + row/col counts + gs_val + panel mask + checksum. |
| CS-line count and pin matrix | Hard-coded 5×6 GPIO map for G4.1 wiring in `panel_set_select_pins[5][6]` (`constants.h:77-83`); `region_count_per_frame=2` (`constants.h:68`) | Re-wire for G6 arena (`Generation 6/Arena/` `v1.1.7` production); count and per-row count depend on arena geometry. |
| `fillBufferAllOn` stretch values (1 grayscale, 50 binary) | `SpiManager.cpp:170-193` | Re-derive for G6 panel-protocol v1 stretch semantics. |
| `STREAM_FRAME_CMD` payload size | `CommandProcessor.cpp:140-190`: 7-byte header + frame data; `analog_x`/`analog_y` bytes parsed and logged but unused | G6 frame data sizes differ (binary 51 B/panel × N or grayscale 201 B/panel × N at panel level; on-disk panel block 53/203 — pick which the wire format uses). Decide whether `analog_x`/`analog_y` survive G4→G6. |
| Refresh-rate defaults (300 Hz greenscale / 1000 Hz binary) | `constants.h:122-123` | Reconcile with G6 panel BCM/bit-plane timing budgets — currently unmeasured. |
| `TRIAL_PARAMS_CMD` (0x08) payload (12 param bytes) | `CommandProcessor.cpp:83-115` | G6 may need an extra byte (panel-mask override or trigger config). |
| `grayscale_value` on-disk byte encoding | Pattern header byte 4 = `0x10` greenscale, `0x02` binary (`CommandProcessor.cpp:300-310`); clashes with command parameter values `1`/`0` (`constants.h:95-96`) | G6 should pick one encoding and document. |

**New for G6 (must be added; not in slim):**

| Item | Why new | Notes |
|---|---|---|
| Panel-map data structure with regions / SPI-bus / CS | Slim has only the fixed `panel_set_select_pins` matrix + `region_count_per_frame=2`; no per-panel routing | Pending decision: arena-config sidecar vs computed from `col_count` + fixed regions. See [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) Open Question #6. |
| Panel-set ordering for parallel transmission | Slim iterates column-major (`SpiManager.cpp:92-99`); G6 spec section 4 calls for panel-set iteration | Spec ↔ impl divergence D9 in [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — three options to resolve. |
| Controller-side parity computation | Not present | See Modify section above. |
| v2 PSRAM workflow + TSI parsing for Mode 1 | Mode 1 absent (`modes.h:6-10`); no PSRAM-related code anywhere | Adds load-phase logic, `(PatternID, FrameIndex16) → PSRAMAddress24` mapping table, TSI 5-byte record parser, DO/AO output drivers (pin assignments depend on arena hardware). |
| `g6-panel-storage-mode` host command | Not in `ArenaCommands` enum | Pick a free opcode — none of `0x00, 0x01, 0x06, 0x08, 0x16, 0x30, 0x32, 0x66, 0x70, 0xFF` are available. |
| v3 trigger-line wiring (input GPIO) | Slim has no input pins beyond CS lines | Single trigger input to be added. Wiring depends on arena hardware. |
| Magic / format-version field / XOR checksum in pattern header | None in `PatternHeader.h:6-15` | Adopt v2 layout per `g6_04`. |
| Mode 1 (TSI Position Function) and Mode 5 (Streaming) top-level dispatch | Slim implements only Modes 2/3/4 (`modes.h:6-10`); Mode 5 streaming is partially built via `STREAMING_FRAME` state but no top-level mode dispatch | Add full mode dispatch for Modes 1–5. |

**Drop / not needed for G6:**

| Item | Slim source | Rationale |
|---|---|---|
| `DISPLAY_RESET_CMD` (0x01) "reset to FPGA" semantics | `CommandProcessor.cpp:53-55` (already a no-op string-only response) | No FPGA in Teensy slim path; spec § 7 explicitly says drop. |
| `SWITCH_GRAYSCALE_CMD` (0x06) | `commands.h:9`, `CommandProcessor.cpp:57-69` | Spec § 7 explicitly says drop. May reconsider if G6 ergonomics need it. |
| `frame_count_y` field of `PatternHeader` | `PatternHeader.h:9` (declared but never read or validated) | Dead weight; bytes reused in v2 layout. |
| `row_signifier` byte between panel rows in pattern files | `SpiManager.cpp:113` (`++pos;` skips it) | Vestigial padding; v2 pattern files (`g6_04`) drop it. |

**Ambiguous (parent decision needed):**

- Mode 4 closed-loop: G4.1 slim stores `gain_` but never reads it; the closed-loop branch runs on an internal counter (`CommandProcessor.cpp:233-248`), not an actual analog input. Decide whether G6 closed-loop needs a real analog source (and where on arena hardware it lives).
- `STREAM_FRAME_CMD` `analog_x` / `analog_y` bytes (parsed and logged at `CommandProcessor.cpp:149-151` but never used) — plumb to panels as real-time motion offsets, or drop?
- `SWITCH_GRAYSCALE_CMD` value encoding inconsistency: command parameter values `1`/`0` (`constants.h:95-96`) but pattern-header byte uses `0x10`/`0x02` for the same concept. Unify in G6.
- "Greenscale" naming (`README.md:32`): retain or rebrand to "grayscale" for G6?

**What `timing.md` does NOT measure:** SPI clock + framing, end-of-message-to-display latency, panel BCM / bit-plane timing, all-on/all-off transitions, panel-to-panel transmission gap, mode-switch latency, Ethernet round-trip. These remain TBD for G6 and must be measured separately (likely on the prototype single-panel SPI test rig per the prior plan's Prototype Phase). The richer numbers that *do* exist in the repo are in `README.md:57-77` ("Measured performance"): SD reads ~2 µs cached / ~600 µs at FAT cluster boundaries; pattern-switch latency 1–19 ms; TCP streaming drop rate 0.27% at 300 Hz / 0% binary at ~3000 Hz.

---

## Controller requirements for supporting G6 Protocol v1

The G6 controller preserves the G4 host interface and display-mode semantics, while internally targeting G6 v1 LED panels and using an SD card for pattern storage. The controller acts as a transport and timing engine, responsible for slicing full arena frames into per-panel subframes and forwarding them over one or two SPI buses.

### 1. Host Interface (G4-Compatible)

The host communicates with the controller using the existing G4 command set, including:

- Trial-params
- Set-frame-position
- Stream-frame
- Stop-display, all-on, all-off
- Set-refresh-rate (host override of the `gs_val`-derived default)
- Get-ethernet-ip-address
- Get-controller-info (G6-new; covers G6-mode detection + v2 capability detection)

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

**Block-size composition:** the on-disk panel block is 53 bytes (GS2) / 203 bytes (GS16) = 1-byte panel-protocol header + 1-byte command + pixel data + 1-byte stretch (canonical per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). Section 3 below uses 51 / 201 to refer to *just* pixel data + stretch — same panels, different abstraction layer.

### 3. Frame Slicing

All frames — whether streamed from the host or loaded from SD — are provided as full arena images, organized as subframes stored sequentially by **panel set**.

For each frame update, the controller must:

1. Slice the full arena frame into 20×20 subframes, one per panel.
2. Use Panel Mask in the Pattern Header to determine which panels are being sent (for v1 implementation, it will be fine to assume all panels are present, sending pattern data to all).
3. Pack each subframe into the G6 v1 pixel formats:
   - 51 bytes for 2-level (1 bit/pixel) + stretch
   - 201 bytes for 16-level (4 bits/pixel) + stretch
4. Send each subframe to the appropriate panel using G6 v1 oneshot commands.

(51 / 201 = pixel data + stretch byte. The on-disk panel block in Section 2 is 2 bytes larger because it also carries the panel-protocol header + command bytes.)

### 4. Panel Routing (Panel Map)

The controller loads a **static panel map** that defines panel routing and arena geometry. Each panel map entry specifies (region, panel_row, panel_col), with panel IDs implicit from row-major order. There is an alternative suggestion to store the minimal version of this in the pattern header (to be resolved soon).

From the panel map, the controller derives:

- the number of panels (and therefore "subframes" in the arena frame)
- the number of rows (SPI chip-select lines)
- the number of columns
- the number of regions (SPI buses)

Panels are grouped into **panel sets**, where each set contains **one panel per region** sharing the same `panel_row` and within-region column offset. To transmit a frame, the controller iterates over panel sets: it enables the chip-select for the corresponding row, sends pattern data to all regions in parallel, then disables the chip-select.

**Panel-map storage:** standalone panel-map file is dropped — `maDisplayTools v2` writes the 6-byte panel mask + `row_count` + `col_count` directly into the 18-byte pattern header (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). **Region / SPI-bus assignment is NOT carried in the pattern header** and remains the open gap (classified as New for G6 in the Reconciliation table above).

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

### Modes table (all five, with version)

| Mode | Name | Version introduced | Behavior |
| :-: | :-- | :-: | :-- |
| **1** | Position Function (TSI) | v2 | Controller reads next 5-byte record from selected `.TSI` file at each time step; resolves `FrameIndex16 → PSRAMAddress24`; sends a panel `display-by-index` command (`0x50`); updates DO/AO outputs. Valid only in Local Storage Mode (see § Major updates for v2). |
| **2** | Open Loop | v1 | At each frame interval: load frame from SD → slice → pack → send. |
| **3** | Show Frame (host-commanded position) | v1 | Host gives frame index via `set-frame-position`; controller loads → slices → sends. |
| **4** | Closed Loop Velocity | v1 | Controller reads analog voltage on AI line, integrates rate to determine frame index, then loads → slices → sends. Lowest priority for G6 v1; AI source TBD per `g6_07`. |
| **5** | Streaming | v1 | Host sends raw arena frames; controller slices → packs → sends immediately. No SD or PSRAM access required. |

> **⚠ Flag — Mode 1 not described in the v1 Modes section above.** The v1 source spec listed only Modes 2–5 since Mode 1 (TSI) was introduced in v2. The Modes table above is the unified five-mode reference; the source-tab v1 list will read as incomplete unless cross-referenced. Phase 2 consolidation can drop the per-version Modes lists in favor of this unified table.

### 7. Utility Commands

- `all-on`
  - Optional but helpful. Send appropriate subframe patterns to all active panels. As a simplification, only implement `all-on`, but not `all-off` since `stop-display` should do the same thing.
- `stop-display`, `set-refresh-rate`, `get-ethernet-ip-address`, to be implemented as in G4.1.
- Do **not** implement `switch-grayscale` and `display-reset` in v1, as they are not required.

**Decided (2026-05-02): drop both opcodes.** `DISPLAY_RESET_CMD` (0x01) was already a no-op in slim G4.1 (`CommandProcessor.cpp:53-55`); dropping it is paperwork. `SWITCH_GRAYSCALE_CMD` (0x06) was functional in slim (`CommandProcessor.cpp:57-69`) but is supplanted by the canonical pattern-header `gs_val` byte (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). Hosts will not send these opcodes for G6.

---

## Host Command Summary

This is a copy of the G4.1 commands. Possibly adjust for G6 use.

| Name | G4 Starting bytes | Version | Comment |
|---|---|---|---|
| Trial-params | `0x0c, 0x08` | v1 | "Combined command" |
| Set-frame-position | `0x03, 0x70` | v1 | |
| Stream-Frame | `0x32` | v1 | G6 frame-data length differs (see below) |
| Stop-Display | `0x01, 0x30` | v1 | Also doubles as "all off" |
| all-on | `0x01, 0xff` | v1 | Carry over from slim G4.1 (host-composed via Mode 5 is also possible but `0xff` opcode stays canonical for arena bring-up) |
| all-off | `0x01, 0x00` | v1 | Carry over from slim G4.1 (same rationale as all-on) |
| Set-refresh-rate | `0x03, 0x16` | v1 | Sets SPI re-transmission rate. **Default depends on `gs_val` from the loaded pattern** — slim G4.1 picks 300 Hz for greenscale and 1000 Hz for binary; G6 inherits the same defaults but reads `gs_val` from the v2 pattern header instead of the dropped `switch-grayscale` opcode. Host can override via this command. |
| Get-ethernet-ip-address | `0x01, 0x66` | v1 | Returns DHCP-resolved IP as ASCII (matches slim G4.1) |
| Get-controller-info | `0x01, 0x67` | v1 (G6-new) | Returns `{version, capability_bitmap}` with version-dispatched payload — covers v1 G6-mode detection AND v2 capability detection (Local Storage, Mode 1 TSI, v3 gated, …). |
| g6-panel-storage-mode | `0x02, 0x40, mode_byte` | v2 (G6-new) | Switches controller from SD Mode (`mode_byte = 0`) to Local Storage Mode (`mode_byte = 1`); triggers the load phase that copies SD patterns into panel PSRAM. |

**Stream-Frame for G6:** retains the slim G4.1 7-byte stream header `[0x32, len_lo, len_hi, ax_lo, ax_hi, ay_lo, ay_hi, ...]`. Frame-data bytes follow `frame_size = 4 + (num_panels × block_size)` with `block_size = 53` (GS2) or `203` (GS16). For a 2×10 G6 arena: 1064 B (GS2) / 4064 B (GS16) of frame data plus the 7-byte stream header.

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

- Stored on SD as `tsi<NNNN>_<descriptive-name>.tsi` (4-digit zero-padded ID + underscore + descriptive name + extension), matching the `.PAT` file convention.
- To avoid adding a new host-side command, use existing fields in `trial-params`:
  - `InitPos-LO` / `InitPos-HI` → together encode the TSI file index (`1` → `tsi0001_*.tsi`, etc.)

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

**DO/AO pin assignments resolved** by [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md): TSI DO byte → Teensy D35 (level-translated to BNC J4); TSI AO 16-bit → MCP4725 I²C DAC (BNC J27, upper 12 bits used by the 12-bit DAC). With jumper J30 default = open (Teensy-mediated EINT), Mode 1 DO toggles do not interfere with the panel-trigger path.

### 5. G6-specific controller commands

- **`g6-panel-storage-mode`** (opcode `0x40`) — switches controller from **SD Mode** (default, `mode_byte = 0`) to **Local Storage Mode** (`mode_byte = 1`). When transitioning to Local Storage Mode, triggers the load phase that copies SD patterns into panel PSRAM. Wire form: `[0x02, 0x40, mode_byte]`.
- **`get-controller-info`** (opcode `0x67`) — returns `{version, capability_bitmap}` with version-dispatched payload. Covers v1 G6-mode detection AND v2 capability detection (Local Storage, Mode 1 TSI, v3 gated/persistent, etc.). Request: `[0x01, 0x67]`. Response payload format TBD pending v2 capability-bit assignments.

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

**Implementation path for the error display (recommended):** compose the error pattern controller-side as a 20×20 subframe and send to all panels via the existing `0x30` SetFrame command — works on v1 panel firmware today, no panel-firmware changes needed. The v4/v5 predefined-pattern flash mechanism the source spec implies does **not** exist in any firmware (confirmed via [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) v4/v5 reconciliation).

---

## v3 controller scope

v1, v2, and v3 are being designed together. Controller changes for v3 are minimal: the v3 panel commands (Trigger / Persistent / Gated / Gated-Persistent variants — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v3, including the pending Trigger-vs-Gated terminology review) need a corresponding controller dispatcher, but most of the existing v1/v2 transport logic carries over unchanged. Specific controller-side additions:

- Recognize v3 header byte `[0x03]`/`[0x83]` and route to v3 command handlers (alongside v1/v2 handlers per the version-superset rule).
- Forward the EINT line state to panels — for the production `arena_10-10`, the wiring runs through the `arena_10-10` jumper J30 (default OPEN per `g6_07-arena-firmware-interface.md`), so the controller drives `TNY.EINT` (Teensy D36) based on whatever software policy the v3 trigger-mode design specifies.
- v4 (predefined patterns + stretch) is deferred to future work — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v4.

---

## Open Questions / TBDs

1. **No G6 controller firmware exists.** All G6-specific behavior here is aspirational. Slim G4.1 baseline (`8f1029f`) is reconciled into the carry-over / modify / new / drop tables in Current state. Next phase: build G6 controller against those tables.
2. **Region / SPI-bus information missing from v2 pattern header.** Cross-doc with [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md). Three options: arena-config sidecar, computed from `col_count` + fixed regions, or extend the v2 header.
3. **Closed-loop (Mode 4) analog voltage source.** Slim has `gain_` stored but never read; closed loop runs on an internal counter, not an analog input. Decide where the signal comes from on G6 (`g6_07` exposes 2× ±10V AI lines on D14/D15) and whether closed loop is in scope for G6 v1.
4. **`all-on` semantics in v2 + Local Storage Mode.** When all frames are in PSRAM, does `all-on` still build a one-shot all-on subframe (v1 behavior) or become a new opcode pointing at a pre-loaded "all-on" PSRAM index?
5. **Pattern Backend ("Modes 2–4")** vs Section 6 (Modes 2, 3, 4, **and 5**) vs v2 update ("Modes 2, 3, 4, and 5 work exactly as in v1") wording inconsistency. Slim implements only Modes 2/3/4 as top-level dispatch; Mode 5 streaming exists as a state (`STREAMING_FRAME`) but no Mode 5 enum value.
6. **`STREAM_FRAME_CMD` `analog_x` / `analog_y` bytes** — keep, drop, or repurpose? Parsed and logged at `CommandProcessor.cpp:149-151` but never plumbed in slim.
7. **"Greenscale" naming retention vs rebrand to "grayscale"** for G6 — slim keeps the legacy "greenscale" name. Pick one and use consistently.
8. **`SET_REFRESH_RATE_CMD` (0x16) upper bound** for G6 — slim accepts any `uint16_t` Hz. G6 panel BCM may impose a hard ceiling the controller should enforce. Needs G6-side measurement. Note: the *default* refresh rate is `gs_val`-derived (300 Hz for greenscale, 1000 Hz for binary, inheriting slim's defaults but reading from the v2 pattern header instead of the dropped `switch-grayscale` opcode); host can override via 0x16.
9. **Pattern header bit-packing fragility** in slim (`PatternHeader.h:6-15` — 56-bit union backed by `uint64_t` without `__attribute__((packed))`). G6 should switch to an explicit `uint8_t[18]` or packed struct for the v2 header.
10. **`get-controller-info` (0x67) response payload format** — capability bitmap layout TBD pending v2 capability-bit assignments (`v2_local_storage`, `mode_1_tsi`, `v3_gated`, etc.).
11. **Per-version command-carry-over scope** — the v2/v3 superset rule (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md)) implies higher-version panels accept lower-version commands. Reviewing whether all of slim G4.1's carry-over candidates truly need to be supported in G6 v2/v3 panels (vs. left for the controller alone).

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
