# G6 — Controller (Teensy SW)

Source: G6 panels protocol v1 proposal ([Google Doc `17crYq4s...`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#), tabs "Controller Teensy SW" + "Major updates for v2" + "v3 and onwards…").
Status: **Draft (v1 spec) + Teaser (v2) + Stub (v3+)**. **No G6 controller firmware exists yet.** The G4.1 slim baseline ([floesche/LED-Display_G4.1_ArenaController_Slim](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim)) is the structural starting point; the spec below is the forward-looking G6 surface.

This file describes the host-PC ↔ controller interface and the controller-side responsibilities for slicing, packing, and transmitting frames over SPI to G6 v1 panels. The controller acts as a transport-and-timing engine: it preserves the G4 host command set, loads/streams full arena frames, slices them per panel, encodes G6 v1 panel messages, and transmits them on one or more SPI buses.

---

## Current state

There is **no G6 controller firmware** yet. Both candidate G6 panel firmwares ([`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) for v1 and [`G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) for the v3 prototype rig) target the panel side, not the controller. The G4 baseline is the **slim G4.1 Arena Controller** ([`LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) — PlatformIO Teensy 4.1 project, ~1/4 the LOC of the legacy G4.1 controller, no QP framework).

### Reconciliation: Controller spec vs G4.1 slim baseline

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
| `GET_ETHERNET_IP_ADDRESS_CMD` (0xC1) | `commands.h:13`, `CommandProcessor.cpp:117-119` | ✓ utility command |
| TCP framing (port 62222, `[len, cmd, ...]` binary form, `[0x32, len_lo, len_hi, …]` stream form) | `NetworkManager.cpp:50-95`, `constants.h:126,127,128` | ✓ retained — G6 firmware also accepts the same command stream over **USB-CDC serial** (same framing; see [`g6_05`](g6_05-host-software.md) § Host control options) |
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
| SPI framing: emit v1 panel-protocol bytes with parity | `SpiManager::transferPanelSet` (`SpiManager.cpp:70-84`) writes panel buffer raw — no parity computed | Apply the parity ownership rule from [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Panel Block Format: validate parity on SD reads (pre-formatted blocks pass through unchanged in Modes 2/3); recompute parity for any block the controller synthesizes (Modes 4/5, all-on, all-off, error displays, ISP). |
| Pattern header: G4 has 7-byte/8-byte union → G6 needs 18-byte v2 header | `PatternHeader.h:6-15`, `constants.h:100` (`pattern_header_size = 7`) | Adopt the 18-byte v2 layout from [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md): G6PT magic + version + Arena/Observer IDs + frame count + row/col counts + gs_val + panel mask + checksum. **Use a plain `uint8_t[18]` array with explicit byte-by-byte access** rather than a bit-packed struct/union — the G4.1 slim baseline's `uint64_t` union without `__attribute__((packed))` is fragile across compilers. Parsing should be one explicit `if/switch` per field, not pointer-casting. |
| CS-line count and pin matrix | Hard-coded 5×6 GPIO map for G4.1 wiring in `panel_set_select_pins[5][6]` (`constants.h:77-83`); `region_count_per_frame=2` (`constants.h:68`) | Re-wire for G6 arena (`Generation 6/Arena/` `v1.1.7` production); count and per-row count depend on arena geometry. |
| `fillBufferAllOn` duty_cycle values (1 grayscale, 50 binary) | `SpiManager.cpp:170-193` | Re-derive for G6 panel-protocol v1 duty_cycle semantics. |
| `STREAM_FRAME_CMD` payload size | `CommandProcessor.cpp:140-190`: 7-byte header + frame data; `analog_x`/`analog_y` bytes parsed and logged but unused | G6 frame data sizes differ (binary 51 B/panel × N or grayscale 201 B/panel × N at panel level; on-disk panel block 53/203 — pick which the wire format uses). Decide whether `analog_x`/`analog_y` survive G4→G6. |
| Refresh-rate defaults (300 Hz greenscale / 1000 Hz binary) | `constants.h:122-123` | Reconcile with G6 panel BCM/bit-plane timing budgets — currently unmeasured. |
| `TRIAL_PARAMS_CMD` (0x08) payload (12 param bytes) | `CommandProcessor.cpp:83-115` | G6 may need an extra byte (panel-mask override or trigger config). |
| `grayscale_value` on-disk byte encoding | Pattern header byte 4 = `0x10` greenscale, `0x02` binary (`CommandProcessor.cpp:300-310`); clashes with command parameter values `1`/`0` (`constants.h:95-96`) | G6 should pick one encoding and document. |

**New for G6 (must be added; not in slim):**

| Item | Why new | Notes |
|---|---|---|
| Panel-map data structure with regions / SPI-bus / CS | Slim has only the fixed `panel_set_select_pins` matrix + `region_count_per_frame=2`; no per-panel routing | Controller `#include`s [`g6_arena_configs.h`](g6_arena_configs.h) and indexes by Arena ID from the pattern header. No runtime config. |
| Panel-set ordering for parallel transmission | Slim iterates column-major (`SpiManager.cpp:92-99`); G6 spec section 4 calls for panel-set iteration | Resolution pending: either (a) port G4's column-major iteration as-is and update G6 spec § 4 to match, (b) implement panel-set iteration in the controller per current spec, or (c) make ordering configurable per arena. Pick during G6 controller bring-up. |
| Controller-side parity computation | Not present | See Modify section above. |
| v2 PSRAM workflow + TSI parsing for Mode 1 | Mode 1 absent (`modes.h:6-10`); no PSRAM-related code anywhere | Adds load-phase logic, `(PatternID, FrameIndex16) → PSRAMSlotIndex24` mapping table, TSI 5-byte record parser, DO/AO output drivers (pin assignments depend on arena hardware). |
| `g6-panel-storage-mode` host command | Not in `ArenaCommands` enum | Opcode `0x40` assigned (see Command Registry). |
| EINT trigger-line wiring (input GPIO) used by v1 Triggered/Gated | Slim has no input pins beyond CS lines | Single trigger input to be added. Wiring depends on arena hardware. |
| Magic / format-version field / CRC-8 header + per-frame CRC-16 | None in `PatternHeader.h:6-15` | Adopt v2 layout per `g6_04`: CRC-8/AUTOSAR over the 17-byte header (byte 17) + CRC-16/CCITT trailer per frame (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § CRC-8 algorithm and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Frame Format). |
| Mode 1 (TSI Position Function) and Mode 5 (Streaming) top-level dispatch | Slim implements only Modes 2/3/4 (`modes.h:6-10`); Mode 5 streaming is partially built via `STREAMING_FRAME` state but no top-level mode dispatch | Add full mode dispatch for Modes 1–5. |

**Drop / not needed for G6:**

| Item | Slim source | Rationale |
|---|---|---|
| `DISPLAY_RESET_CMD` (0x01) "reset to FPGA" semantics | `CommandProcessor.cpp:53-55` | No FPGA in Teensy slim path; spec § 7 explicitly says drop. |
| `SWITCH_GRAYSCALE_CMD` (0x06) | `commands.h:9`, `CommandProcessor.cpp:57-69` | Spec § 7 explicitly says drop. May reconsider if G6 ergonomics need it. |
| `frame_count_y` field of `PatternHeader` | `PatternHeader.h:9` | Dead weight; bytes reused in v2 layout. |
| `row_signifier` byte between panel rows in pattern files | `SpiManager.cpp:113` (`++pos;` skips it) | Vestigial padding; v2 pattern files (`g6_04`) drop it. |

(See § Timing measurements still needed (G6 bring-up) at the bottom for the SPI/BCM/Ethernet-RTT numbers `timing.md` does NOT cover.)

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

**Block-size composition:** the on-disk panel block is 53 bytes (GS2) / 203 bytes (GS16) = 1-byte panel-protocol header + 1-byte command + pixel data + 1-byte duty_cycle (canonical per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)). Section 3 below uses 51 / 201 to refer to *just* pixel data + duty_cycle — same panels, different abstraction layer.

### 3. Frame Slicing

All frames — whether streamed from the host or loaded from SD — are provided as full arena images, organized as subframes stored sequentially by **panel set**.

For each frame update, the controller must:

1. Slice the full arena frame into 20×20 subframes, one per panel.
2. Use Panel Mask in the Pattern Header to determine which panels are being sent (for v1 implementation, it will be fine to assume all panels are present, sending pattern data to all).
3. Pack each subframe into the G6 v1 pixel formats:
   - 51 bytes for 2-level (1 bit/pixel) + duty_cycle
   - 201 bytes for 16-level (4 bits/pixel) + duty_cycle
4. Send each subframe to the appropriate panel using G6 v1 oneshot commands.

(51 / 201 = pixel data + duty_cycle byte. The on-disk panel block in Section 2 is 2 bytes larger because it also carries the panel-protocol header + command bytes.)

### 4. Panel Routing (Panel Map)

The panel map is the entry from [`g6_arena_configs.h`](g6_arena_configs.h) selected by Arena ID (pattern-header bytes 4–5). Each entry specifies per-panel `(panel_row, panel_col, spi_bus, cs_gpio, cs_sub_index)` plus per-arena `row_count`, `col_count`, and `num_spi_buses`. The header is currently hand-maintained against the [maDisplayTools arena registry](../../Generation%206/maDisplayTools/configs/arena_registry/README.md) (host-canonical YAML — registered IDs, geometry, panel-mask defaults); an eventual Python codegen under `maDisplayTools/tools/` will emit the header from registry YAML + a sibling hardware-topology YAML (SPI bus + CS GPIO per column). No runtime config, no sidecar file at deploy time.

From the panel map the controller derives the number of panels, SPI chip-select lines, columns, and regions (SPI buses). Panels are grouped into **panel sets**, where each set contains one panel per region sharing the same `panel_row` and within-region column offset. To transmit a frame, the controller iterates over panel sets: enables the chip-select for the row, sends pattern data to all regions in parallel, then disables the chip-select.

The 18-byte pattern header carries the 6-byte panel mask + `row_count` + `col_count` (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)); region/SPI-bus assignment comes from the Arena-ID lookup, not the header.

### 5. Panel Protocol v1 Messaging

Each panel update uses a [v1 panel message](g6_01-panel-protocol.md#panel-version-1). The controller strictly handles formatting, transmission and timing.

### 6. Mode Behavior on G6

The controller must support **G4 display Modes 2, 3, 4, and 5:**

- **Mode 2 (Open Loop)**
  - At each frame interval: load frame from SD → slice → pack → send.
- **Mode 3 (host-commanded position)**
  - Host gives frame index via `set-frame-position`; controller loads → slices → sends.
- **Mode 4 (Closed Loop Velocity)**
  - Controller samples **AIN0** (Teensy D14, BNC J28, ±10 V via OPA2277 → 0–3.3 V at ADC) at **500 Hz**, computes frame rate as `fps = AI_voltage × 100 × gain / 10` where `gain` is the signed 8-bit byte from `trial-params` encoded as **10× the actual scaling factor** (e.g., `gain = -20` represents -2.0 fps/V scaling for typical G3-flight-arena behavior). 1 V at the AI input therefore maps to 100 base counts, scaled by gain to yield signed fps. Integrates fps over time to advance frame index, then loads → slices → sends. AIN1 (D15, J29) unused for Mode 4 (available for experimenter).
- **Mode 5 (Streaming)**
  - Host sends raw arena frames; controller slices → packs → sends immediately.

Mode 4 is the lowest implementation priority for G6 v1.

### Modes table (all five, with version)

| Mode | Name | Version introduced | Behavior |
| :-: | :-- | :-: | :-- |
| **1** | Position Function (TSI) | v2 | Controller reads next 5-byte record from selected `.TSI` file at each time step; resolves `FrameIndex16 → PSRAMSlotIndex24`; sends a panel `display-by-index` command (`0x50`); updates DO/AO outputs. Valid only in Local Storage Mode (see § Major updates for v2). |
| **2** | Open Loop | v1 | At each frame interval: load frame from SD → slice → pack → send. |
| **3** | Show Frame (host-commanded position) | v1 | Host gives frame index via `set-frame-position`; controller loads → slices → sends. |
| **4** | Closed Loop Velocity | v1 | Controller reads analog voltage on AI line, integrates rate to determine frame index, then loads → slices → sends. Lowest priority for G6 v1; AI source is AIN0 / D14 / BNC J28 (see § 6 Mode Behavior). |
| **5** | Streaming | v1 | Host sends raw arena frames; controller slices → packs → sends immediately. No SD or PSRAM access required. |

> **⚠ Flag — Mode 1 not described in the v1 Modes section above.** The v1 source spec listed only Modes 2–5 since Mode 1 (TSI) was introduced in v2. The Modes table above is the unified five-mode reference; the source-tab v1 list will read as incomplete unless cross-referenced. Phase 2 consolidation can drop the per-version Modes lists in favor of this unified table.

### 7. Utility Commands

- **`all-on`** (`0x01, 0xff`) and **`all-off`** (`0x01, 0x00`) — controller-side opcodes for arena bring-up and host-facing diagnostic ergonomics. Internally `all-off` collapses to the same `ALL_OFF` state as `stop-display`; the duplication is for host clarity, not for distinct internal semantics.
- **`stop-display`**, **`set-refresh-rate`**, **`get-ethernet-ip-address`** — standard G4-compatible host commands.
- **`set-diagnostic-output`** (`0x02, 0xC3, on`) — mutes (`on = 0`) or unmutes (`on = 1`) the controller's `DEBUG_SERIAL` diagnostic text stream on the shared USB-CDC pipe; no effect on a non-diagnostic firmware build (still acked). Interactive clients (web-serial) mute on connect for a clean command/response channel; the CIPO capture scripts re-enable it. Flag persists across reconnects. Always acked so the wire protocol is uniform across builds.
- **`switch-grayscale`** (0x06) and **`display-reset`** (0x01) — **dropped for G6.** The canonical pattern-header `gs_val` byte (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)) replaces `switch-grayscale`; `display-reset` has no G6 meaning. Hosts will not send these opcodes for G6.

---

## Command Registry

**Source of truth for Host → Controller commands** — the controller's own command set,
mirrored by `Arena-Firmware/src/commands.h` (`enum ArenaCommands`); these MUST be kept in sync.

**Controller → Panel** (SPI) commands are a separate namespace whose authority is
[`g6_01`](g6_01-panel-protocol.md) § Master command summary (mirrored by
`Panel-Firmware/panel/src/protocol.h`), not this file — see the pointer under § Controller →
Panel commands below. The two are independent wires: the same byte means different things on
each (e.g. `0x30` = stop-display to the controller, but Display-16-Level-Grayscale to a
panel), so never merge them into one flat list.

### Host → Controller commands

`cmd` is the command byte; "Wire form" shows the full framed message `[len, cmd, …]`
(`len` = byte count after the length prefix). Response: `[len, status, echo_cmd, ASCII msg]`.

The **Version** column tracks the *controller capability generation* that introduced the host
command (v1 = G4 baseline + G6 v1; v2 = the PSRAM / Local-Storage feature set), which is a
different axis from the *panel protocol version* in the header byte of Controller → Panel
commands. There are deliberately **no v3 host commands**: panel-protocol v3 (diagnostics,
predefined patterns, Triggered/Gated) is reached through existing host commands plus the EINT
line and the controller's v3 dispatcher, not through new host opcodes. The host's only v3
surface today is capability detection via `get-controller-info` (`0xC2`) bits `v3_triggered` /
`v3_gated`. A dedicated v3 host command would be added here only if/when one is specced.

| cmd | Name | Wire form | Version | Notes |
|:-:|---|---|:-:|---|
| `0x00` | all-off | `0x01, 0x00` | v1 | Arena bring-up; collapses to the `ALL_OFF` state (same as stop-display). |
| `0x01` | display-reset | `0x01, 0x01` | — | **Dropped for G6** — no G6 meaning; recognized only to reject. |
| `0x06` | switch-grayscale | `0x01, 0x06` | — | **Dropped for G6** — grayscale inferred from stream size / pattern-header `gs_val`. |
| `0x08` | trial-params | `0x0c, 0x08, …` | v1 | "Combined command": selects Mode 2/3/4 + pattern + timing (12 param bytes). |
| `0x16` | set-refresh-rate | `0x03, 0x16, lo, hi` | v1 | uint16 Hz. Default from `gs_val`: 300 Hz GS16 / 1000 Hz GS2; host may override. |
| `0x17` | get-refresh-rate | `0x01, 0x17` | v1 (G6-new) | Returns current refresh rate as uint16 LE Hz. Reflects the last `set-refresh-rate` value, or the mode-derived default if never overridden. |
| `0x30` | stop-display | `0x01, 0x30` | v1 | Also doubles as all-off. |
| `0x32` | stream-frame | `0x32, len_lo, len_hi, …` | v1 | Mode 5; 3-byte stream header (see below). |
| `0x33` | get-frames-sent | `0x01, 0x33` | v1 (G6-new) | Returns frames pushed to panels since boot or last `reset-frames-sent` as uint32 LE. Defined in webDisplayTools; firmware implementation pending. |
| `0x34` | reset-frames-sent | `0x01, 0x34` | v1 (G6-new) | Zeroes the frames-sent counter. Defined in webDisplayTools; firmware implementation pending. |
| `0x40` | g6-panel-storage-mode | `0x02, 0x40, mode_byte` | v2 (G6-new) | `0` = SD Mode, `1` = Local Storage Mode; triggers the PSRAM load phase. |
| `0x41` | g6-program-panel | `0x02, 0x41, panel_index, filename[32]` | v2 (G6-new) | Reflash a panel from `/firmware/<filename>` on SD. See § Panel firmware update (ISP). |
| `0x80` | get-file-count | `0x01, 0x80` | v2 (G6-new) | Returns the number of pattern files on the SD card as uint16 LE. |
| `0x82` | get-pattern-filename | `0x03, 0x82, idx_lo, idx_hi` | v2 (G6-new) | Returns the filename for the pattern at 1-based uint16 `idx` (same convention as `patternId` in trial-params). Response payload: 1-byte length + ASCII filename chars. |
| `0x83` | set-pattern-filename | `0x83, idx_lo, idx_hi, len, char0…charN` | v2 (G6-new) | Renames the pattern file at 1-based uint16 `idx` to the name given by `len` (uint8) + ASCII chars. `idx = 0` is a special case: renames `/patterns/pattern.temp` to the given name. Returns an error if `idx > patternCount()` or if the target file does not exist. On success the Teensy re-scans and re-sorts `/patterns`; response payload: uint16 LE new 1-based index of the renamed file in the updated list. |
| `0x84` | get-pattern-file | `0x84, idx_lo, idx_hi` | v2 (G6-new) | Returns the full content of the pattern file at 1-based uint16 `idx`. Response payload: uint64 LE length prefix followed by file data. |
| `0x85` | set-pattern-file | `0x85, idx_lo, idx_hi, len_b0…len_b7, file_data…` | v2 (G6-new) | Overwrites the content of the pattern file at 1-based uint16 `idx`. Uses 8-byte (uint64 LE) length prefix after the index; `len` = file size in bytes. `idx = 0` is a special case: writes the file data to `/patterns/pattern.temp` (creating or overwriting it). Returns an error if `idx > patternCount()`. |
| `0x86` | delete-pattern-file | `0x03, 0x86, idx_lo, idx_hi` | v2 (G6-new) | Deletes the pattern file at 1-based uint16 `idx`. `idx = 0` deletes `/patterns/pattern.temp` if it exists. Returns an error if `idx > patternCount()` or the target file does not exist. Rescans after deletion. |
| `0x8F` | delete-all-patterns | `0x01, 0x8F` | v2 (G6-new) | Deletes all files in `/patterns` (including `pattern.temp` if present). Rescans after deletion. |
| `0xC0` | set-ethernet-ip-address | — | v2 (G6-new) | Reserved — not yet implemented. Paired with `get-ethernet-ip-address`. |
| `0xC1` | get-ethernet-ip-address | `0x01, 0xC1` | v1 | Returns DHCP-resolved IP as ASCII. |
| `0xC2` | get-controller-info | `0x01, 0xC2` | v1 (G6-new) | Returns `{version, capability_bitmap}`, version-dispatched (G6-mode + v2 capability bits). |
| `0xC3` | set-diagnostic-output | `0x02, 0xC3, on` | v1 (G6-new) | Mute (`0`) / unmute (`1`) `DEBUG_SERIAL` diagnostics on USB-CDC. See § 7 Utility Commands. |
| `0xC4` | get-diagnostic-output | `0x01, 0xC4` | v1 (G6-new) | Returns current diagnostic-output state as a single byte (`0` = muted, `1` = active). Firmware implementation pending. |
| `0xC5` | set-spi-clock | `0x03, 0xC5, lo, hi` | v1 (G6-new) | uint16 LE MHz (1–30); response payload carries the applied clock as uint16 LE. Defined in webDisplayTools; firmware implementation pending. |
| `0xC6` | get-spi-clock | `0x01, 0xC6` | v1 (G6-new) | Returns current SPI clock as uint16 LE MHz. Defined in webDisplayTools; firmware implementation pending. |
| `0x70` | set-frame-position | `0x03, 0x70, lo, hi` | v1 | Mode 3: host-commanded frame index (uint16). |
| `0xFF` | all-on | `0x01, 0xff` | v1 | Arena bring-up; canonical for diagnostics. |

**Stream-Frame for G6:** uses a **3-byte stream header** `[0x32, len_lo, len_hi, ...]`. The legacy `analog_x` / `analog_y` bytes are **not used in G6** — experimenters with motion-offset needs use Mode 4 closed-loop or a separate AI-driven workflow. Frame-data bytes follow `frame_size = 4 + (num_panels × block_size)` with `block_size = 53` (GS2) or `203` (GS16). For a 2×10 G6 arena: 1064 B (GS2) / 4064 B (GS16) of frame data plus the 3-byte stream header.

### Controller → Panel commands

The controller issues these to panels over SPI, but their **authoritative definition lives in
[`g6_01`](g6_01-panel-protocol.md) § Master command summary** — full opcodes, payloads,
parity, CIPO confirmation, and per-mode semantics. Not duplicated here, to keep one authority
per namespace.

Reminder: panel opcodes share byte values with the host commands above but are a distinct
namespace on a different wire (e.g. panel `0x30` = Display 16-Level Grayscale, host `0x30` =
stop-display).

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
     - A unified internal table is built mapping `(PatternID, FrameIndex16) → PSRAMSlotIndex24`.
   - After loading, Modes 1–4 use index-based v2 panel commands instead of streaming full frames.
   - No hybrid mode: runtime uses either SD Mode or Local Storage Mode exclusively.
   - For later version, evaluate removing SD usage entirely. Pattern-frames could be streamed over Ethernet, sliced and sent out to panels for storage.

Pattern IDs and frame indices remain 16-bit externally; only the internal PSRAM slot indices are 24-bit (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § PSRAM addressing model and lifecycle, slot indices are opaque to the controller — firmware picks the byte stride). This mode switch does not change Pattern IDs or frame index values as seen by the host — only the controller's internal implementation.

### 2. Unified Frame Index Space (Host Still Uses 16-bit IDs)

Externally (host ↔ controller), Pattern IDs and Frame indices remain 16-bit values exactly as in G4.

Internally, in Local Storage Mode, the controller maps:

```
(PatternID, FrameIndex16) → GlobalFrameIndex16 → PSRAMSlotIndex24
```

- Panels only receive 3-byte PSRAM slot indices during v2 display commands.
- This mapping layer is entirely internal to the controller.

### 3. Local Storage Load Phase

Upon entering Local Storage Mode:

1. Controller scans SD metadata for pattern and frame structure.
2. Assigns each frame a global `FrameIndex16`.
3. Uploads every frame to panel PSRAM using v2 write commands.
4. Builds the mapping from `(PatternID, FrameIndex16)` to `PSRAMSlotIndex24`.

After this phase, Modes 1–4 run without reading arena frames from SD (except for TSI files in Mode 1).

#### Atomicity and recovery protocol

PSRAM is volatile and the panel-side preload is not a single atomic operation. To guarantee that every panel in the chain is displaying patterns from the *same* preload pass (no panel quietly running yesterday's table, no panel rebooted mid-load, no controller bookkeeping error producing a marked-loaded panel with garbage data), the controller MUST follow the protocol below. The mechanism rests on four pieces of v2 panel state defined in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § PSRAM addressing model and lifecycle: the **loaded-latch**, the **32-bit `load_generation`** token, the **`successful_write_count`** (panel-internal counter checked at `0x4F` time), and the **`storage_format_id`**.

**Preload protocol**:

1. Pick a fresh non-zero 32-bit `load_generation` for this preload pass. Random 32-bit values give low collision risk across sessions; a monotonic counter is acceptable only if the controller persists it across its own reboots (otherwise a controller restart with panels still powered may collide with a prior session's tokens). Zero is reserved as the "never loaded" sentinel and MUST NOT be used.
2. For each panel, unicast [`0x0F` Reset PSRAM](g6_01-panel-protocol.md) (clears slots, latch, generation, write counter, error). Broadcast `0x0F` is allowed ONLY on arena topologies where every panel has its own CIPO line (per-panel CS plus per-panel CIPO routing) — on shared-CIPO topologies, broadcasting would cause MISO contention as multiple panels attempt to drive the confirmation slot. Unicast is the safe default.
3. For each panel, for each slot to be loaded: unicast [`0x3F` Write 16-Level Grayscale to PSRAM](g6_01-panel-protocol.md). Validate the CIPO confirmation of each write. Note that CIPO confirmations are *delayed by one CS-active window* — the confirmation for `0x3F` write `K` arrives in the first 3 CIPO bytes of write `K+1` (or in the drain step below if `K` was the last). Two failure paths matter:
   - **Semantic-reject** (CIPO sentinel `cmd_echo = 0xFE`): the panel rejected the write at the protocol layer (e.g., out-of-range slot, write after Mark-Loaded — see `last_op_error` codes in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md)). Follow up with `0x2F` to read `last_op_error`, fix the controller-side error, then restart this panel's preload from step 2 (`0x0F` Reset) — controller and panel write counters are still in sync, but the partial table is no longer trustworthy.
   - **CIPO validation failure** (parity error, CRC mismatch, length error, or no echo at all): the controller cannot tell whether the panel accepted the write or not. Retrying in place would risk double-counting (panel accepted, controller didn't see it, controller retries, panel accepts again → panel counter ahead of controller). **Always abandon and restart this panel's preload from step 2 (`0x0F`)** on any CIPO validation failure — never retry the same slot write in place.

   Maintain a per-panel counter `controller_writes_since_reset` that the controller increments only after each `0x3F` is CIPO-validated. The controller MUST reset its own counter to zero on every `0x0F` it issues to that panel (mirrors panel state). Counter saturates at `0xFFFFFF` to match the panel; preload passes MUST stay well under this bound.
4. **Drain the final `0x3F` confirmation.** After the last `0x3F` write to a panel, CIPO confirmations are delayed: the final write's confirmation has not yet been delivered when the controller is ready to Mark-Loaded. Issue a unicast `0x2F` Query PSRAM Status — its first 3 CIPO bytes carry the final `0x3F`'s standard confirmation (per the drainage rule in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message). Validate that `prior_cmd == 0x3F` AND CRC validates AND `last_op_error == 0` in the `0x2F` extended response. Each of the failure modes the drain catches is distinct and important:
   - `prior_cmd == 0xFE` (PSRAM semantic-reject sentinel): the final `0x3F` was rejected at the panel. Restart this panel's preload from step 2.
   - `prior_cmd == 0x00` (empty-buffer sentinel `{0x81, 0x00, 0x00}`): the panel rebooted between accepting the final `0x3F` and the drain — its confirmation slot was wiped. Restart this panel's preload from step 2.
   - CRC validation failure: the drain's prior-confirmation bytes were corrupted on the wire. Restart this panel's preload from step 2.
   - `last_op_error != 0` in the extended response: a prior op in this pass was rejected but the controller missed the sentinel. Restart this panel's preload from step 2.

   Without this drain step the controller could issue `0x4F` while the final intended `0x3F` was actually rejected — and the count check would coincidentally pass (controller didn't count an unconfirmed write; panel didn't count the rejected write).

   Controller MUST NOT proceed to step 5 until every panel in the chain has been drain-validated. A panel that fails the drain check must be re-loaded before any panel sees `0x4F` — otherwise the recovery rule in step 5 would have to bail out chain-wide on a single-panel issue that was still cleanly recoverable here.
5. For each panel, unicast [`0x4F` Mark PSRAM Loaded](g6_01-panel-protocol.md) carrying `{load_generation, controller_writes_since_reset}`. The panel rejects (sentinel `0xFE` + `last_op_error = 0x06` `MARK_LOADED_COUNT_MISMATCH`) if its own write counter disagrees. **On reject: abort this entire preload pass and restart the protocol from step 1 across every panel in the chain with a fresh `load_generation`.** Reloading only the rejected panel with a fresh token while the rest of the chain holds the old token would recreate the generation-skew this protocol is designed to prevent.
6. For each panel, unicast [`0x2F` Query PSRAM Status](g6_01-panel-protocol.md); verify `status.latch_loaded = 1`, `load_generation` matches what was sent, `last_op_error == 0`, `slot_count_le24` is at least the number of slots used. Verify `storage_format_id` is **non-zero** (controller MUST refuse v2 production use of any panel reporting `0x00` — that ID is reserved for pre-registry firmware and offers no compatibility guarantee; debug/lab use with explicit operator opt-in MAY override) **and identical** across every panel in the chain — a mismatch means the chain is running heterogeneous firmware whose slot stride / per-slot metadata format may differ, and v2 display is unsafe until firmware is unified.

**Polling discipline** (deliberately not "before every display-mode entry" — that's too aggressive for tight stimulus loops):

- MUST query each panel's `0x2F` once after Mark-Loaded (step 5 above).
- MUST re-query whenever any of the following is observed:
  - CIPO empty-buffer sentinel `{0x81, 0x00, 0x00}` (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message) — a panel may have rebooted and lost its prior-confirmation slot.
  - Sentinel `cmd_echo = 0xFE` (PSRAM semantic-reject) on any v2 op.
  - Unsolicited error glyph observed by the operator.
- SHOULD re-query at coarse experiment boundaries (start of a new trial, return from operator-initiated pause).
- MUST NOT poll `0x2F` per stimulus frame in tight loops (e.g., Mode 1 at fixed time slices, see § 4 below) — rely on the sentinel mechanism for in-flight reset detection.

**Recovery protocol** (any panel returns `load_generation = 0`, a value other than the controller's current pass token, or `latch_loaded = 0`):

Recovery is **chain-wide atomic**, not per-panel. If any one panel needs reloading, every panel in the chain MUST be re-loaded with a fresh `load_generation`. This avoids the failure mode where reloading only the affected panel would leave its generation different from its neighbors — making "are all panels on the same load?" untrue and impossible to recover from in the next recovery pass.

1. **Blank the arena.** Stop streaming display commands and force every panel to a dark state. On per-panel-CIPO topologies, broadcast a 2L Oneshot with all-zero pixel data; on shared-CIPO topologies, unicast the same Oneshot to each panel sequentially. Single-panel reload during active display would recreate the spatial-inconsistency the latch + generation model exists to prevent.
2. **Pick a fresh `load_generation` `G'`** distinct from the prior pass token.
3. **Re-execute the preload protocol on every panel in the chain** (`0x0F` → all `0x3F` writes → drain `0x2F` to validate the final `0x3F` confirmation → `0x4F` with `G'` and the controller's count → `0x2F` to verify). Validate the `0x0F` confirmation in CIPO too (defense-in-depth — a `0x0F` whose CIPO doesn't echo cleanly may have been corrupted on the wire, and the subsequent preload state is suspect). Yes, this re-uploads patterns even to panels that didn't reset — the cost is one extra preload-pass duration, and in exchange the chain ends up in a known-consistent state.
4. **Resume or abort according to experiment policy.** For static stimulus libraries, automatic resume after chain-wide reload is often acceptable. For timing-critical Mode 1 loops at high frame rates (a 200 Hz loop loses ~32 frames during a 30-panel × 100-slot reload), the scientifically correct action is frequently abort + operator intervention. The controller exposes detection and chain-wide recovery as protocol primitives; the policy choice between auto-resume and abort lives at the experiment-configuration layer.

**Recovery cost.** Chain-wide recovery uploads `panels × slots × ~204 bytes` of pattern data plus a handful of bookkeeping ops. For an `arena_10-10` (30 panels × ~100 slots) preload that's ~600 KB of payload, ~160 ms at 30 MHz SPI before software / inter-frame gaps. For high-latency experimental loops this is a noticeable pause; controllers may want to schedule recovery at trial boundaries when possible.

**Capability negotiation note**: panel-side v2 capability advertisement (a dedicated "I am v2-capable" opcode) is still open design work — see the Compatibility note at the top of [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v2 — G6 Panel Protocol v2 — PSRAM-backed display. Until specced, the controller treats `0x2F` round-trip success as the de-facto v2-support probe.

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
2. Resolves `FrameIndex16 → PSRAMSlotIndex24` (based on `trial-params` arguments: `PatternID-LO` / `PatternID-HI`).
3. Sends a **display-by-index** panel command (`0x50` — Display PSRAM Index v2 command).
4. Updates DO and AO outputs accordingly.

Mode 1 is invalid in SD Mode.

**DO/AO pin assignments resolved** by [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md): TSI DO byte → Teensy D35 (level-translated to BNC J4); TSI AO 16-bit → MCP4725 I²C DAC (BNC J27, upper 12 bits used by the 12-bit DAC). With jumper J30 default = open (Teensy-mediated EINT), Mode 1 DO toggles do not interfere with the panel-trigger path.

### 5. G6-specific controller commands

- **`g6-panel-storage-mode`** (opcode `0x40`) — switches controller from **SD Mode** (default, `mode_byte = 0`) to **Local Storage Mode** (`mode_byte = 1`). When transitioning to Local Storage Mode, triggers the load phase that copies SD patterns into panel PSRAM. Wire form: `[0x02, 0x40, mode_byte]`.
- **`get-controller-info`** (opcode `0xC2`) — returns `{version_byte, capability_bitmap}` with the version byte dispatching the response shape. **Capability bitmap** (8-bit): bit 0 = `g6_mode` (always 1 for any G6 controller), bit 1 = `v2_local_storage`, bit 2 = `mode_1_tsi`, bit 3 = `v3_triggered`, bit 4 = `v3_gated`, bits 5–7 = reserved (transmit as 0; future bits land in a v2 controller-info opcode rev). Request: `[0x01, 0xC2]`. Response: `[0x01, 0xC2, version_byte, capability_byte]` (parity adjusted).

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

**Implementation path for the error display (recommended):** compose the error pattern controller-side as a 20×20 subframe and send to all panels via the existing `0x30` SetFrame command — works on v1 panel firmware today, no panel-firmware changes needed. The v3 predefined-pattern flash mechanism (`0x7x`) does **not** exist in any firmware yet.

---

## Controller scope for Triggered/Gated, v2 PSRAM, and v3

v1, v2, and v3 are being designed together. Controller-side additions across the three versions:

- **v1 Triggered/Gated** (`0x12`/`0x13`/`0x32`/`0x33` under header `0x01`/`0x81`) — dispatch alongside the v1 Oneshot/Persistent handlers. v1 Persistent (`0x11`/`0x31`) is already implemented in panel firmware; Triggered/Gated are specced and prototyped but not in v1 production firmware yet. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § `0x12`/`0x13` for semantics.
- **v2 PSRAM Triggered/Gated** (`0x52`/`0x53` implicit-`duty_cycle`, `0x62`/`0x63` explicit-`duty_cycle`) — add when v2 firmware lands. Note: low-nibble `1` is Persistent, `2` is Triggered, `3` is Gated (so `0x51`/`0x61` are PSRAM-Persistent, `0x53`/`0x63` are PSRAM-Gated). All four mode variants are specified in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v2.
- **v3 dispatcher** — recognize v3 header byte `[0x03]`/`[0x83]` and route to v3 command handlers (diagnostics `0x02`/`0x03`, predefined-pattern display `0x70`–`0x73`) alongside the v1/v2 handlers per the version-superset rule (a v3 panel MUST accept v1 + v2 commands).
- **EINT forwarding** — Triggered/Gated rely on EINT. For the production `arena_10-10`, the wiring runs through jumper J30 (default OPEN per [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md)), so the controller drives `TNY.EINT` (Teensy D33) based on whatever Triggered/Gated software policy is in force.

---

## Panel firmware update (ISP)

The controller reflashes panel firmware over SPI one panel at a time. Panel-side protocol surface is in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § In-System Programming (ISP).

**SD layout:** `/firmware/panel_<semver>.bin` — multiple versions coexist; the host names which `.bin` to flash via `g6-program-panel`. Each image ends with a 32-byte footer `{magic, version, image_crc32, image_size}`; the controller validates the footer before any SPI traffic.

**Per-panel workflow** (target panel selected by `panel_index`, which the controller resolves to a row in [`g6_arena_configs.h`](g6_arena_configs.h)):

1. Assert the targeted panel's CS only; all other CS lines inactive.
2. `ISP_ENTER` → record session nonce.
3. `ISP_ERASE_SECTOR` over the affected flash range.
4. Stream `ISP_WRITE_PAGE` page-by-page with per-page CRC.
5. `ISP_VERIFY_CRC` over the full programmed range, using the footer's `image_crc32`.
6. `ISP_EXIT_REBOOT` (mode `0x00`).
7. Wait for panel boot, then `COMM_CHECK` to confirm.

Sequential, one panel at a time — no parallel ISP across buses. On any failure the controller aborts, reports the failed `panel_index` and the last successful step; remaining panels are not auto-attempted.

ISP primitives may be reused for v3's deferred predefined-pattern programming mechanism (separate flash region).

---

## Timing measurements still needed (G6 bring-up)

The slim G4.1 controller's `timing.md` covers SD/init only; the following G6 numbers must be measured separately (likely on the prototype single-panel SPI test rig):

- SPI clock + framing latency
- End-of-message → display latency
- Panel BCM / bit-plane timing
- All-on/all-off transitions
- Panel-to-panel transmission gap
- Mode-switch latency
- Ethernet round-trip

Slim G4.1 baseline numbers (for reference, not G6 targets): SD reads ~2 µs cached / ~600 µs at FAT cluster boundaries; pattern-switch latency 1–19 ms; TCP streaming drop rate 0.27 % at 300 Hz / 0 % binary at ~3000 Hz.

---

## Open Questions / TBDs

1. **`all-on` semantics in v2 + Local Storage Mode.** Decision: build a one-shot all-on subframe controller-side (matches v1 behavior); no separate "all-on" PSRAM index opcode in v2. Status note for firmware bring-up.
2. **`SET_REFRESH_RATE_CMD` (0x16) upper bound** for G6 — accepts any `uint16_t` Hz today; G6 panel BCM may impose a hard ceiling the controller should enforce. Needs G6-side measurement.
3. **Per-version command-carry-over scope** — the v2/v3 superset rule (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md)) implies higher-version panels accept lower-version commands. Reviewing whether all carry-over candidates truly need to be supported in G6 v2/v3 panels (vs. left for the controller alone). Defer until v2 panel firmware exists.

---

## Cross-references

- [Source Google Doc, "Controller Teensy SW" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v1 controller requirements.
- [Source Google Doc, "Major updates for v2" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v2 controller updates.
- [Source Google Doc, "v3 and onwards…" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for v3+ stub.
- [`g6_00-architecture.md`](g6_00-architecture.md) — overall host/controller/panel responsibilities.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel Protocol v1 messaging (the wire format the controller emits).
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping (host-side concern; the controller treats the 20×20 grid as an opaque 51-byte/201-byte payload).
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — on-disk pattern file format (the controller's SD reader consumes these).
- [`g6_05-host-software.md`](g6_05-host-software.md) — host-side workflow (the producer of the commands listed in the Command Registry above).
- [floesche/LED-Display_G4.1_ArenaController_Slim](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim) — G4 baseline controller implementation; structural starting point for G6 controller work.
