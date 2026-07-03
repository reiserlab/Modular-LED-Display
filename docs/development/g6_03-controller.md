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
| `g6-panel-storage-mode` host command | Not in `ArenaCommands` enum | Opcode `0xC7` assigned (see Command Registry). |
| EINT trigger-line wiring (input GPIO) used by v1 Triggered/Gated | Slim has no input pins beyond CS lines | Single trigger input to be added. Wiring depends on arena hardware. |
| Magic / format-version field / CRC-8 header + per-frame CRC-16 | None in `PatternHeader.h:6-15` | Adopt v2 layout per `g6_04`: CRC-8/AUTOSAR over the 17-byte header (byte 17) + CRC-16/CCITT trailer per frame (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § CRC-8 algorithm and [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Frame Format). |
| Mode 1 (TSI Position Function) and Mode 5 (Streaming) top-level dispatch | Slim implements only Modes 2/3/4 (`modes.h:6-10`); Mode 5 streaming is partially built via `STREAMING_FRAME` state but no top-level mode dispatch | Add full mode dispatch for Modes 1–5. |

**Drop / not needed for G6:**

| Item | Slim source | Rationale |
|---|---|---|
| `DISPLAY_RESET_CMD` (0x01) "reset to FPGA" semantics | — | Repurposed as `SYSTEM_RESET_CMD`: triggers SCB_AIRCR SYSRESETREQ after acking. Original G4 "reset to FPGA" meaning has no G6 equivalent. |
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
- **`system-reset`** (`0x01`) — triggers a software system reset (SCB_AIRCR SYSRESETREQ). The controller acks the command, flushes its TX buffer, then resets. The USB CDC device or TCP connection will drop within ~10 ms; the host should treat a subsequent connection loss as expected.
- **`switch-grayscale`** (0x06) — **dropped for G6.** The canonical pattern-header `gs_val` byte (per [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)) replaces it. Hosts should not send this opcode for G6.

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
| `0x01` | system-reset | `0x01, 0x01` | v1 (G6-new) | Software system reset — acks then triggers SCB_AIRCR SYSRESETREQ. USB/TCP link drops immediately after the ack. |
| `0x03` | set-pattern-id | `0x03, 0x03, id_lo, id_hi` | v1 (G6-new) | Load a 1-based SD pattern into Mode 3 (Show Frame), parked at frame 0. No auto-advance. Use `set-frame-position (0x70)` to step frames. |
| `0x06` | switch-grayscale | `0x01, 0x06` | — | **Dropped for G6** — grayscale inferred from stream size / pattern-header `gs_val`. |
| `0x08` | trial-params | `0x0c, 0x08, …` | v1 | "Combined command": selects Mode 2/3/4 + pattern + timing (12 param bytes). |
| `0x16` | set-refresh-rate | `0x03, 0x16, lo, hi` | v1 | uint16 Hz. Default from `gs_val`: 300 Hz GS16 / 1000 Hz GS2; host may override. |
| `0x17` | get-refresh-rate | `0x01, 0x17` | v1 (G6-new) | Returns current refresh rate as uint16 LE Hz. Reflects the last `set-refresh-rate` value, or the mode-derived default if never overridden. |
| `0x1B` | set-panel-display-mode | `0x02, 0x1B, mode` | v1 (G6-new) | Set the panel display mode: `0` = oneshot (default), `1` = persist, `2` = triggered, `3` = gated. Sticky — applies to every panel-frame the controller transmits (SD frames, streamed frames, ALL_ON). Error-glyph frames are exempt. |
| `0x1C` | get-panel-display-mode | `0x01, 0x1C` | v1 (G6-new) | Returns the current panel display mode as a single byte (0–3). |
| `0x30` | stop-display | `0x01, 0x30` | v1 | Also doubles as all-off. |
| `0x32` | stream-frame | `0x32, len_lo, len_hi, …` | v1 | Mode 5; 3-byte stream header (see below). |
| `0x33` | get-frames-sent | `0x01, 0x33` | v1 (G6-new) | Returns frames pushed to panels since boot or last `reset-frames-sent` as uint32 LE. |
| `0x34` | reset-frames-sent | `0x01, 0x34` | v1 (G6-new) | Zeroes the frames-sent counter. |
| `0x3A` | display-psram-index | `0x03, 0x3A, idx_lo, idx_hi` | v2 (G6-new) | Show one panel-resident PSRAM frame at uint16 LE index (LAB-41/42; uses the V2 panel-protocol display path). |
| `0x3B` | psram-play | `0x07, 0x3B, start(2), count(2), fps(2)` | v2 (G6-new) | Auto-advance panel-resident PSRAM frames `[start, start+count)` at `fps` Hz (all uint16 LE). `count = 1` ⇒ static single index. |
| `0x70` | set-frame-position | `0x03, 0x70, lo, hi` | v1 | Mode 3: host-commanded frame index (uint16). G4-compatible (`setPositionX`). |
| `0x71` | set-position-y | — | reserved | **Reserved for a future G6 version** — second position axis (= G4 `setPositionY`). Not implemented; held to keep the G4-compatible X/Y position block intact. |
| `0x72` | get-frame-position | `0x01, 0x72` | v1 (G6-new) | Returns the live playback position (get-position-x): `cur_frame_index` (uint16 LE) + `frame_count` (uint16 LE). Reflects auto-advance in Modes 2/4 and host-set position in Mode 3; `0, 0` when no pattern is open. |
| `0x73` | get-position-y | — | reserved | **Reserved for a future G6 version** — read-back paired with `set-position-y` (`0x71`). Not implemented. |
| `0x80` | get-file-count | `0x01, 0x80` | v2 (G6-new) | Returns the number of pattern files on the SD card as uint16 LE. |
| `0x82` | get-pattern-filename | `0x03, 0x82, idx_lo, idx_hi` | v2 (G6-new) | Returns the filename for the pattern at 1-based uint16 `idx` (same convention as `patternId` in trial-params). Response payload: 1-byte length + ASCII filename chars. |
| `0x83` | set-pattern-filename | `0x83, idx_lo, idx_hi, len, char0…charN` | v2 (G6-new) | Renames the pattern file at 1-based uint16 `idx` to the name given by `len` (uint8) + ASCII chars. `idx = 0` is a special case: renames `/patterns/pattern.temp` to the given name. Returns an error if `idx > patternCount()` or if the target file does not exist. On success the Teensy re-scans and re-sorts `/patterns`; response payload: uint16 LE new 1-based index of the renamed file in the updated list. |
| `0x84` | get-pattern-file | `0x84, idx_lo, idx_hi` | v2 (G6-new) | Returns the full content of the pattern file at 1-based uint16 `idx`. Response payload: uint64 LE length prefix followed by file data. |
| `0x85` | set-pattern-file | `0x85, idx_lo, idx_hi, len_b0…len_b7, file_data…` | v2 (G6-new) | Overwrites the content of the pattern file at 1-based uint16 `idx`. Uses 8-byte (uint64 LE) length prefix after the index; `len` = file size in bytes. `idx = 0` is a special case: writes the file data to `/patterns/pattern.temp` (creating or overwriting it). Returns an error if `idx > patternCount()`. |
| `0x86` | delete-pattern-file | `0x03, 0x86, idx_lo, idx_hi` | v2 (G6-new) | Deletes the pattern file at 1-based uint16 `idx`. `idx = 0` deletes `/patterns/pattern.temp` if it exists. Returns an error if `idx > patternCount()` or the target file does not exist. Rescans after deletion. |
| `0x88` | get-pattern-info | `0x03, 0x88, idx_lo, idx_hi` | v2 (G6-new) | Cheap pattern-metadata preview for 1-based uint16 `idx` — no bulk download, no `ALL_OFF` requirement. Response payload: 12 bytes (`frame_count` u16 LE, `gs_val` u8, `rows` u8, `cols` u8, `arena_id` u8, `observer_id` u8, `file_size` u32 LE, `duty_cycle` u8). |
| `0x8A` | get-sd-archive | `0x01, 0x8A` | v2 (G6-new) | Streams the full SD card content (MANIFEST.bin, MANIFEST.txt, all `/patterns/*.pat`) as a ZIP archive (store mode, no compression). Response payload: uint64 LE total byte count followed by raw ZIP data. Only accepted in ALL_OFF state; returns `CE_DISPLAY_ACTIVE` (10) if the display is running. CRC-32 values are computed on-the-fly; data descriptors (PK\x07\x08) carry the final CRC and sizes after each file. |
| `0x8F` | delete-all-patterns | `0x01, 0x8F` | v2 (G6-new) | Deletes all files in `/patterns` (including `pattern.temp` if present). Rescans after deletion. |
| `0xA0` | set-ao-voltage | `0x03, 0xA0, mv_lo, mv_hi` | v1 (G6-new) | Set analog output (BNC J27, MCP4725 DAC) to 0–5000 mV. `mv = 0` drives DAC code 0 (0 V). Firmware converts: `dacCode = mv × 4095 / 5000`. Refused (error) while AO mode (`0xA3`) is `frame_number`. |
| `0xA1` | get-ao-voltage | `0x01, 0xA1` | v1 (G6-new) | Returns the hardware DAC readback as uint16 LE mV (I²C read of MCP4725 register). |
| `0xA2` | set-ao-lut | `[len, 0xA2, mode, step_hz_lo, step_hz_hi, count_lo, count_hi, mv...]` | v1 (G6-new) | Upload an AO lookup table and start playback. `mode` 0 = frame-locked (DAC tracks `LUT[cur_frame_index % count]`); `mode` 1 = time-based (DAC steps at `step_hz` Hz, independent of frames). Max 124 entries per standard 1-byte-length frame. End-of-table wraps (modulo). Stopped by `set-ao-voltage (0xA0)`. Refused (error) while AO mode (`0xA3`) is `frame_number`. |
| `0xA3` | set-ao-mode | `0x02, 0xA3, mode` | v1 (G6-new) | `mode` 0 = programmable (AO driven by `0xA0`/`0xA2`); `mode` 1 = frame_number (DAC tracks the open pattern's frame index, 0 V = frame 0 .. 5 V = last frame, normalized; updated on every frame load in Modes 2/3/4). Entering mode 1 stops any active LUT playback and immediately reflects the current frame. |
| `0xA4` | get-analog-in | `0x01, 0xA4` | v1 (G6-new) | Returns Analog In 1 (BNC J28/D14) and Analog In 2 (BNC J29/D15) as two int16 LE mV — same OPA2277 ±10 V front-end mapping Mode 4 uses. Bench diagnostic; front-end offset/scale calibration TBD. |
| `0xAA` | set-digital-out | `0x03, 0xAA, ch, state` | v1 (G6-new) | Drive DO1 (ch=1, BNC J3, Teensy D37, via U2) or DO2 (ch=2, BNC J4, Teensy D35, via U3) HIGH (state ≠ 0) or LOW (state = 0). Requires role (`0xAC`) `out_programmable`; an unconfigured (`off`) port auto-promotes, but `in_trigger`/`out_debug_framescan` refuse (error) to protect the trigger route / scan gate. |
| `0xAB` | get-digital-out | `0x01, 0xAB` | v1 (G6-new) | Returns the raw data-pin state of DO1 and DO2 as two bytes (0 = LOW, 1 = HIGH), regardless of role — meaning depends on the port's current role (`0xAC`/`0xAD`). |
| `0xAC` | set-dio-role | `0x03, 0xAC, port, role` | v1 (G6-new) | `port` 1\|2 ("Digital IO 1/2 (5V)" BNC); `role` 0=off, 1=in_trigger, 2=out_programmable, 3=out_debug_framescan (gates a pulse per SPI frame envelope). Explicit role changes are the only way into `in_trigger`/`out_debug_framescan`; `set-digital-out (0xAA)` auto-promotes `off` to `out_programmable`. |
| `0xAD` | get-dio-role | `0x01, 0xAD` | v1 (G6-new) | Returns `[role1, level1, role2, level2]` — `level` is a live pin read (driven latch in output roles, translated BNC level in input roles), a free trigger-line readback. |
| `0xC0` | set-ethernet-ip-address | — | v2 (G6-new) | Reserved — not yet implemented. Paired with `get-ethernet-ip-address`. |
| `0xC1` | get-ethernet-ip-address | `0x01, 0xC1` | v1 | Returns DHCP-resolved IP as ASCII. |
| `0xC2` | get-controller-info | `0x01, 0xC2` | v1 (G6-new) | Returns `{version, capability_bitmap, mac[6]}`, version-dispatched (G6-mode + v2 capability bits). Trailing 6 raw MAC bytes (tolerant, additive — see below) are the controller's physical-setup identity for run-provenance logging. |
| `0xC3` | set-diagnostic-output | `0x02, 0xC3, on` | v1 (G6-new) | Mute (`0`) / unmute (`1`) `DEBUG_SERIAL` diagnostics on USB-CDC. See § 7 Utility Commands. |
| `0xC4` | get-diagnostic-output | `0x01, 0xC4` | v1 (G6-new) | Returns current diagnostic-output state as a single byte (`0` = muted, `1` = active). |
| `0xC5` | set-spi-clock | `0x03, 0xC5, lo, hi` | v1 (G6-new) | uint16 LE MHz (1–30, clamped); response payload carries the applied clock as uint16 LE. |
| `0xC6` | get-spi-clock | `0x01, 0xC6` | v1 (G6-new) | Returns current SPI clock as uint16 LE MHz. |
| `0xC7` | g6-panel-storage-mode | `0x02, 0xC7, mode_byte` | v2 (G6-new) | `0` = SD Mode, `1` = Local Storage Mode; triggers the PSRAM load phase. Reserved — not yet in firmware. |
| `0xC8` | g6-program-panel | `0x02, 0xC8, panel_number` | v2 (G6-new) | Reflash a panel from the single firmware image on SD (`/firmware/panel.bin`). `panel_number` is **1-based** (matches the panel-map labels). See § Panel firmware update (ISP). Requires ALL_OFF. |
| `0xC9` | g6-verify-panel | `0x02, 0xC9, panel_number` | v2 (G6-new) | CRC the panel's **running** app flash (`ISP_ENTER` + `ISP_VERIFY_CRC`) against the `/firmware/panel.bin` footer; confirms an install. `panel_number` **1-based**. No reboot. Requires ALL_OFF. See § Panel firmware update (ISP). |
| `0xE0` | set-firmware-file | `0xE0, len_b0…len_b7, file_data…` | v2 (G6-new) | Uploads the firmware image to `/firmware/panel.bin`, overwriting the previous one (only one firmware is held at a time). Opcode-first framing; 8-byte (uint64 LE) length prefix. Companion to `g6-program-panel (0xC8)`. |
| `0xE3` | get-firmware-info | `0x01, 0xE3` | v2 (G6-new) | Returns the 32-byte footer of `/firmware/panel.bin` (`magic`, `version`, `image_crc32`, `image_size`) — firmware metadata without the image bytes. |
| `0xFF` | all-on | `0x01, 0xff` | v1 | Arena bring-up; canonical for diagnostics. |

**Stream-Frame for G6:** uses a **3-byte stream header** `[0x32, len_lo, len_hi, ...]`. The legacy `analog_x` / `analog_y` bytes are **not used in G6** — experimenters with motion-offset needs use Mode 4 closed-loop or a separate AI-driven workflow. Frame-data bytes follow `frame_size = 4 + (num_panels × block_size)` with `block_size = 53` (GS2) or `203` (GS16). For a 2×10 G6 arena: 1064 B (GS2) / 4064 B (GS16) of frame data plus the 3-byte stream header.

### G4 opcode compatibility & reservations

G6 collapses G4's two wires (host→Host.exe and Host.exe→controller) into one host→controller link, so G6 occupies the same opcode space a G4 client used. To keep maximum G4 compatibility, retained G4 commands stay on their G4 opcodes (e.g. `set-frame-position 0x70` = G4 `setPositionX`), and **new G6 commands must avoid opcodes G4 already used**.

**Reserved — do not assign to new G6 commands (G4 meaning in parentheses):**
`0x05` (setPatternAndPositionIDs), `0x07` (combinedCommand), `0x10` (setControlMode), `0x11` (setActiveAOChannels), `0x12` (setFrameRate), `0x13` (setActiveAIChannels), `0x15` (setPatternFunctionID), `0x21` (startDisplay), `0x31` (setAOFunctionID), `0x40` (stopLog), `0x41` (startLog), `0x42` (resetCounter), `0x43` (setRootDirectory), `0x45` (getTreadmillData), `0x46` (getVersion), `0x47` (sendSyncLog), `0x50` (setSPIDebug), `0x66` (get-ethernet-ip — G6 moved this to `0xC1`). `0x71`/`0x73` are reserved for a future G4-compatible position-Y pair (see `0x70`–`0x73`).

> The reserved-future commands `g6-panel-storage-mode` and `g6-program-panel` were moved off `0x40`/`0x41` to `0xC7`/`0xC8` precisely to avoid the G4 `stopLog`/`startLog` collision — the `0x41`→panel-reflash overlap being the dangerous one.

**Known, intentional divergences** (same opcode, different behavior — accepted, not fixed):

| Opcode | G4 | G6 | Note |
|---|---|---|---|
| `0x01` | DISPLAY_RESET (reset FPGA display) | SYSTEM_RESET (reboot MCU) | Deliberate repurpose; a G4 client's display-reset triggers a full reboot + link drop. |
| `0x08` | trial-params: `gain` int16 + trailing `runtime` | trial-params: `gain` int8, no runtime, `rate` int16 | Same intent, different payload layout; G4 12-byte frame misparses. Reconciliation open. |
| `0x32` | stream-frame with `aox/aoy` header bytes (also dual-used as setAO) | stream-frame, 3-byte header, no `aox/aoy` | Different header; G4 `setAO`-via-`0x32` overload absent (G6 uses `0xA0`). |

### Per-command wire formats

Each command is listed in ascending opcode order. Framing conventions:

- **Standard framing** (all commands except `stream-frame`, `set-pattern-filename`, `set-pattern-file`, `set-firmware-file`): command is `[length, cmd, params…]` where `length` counts the bytes after the length prefix. Response is `[length, status, echo_cmd, payload…]` where `status = 0` is success and `status ≠ 0` is an error.
- **Opcode-first framing** (`0x32 stream-frame`, `0x83 set-pattern-filename`, `0x85 set-pattern-file`, `0xE0 set-firmware-file`): command starts with the opcode byte directly, no length prefix; see each entry.
- **Bulk response** (`0x84 get-pattern-file`, `0x8A get-sd-archive`): a standard framed header carries the total byte count; raw bytes follow the header with no additional framing.
- All multi-byte integers are little-endian unless stated otherwise.
- Success responses with no data payload: `[0x02, 0x00, cmd]` (length = 2, status = 0, echo = cmd, empty payload).
- Error responses: `[len, err_code, cmd, ASCII_error_message]`.

#### 0x00 all-off

Enters `ALL_OFF` state; stops all SPI output.

**Command:** `[0x01, 0x00]`

**Response:** `[len, 0x00, 0x00, ASCII_msg]` — status = 0, ASCII diagnostic text in payload (not a protocol contract).

---

#### 0x01 system-reset

Triggers a software system reset. The controller sends the ack, flushes its TX buffer, waits ~10 ms for the frame to be transmitted, then writes `SCB_AIRCR = 0x05FA0004` (ARM Cortex-M SYSRESETREQ). The USB CDC device or TCP connection drops immediately after the ack arrives at the host; this is expected behaviour, not an error.

**Command:** `[0x01, 0x01]`

**Response (before reset):** `[len, 0x00, 0x01, "rebooting"]` — status = 0. The connection drops within ~10 ms of receipt.

**Error cases:** none; always succeeds.

---

#### 0x03 set-pattern-id

Load a 1-based SD pattern into **Mode 3 (Show Frame)**, parked at frame 0, with no auto-advance. Intended as the G4-style "load first, then address frames" entry point: call `set-pattern-id`, then use `set-frame-position (0x70)` to display individual frames.

**Command:** `[0x03, 0x03, id_lo, id_hi]` — `id` uint16 LE, 1-based.

**Response (success):** `[0x04, 0x00, 0x03, id_lo, id_hi]` — echoes the 1-based pattern id.

**Response (error):** `[len, 0x01, 0x03, ASCII_msg]` — wrong frame length, or pattern not found / SD read failure.

**Notes:**
- Equivalent to sending `trial-params (0x08)` with mode=3, `frame_rate=0`, `init_pos=0`, but without the 12-parameter overhead.
- Pattern files are alphabetically sorted and 1-indexed; ID 0 is invalid and returns an error.

---

#### 0x06 switch-grayscale (dropped)

Recognized only to produce an explicit rejection. Grayscale mode is inferred from frame size or the pattern-header `gs_val` byte.

**Command:** `[0x01, 0x06]`

**Response:** `[len, 0x01, 0x06, ASCII_error]`

---

#### 0x08 trial-params

Selects the display mode (2/3/4), opens the named SD pattern, and arms the refresh timer.

**Command:** `[len, 0x08, mode, pat_id_lo, pat_id_hi, rate_lo, rate_hi, gain, init_lo, init_hi, …]`

Payload bytes after the command byte:

| Offset | Field | Type | Description |
|---|---|---|---|
| 0 | `mode` | uint8 | 2 = Open Loop, 3 = Show Frame, 4 = Closed Loop |
| 1–2 | `pattern_id` | uint16 LE | 1-based SD pattern index |
| 3–4 | `frame_rate` | int16 LE | Hz — frame-advance rate for Mode 2. Negative values play in reverse. Sign is ignored in Modes 3 and 4. |
| 5 | `gain` | int8 | Mode 4 velocity scale: actual gain = `gain / 10` fps/V (e.g. `−20` → −2.0 fps/V) |
| 6–7 | `init_pos` | uint16 LE | Initial frame index (0-based) |
| 8+ | reserved | — | Legacy G4 fields; accepted and ignored |

Minimum payload: 8 bytes (offsets 0–7). Full G4-legacy form sends 12 param bytes (`length = 0x0D`).

**Response (success):** `[0x02, 0x00, 0x08]`

**Response (error):** `[len, 0x01, 0x08, ASCII_msg]` — invalid mode, pattern not found, or SD read failure.

---

#### 0x16 set-refresh-rate

Sets the SPI refresh rate. A value of 0 is ignored and the current rate is retained.

**Command:** `[0x03, 0x16, rate_lo, rate_hi]` — `rate` uint16 LE Hz.

**Response:** `[0x02, 0x00, 0x16]`

---

#### 0x17 get-refresh-rate

Returns the currently active refresh rate.

**Command:** `[0x01, 0x17]`

**Response:** `[0x04, 0x00, 0x17, hz_lo, hz_hi]` — uint16 LE Hz.

---

#### 0x1B set-panel-display-mode

Sets the panel display mode — the `DISP_*` opcode the controller stamps into every panel block it synthesises or patches. The setting is **sticky** (survives mode changes and pattern loads) and takes effect immediately on the currently-buffered frame.

| `mode` | Name | Panel behaviour |
|---|---|---|
| `0` | oneshot | Panel runs a single scan, then idles dark until the next frame is clocked in (default) — the controller re-clocks at `set-refresh-rate` to sustain a static image |
| `1` | persist | Panel holds the frame continuously until a new frame is clocked in |
| `2` | triggered | Panel renders on the rising edge of the external trigger line |
| `3` | gated | Panel renders while the gate line is asserted |

**Why oneshot is the default:** v1 pattern files carry the oneshot opcode (`0x10`/`0x30`) in every panel block ([g6_04](g6_04-pattern-file-format.md)), and the controller forwards SD and streamed blocks verbatim — so with no `set-panel-display-mode` command sent, the whole path runs oneshot. It matches the canonical model where the controller drives each displayed frame explicitly (Mode 2 auto-advance / Mode 3 host-commanded, re-clocked at `set-refresh-rate` `0x16`), one command per intended stimulus event. `persist` is opt-in: the panel self-refreshes a single loaded frame without the controller re-streaming it.

The error glyph (`showError`) is exempt — it always uses the opcode set by `G6Error::buildErrorFrame`.

**Command:** `[0x02, 0x1B, mode]`

**Response (success):** `[0x03, 0x00, 0x1B, mode]` — echoes the applied mode.

**Response (error):** `[len, 0x01, 0x1B, ASCII_msg]` — `mode > 3` or wrong frame length.

---

#### 0x1C get-panel-display-mode

Returns the current panel display mode (see `set-panel-display-mode`).

**Command:** `[0x01, 0x1C]`

**Response:** `[0x03, 0x00, 0x1C, mode]` — single byte, 0–3.

---

#### 0x30 stop-display

Stops SPI output and enters `ALL_OFF` state. Same internal effect as `all-off`.

**Command:** `[0x01, 0x30]`

**Response:** `[len, 0x00, 0x30, ASCII_msg]`

---

#### 0x32 stream-frame

Mode 5 (Streaming). Uses opcode-first framing: the first byte is `0x32` directly (no length prefix); a 2-byte payload-length field follows.

**Command:**

```
[0x32, frame_len_lo, frame_len_hi, frame_prefix[4], block_0[block_size], … block_N[block_size]]
```

| Field | Size | Description |
|---|---|---|
| opcode | 1 | `0x32` |
| `frame_len` | 2 | uint16 LE, byte count of everything that follows |
| frame prefix | 4 | `0x46, 0x52, frame_idx_lo, frame_idx_hi` — ASCII `"FR"` + uint16 LE frame index (informational; not used for panel routing) |
| panel blocks | `num_panels × block_size` | Panel blocks in panel-set order; `block_size` = 53 (GS2) or 203 (GS16) |

`frame_len = 4 + num_panels × block_size`. For a 2×10 G6 arena: 1064 B (GS2) or 4064 B (GS16).

**Response (success):** `[0x02, 0x00, 0x32]`

**Response (error):** `[len, 0x01, 0x32, "Bad stream-frame size"]` — payload size does not match any supported arena geometry.

---

#### 0x33 get-frames-sent

Returns the number of frame-transfers pushed to panels since boot or the last `reset-frames-sent`.

**Command:** `[0x01, 0x33]`

**Response:** `[0x06, 0x00, 0x33, n_b0, n_b1, n_b2, n_b3]` — uint32 LE count.

---

#### 0x34 reset-frames-sent

Zeroes the frames-sent counter.

**Command:** `[0x01, 0x34]`

**Response:** `[0x02, 0x00, 0x34]`

---

#### 0x3A display-psram-index

Shows a single panel-resident PSRAM frame: the controller synthesises one V2 "display PSRAM index" block per panel (all the same index → whole arena shows frame `idx`) and the refresh timer retransmits it. Drives the V2 panel-protocol display path (LAB-41/42); requires the panels to hold their frames locally.

**Command:** `[0x03, 0x3A, idx_lo, idx_hi]` — `idx` uint16 LE.

**Response (success):** `[0x02, 0x00, 0x3A]`

**Response (error):** `[len, 0x01, 0x3A, ASCII_msg]` — payload too short.

---

#### 0x3B psram-play

Auto-advances panel-resident PSRAM frames over the range `[start, start+count)` at `fps` Hz, reusing the open-loop frame clock. `count = 1` shows a single static index (equivalent to `display-psram-index`). End of range wraps back to `start`.

**Command:** `[0x07, 0x3B, start_lo, start_hi, count_lo, count_hi, fps_lo, fps_hi]` — all uint16 LE.

**Response (success):** `[0x02, 0x00, 0x3B]`

**Response (error):** `[len, 0x01, 0x3B, ASCII_msg]` — payload too short.

---

#### 0x70 set-frame-position

Mode 3 (Show Frame): commands the controller to display a specific frame of the currently-open pattern. Requires a prior `trial-params` with `mode = 3`. G4-compatible (`setPositionX`).

**Command:** `[0x03, 0x70, idx_lo, idx_hi]` — `idx` uint16 LE, 0-based frame index.

**Response (success):** `[0x02, 0x00, 0x70]`

**Response (error):** `[len, 0x01, 0x70, ASCII_msg]` — no pattern open, or index ≥ frame count.

---

#### 0x71 set-position-y (reserved)

**Reserved for a future G6 version** — the second position axis, mirroring G4 `setPositionY` (G4 used `0x70`/`0x71` for position X/Y). G6 currently exposes a single frame axis, so this opcode is not implemented and the controller does not handle it today. Held so the X/Y position block (`0x70`–`0x73`) stays G4-aligned.

---

#### 0x72 get-frame-position

Returns the controller's live playback position (get-position-x). Pairs with `set-frame-position (0x70)` and lets a host poll auto-advancing playback (Modes 2/4) to read the current index and detect direction/wrap.

**Command:** `[0x01, 0x72]`

**Response:** `[0x06, 0x00, 0x72, idx_lo, idx_hi, count_lo, count_hi]` — `cur_frame_index` (uint16 LE, 0-based) followed by `frame_count` (uint16 LE). Both are `0` when no pattern is open.

**Error cases:** none; always succeeds.

---

#### 0x73 get-position-y (reserved)

**Reserved for a future G6 version** — read-back paired with `set-position-y` (`0x71`). Not implemented.

---

#### 0x80 get-file-count

Returns the number of permanent pattern files on the SD card. `pattern.temp` is not counted.

**Command:** `[0x01, 0x80]`

**Response:** `[0x04, 0x00, 0x80, n_lo, n_hi]` — uint16 LE count.

---

#### 0x82 get-pattern-filename

Returns the filename of the pattern at the given 1-based index.

**Command:** `[0x03, 0x82, idx_lo, idx_hi]` — `idx` uint16 LE, 1-based.

**Response (success):** `[len, 0x00, 0x82, name_len, char0…charN]`

| Payload field | Size | Description |
|---|---|---|
| `name_len` | 1 byte | uint8 byte count of the filename |
| filename | `name_len` bytes | ASCII, no null terminator |

**Response (error):** `[len, 0x01, 0x82, ASCII_msg]` — `idx = 0` or `idx > pattern_count`.

---

#### 0x83 set-pattern-filename

Renames an existing pattern file. Uses opcode-first framing (no length prefix).

**Command:** `[0x83, idx_lo, idx_hi, name_len, char0…charN]`

| Field | Size | Description |
|---|---|---|
| opcode | 1 | `0x83` |
| `idx` | 2 | uint16 LE; 1-based pattern index — **`idx = 0` renames `pattern.temp`** and inserts it into the sorted permanent list |
| `name_len` | 1 | uint8 byte count of the new name |
| name | `name_len` bytes | ASCII |

**Response (success):** `[0x04, 0x00, 0x83, new_idx_lo, new_idx_hi]` — uint16 LE 1-based position of the renamed file in the updated sorted list.

**Response (error):** `[len, err, 0x83, ASCII_msg]` — index out of range, name length zero or exceeds the limit, or SD rename failed.

---

#### 0x84 get-pattern-file

Downloads the full content of the pattern file at a 1-based index. The response uses a two-part layout: a standard framed header carrying the file size, followed immediately by the raw file bytes without any additional framing.

**Command:** `[0x03, 0x84, idx_lo, idx_hi]` — `idx` uint16 LE, 1-based; **`idx = 0` is rejected**.

**Response (success):**

```
[0x0A, 0x00, 0x84, size_b0, size_b1, size_b2, size_b3, 0x00, 0x00, 0x00, 0x00]
<file_size raw bytes — no additional framing>
```

The framed header has `length = 0x0A` (1 status + 1 echo + 8 size bytes). `size` is uint64 LE; the upper 4 bytes are always zero (SD files are limited to 32-bit sizes). The `file_size` raw bytes follow the header frame with no length prefix or framing byte.

**Response (error):** `[len, 0x01, 0x84, ASCII_msg]` — `idx = 0`, `idx > pattern_count`, or SD open failed.

---

#### 0x85 set-pattern-file

Uploads file data to the SD card. Uses opcode-first framing with an 8-byte (uint64 LE) payload-length field; no length prefix.

**Command:**

```
[0x85, idx_lo, idx_hi, len_b0, len_b1, len_b2, len_b3, len_b4, len_b5, len_b6, len_b7, file_data…]
```

| Field | Size | Description |
|---|---|---|
| opcode | 1 | `0x85` |
| `idx` | 2 | uint16 LE; **`idx = 0` writes to `/patterns/pattern.temp`**; `idx > 0` overwrites the existing 1-based pattern in place |
| `file_size` | 8 | uint64 LE byte count of `file_data` |
| `file_data` | `file_size` bytes | Raw pattern file content |

Upload timeout: 30 seconds of inactivity aborts the transfer and removes the partial file.

**Response (success):** `[0x02, 0x00, 0x85]`

**Response (error):** `[len, err, 0x85, ASCII_msg]` — index out of range, SD open failed, or timeout.

---

#### 0x86 delete-pattern-file

Deletes the pattern file at the given index. Rescans and re-sorts `/patterns/` after deletion.

**Command:** `[0x03, 0x86, idx_lo, idx_hi]` — `idx` uint16 LE; **`idx = 0` deletes `pattern.temp`**; `idx > 0` deletes the 1-based permanent pattern.

**Response (success):** `[0x02, 0x00, 0x86]`

**Response (error):** `[len, err, 0x86, "Delete failed"]` — `idx > pattern_count`, or target file does not exist (including `idx = 0` when `pattern.temp` is absent).

---

#### 0x88 get-pattern-info

Cheap per-pattern metadata preview — header fields plus the first frame's duty cycle — without downloading the file (`get-pattern-file (0x84)`) or requiring `ALL_OFF`.

**Command:** `[0x03, 0x88, idx_lo, idx_hi]` — `idx` uint16 LE, 1-based (same convention as `get-pattern-filename`).

**Response (success):** `[0x0D, 0x00, 0x88, frame_count_lo, frame_count_hi, gs_val, rows, cols, arena_id, observer_id, file_size_b0..b3, duty_cycle]` — 12-byte payload:

| Payload byte(s) | Field | Description |
|---|---|---|
| 0–1 | `frame_count` | uint16 LE, frames in the pattern |
| 2 | `gs_val` | Grayscale mode (GS2/GS16) |
| 3 | `rows` | Pattern geometry (rows) |
| 4 | `cols` | Pattern geometry (cols) |
| 5 | `arena_id` | Header Arena ID |
| 6 | `observer_id` | Header Observer ID |
| 7–10 | `file_size` | uint32 LE, file size in bytes |
| 11 | `duty_cycle` | Frame-0 duty cycle (cheap preview value) |

**Response (error):** `[len, err, 0x88, "pattern info read failed"]` — `idx = 0`/`idx > pattern_count`, or a header/CRC read failure (`err` = the same `ControllerError` code `get-pattern-file`/SD playback would raise).

---

#### 0x8A get-sd-archive

Streams the full SD card content as a ZIP archive (store mode, no compression). Only accepted in `ALL_OFF` state. Like `get-pattern-file`, the response is a framed header followed by bulk raw bytes.

**Command:** `[0x01, 0x8A]`

**Response (success):**

```
[0x0A, 0x00, 0x8A, size_b0, size_b1, size_b2, size_b3, size_b4, size_b5, size_b6, size_b7]
<total_size raw ZIP bytes — no additional framing>
```

`total_size` (uint64 LE) is the complete ZIP byte count, pre-computed before streaming begins. Contents: `MANIFEST.bin`, `MANIFEST.txt`, then all `/patterns/*.pat` files in index order. Each ZIP entry uses a data descriptor (`PK\x07\x08`) so CRC-32 values are finalized after each file is streamed.

**Response (error):** `[len, 10, 0x8A, "Stop display first"]` — controller is not in `ALL_OFF` state (error code 10 = `CE_DISPLAY_ACTIVE`).

---

#### 0x8F delete-all-patterns

Deletes every file in `/patterns/`, including `pattern.temp` if present, then rewrites the manifest. Can take several seconds on a populated SD card — use a host-side timeout of at least 10 s.

**Command:** `[0x01, 0x8F]`

**Response (success):** `[0x02, 0x00, 0x8F]`

**Response (error):** `[len, err, 0x8F, "Delete-all failed"]`

---

#### 0xA0 set-ao-voltage

Sets the analog output (BNC J27) to a DC level specified in millivolts. The hardware is a MCP4725 12-bit I²C DAC (U85, addr `0x60`) on the controller board. The DAC has no true output-disable, so `mv = 0` is the off state (drives DAC code 0 = 0 V). The commanded level is independent of the display/SPI path and persists while patterns are streaming.

Firmware conversion: `dacCode = mv × 4095 / 5000` (integer arithmetic).

**Command:** `[0x03, 0xA0, mv_lo, mv_hi]` — `mv` uint16 LE, 0–5000 mV.

**Response (success):** `[0x04, 0x00, 0xA0, mv_lo, mv_hi]` — echoes the applied mV as uint16 LE. Also stops any active LUT playback (`0xA2`).

**Response (error):** `[len, 0x01, 0xA0, ASCII_msg]` — `mv > 5000`, I²C write failure, or AO mode (`0xA3`) is `frame_number` (`"AO is in frame_number mode - SET_AO_MODE (0xA3) 0 first"`).

---

#### 0xA1 get-ao-voltage

Reads the MCP4725 DAC register directly over I²C and returns the current output level in millivolts. The 3-byte DAC read response is: byte 0 = status (`[RDY, POR, -, -, PD1, PD0, -, -]`), byte 1 = `D11..D4`, byte 2 = `D3..D0` in the upper nibble. Firmware reconstructs: `dacCode = (byte1 << 4) | (byte2 >> 4)`, then `mv = dacCode × 5000 / 4095`.

**Command:** `[0x01, 0xA1]`

**Response (success):** `[0x04, 0x00, 0xA1, mv_lo, mv_hi]` — uint16 LE mV from hardware DAC register.

**Response (error):** `[len, 0x01, 0xA1, ASCII_msg]` — I²C read returned fewer than 3 bytes.

---

#### 0xA2 set-ao-lut

Uploads a lookup table (LUT) of AO mV values and starts playback immediately. The DAC is written to `LUT[0]` on receipt; subsequent updates happen either on every frame load (mode 0) or on a timer (mode 1).

**Command:** `[len, 0xA2, mode, step_hz_lo, step_hz_hi, count_lo, count_hi, mv[0]_lo, mv[0]_hi, ...]`

- `mode` (uint8): `0` = frame-locked (`AO = LUT[cur_frame_index % count]`, updated by `loadFrame()`); `1` = time-based (`AO = LUT[k]` stepped at `step_hz` Hz, free-running, independent of frames).
- `step_hz` (uint16 LE): step rate for mode 1. Ignored for mode 0. Maximum documented rate: **1000 Hz** (MCP4725 I²C ceiling is ~13 kHz at 400 kHz; 1000 Hz is the safe operating limit).
- `count` (uint16 LE): number of LUT entries, 1–4096. Practical maximum with standard 1-byte-length framing: **124 entries** (254 − 5 header bytes ÷ 2).
- `mv[i]` (uint16 LE each): 0–5000 mV per entry.

**End-of-table:** wraps (modulo indexing for both modes).

**Stopping LUT playback:** send `set-ao-voltage (0xA0)` — this drives the DAC to a static level and clears the LUT.

**Response (success):** `[0x04, 0x00, 0xA2, count_lo, count_hi]` — echoes the accepted entry count as uint16 LE.

**Response (error):** `[len, 0x01, 0xA2, ASCII_msg]` — `count = 0`, `count > 4096`, any `mv > 5000`, `mode > 1`, count/length mismatch, or AO mode (`0xA3`) is `frame_number` (`"AO is in frame_number mode - SET_AO_MODE (0xA3) 0 first"`).

---

#### 0xA3 set-ao-mode

Selects what drives the analog output: direct host control, or the currently-playing pattern's frame index.

**Command:** `[0x02, 0xA3, mode]`

- `mode` (uint8): `0` = programmable — AO driven by `set-ao-voltage (0xA0)` / `set-ao-lut (0xA2)`. `1` = frame_number — the DAC tracks the open pattern's live frame index, normalized `0 V` (frame 0) .. `5 V` (last frame); updated on every frame load in Modes 2/3/4.

Entering mode 1 stops any active LUT playback and immediately writes the DAC to reflect the current frame (or `0 V` if no pattern is open).

**Response (success):** `[0x02, 0x00, 0xA3]`

**Response (error):** `[len, 0x01, 0xA3, ASCII_msg]` — `mode > 1`.

---

#### 0xA4 get-analog-in

Reads both analog input BNCs. Bench diagnostic — front-end offset/scale calibration is TBD (§ Mode 4).

**Command:** `[0x01, 0xA4]`

**Response:** `[0x06, 0x00, 0xA4, ain1_lo, ain1_hi, ain2_lo, ain2_hi]`

- `ain1`, `ain2` (int16 LE mV each): Analog In 1 (BNC J28, Teensy D14) and Analog In 2 (BNC J29, Teensy D15). Both share the OPA2277 front-end mapping ±10 V → 0..3.3 V at the ADC, midscale = 0 V — the same math Mode 4 uses.

---

#### 0xAA set-digital-out

Drives one digital IO port HIGH or LOW. The two ports use SN74LVC1T45 bidirectional level translators; the BNC side is 5 V, the Teensy I/O side is 3.3 V. Gated by the port's role (`0xAC`/`0xAD`): only meaningful — and only accepted — when the translator is in the Teensy→BNC direction.

**Command:** `[0x03, 0xAA, ch, state]`

- `ch`: 1 = Digital IO 1 (BNC J3, Teensy D37, via U2); 2 = Digital IO 2 (BNC J4, Teensy D35, via U3)
- `state`: 0 = LOW; any non-zero value = HIGH

**Response (success):** `[0x02, 0x00, 0xAA]`. An `off` (unconfigured) port auto-promotes to `out_programmable` on first use.

**Response (error):** `[len, 0x01, 0xAA, ASCII_msg]` — `ch` not 1 or 2, fewer than 2 payload bytes, or the port's role is `in_trigger`/`out_debug_framescan` (`"Digital IO <ch> role is <role> - SET_DIO_ROLE (0xAC) it to out_programmable first"` — refused rather than silently reconfigured, since flipping the translator direction here would destroy the trigger route / scan gate).

---

#### 0xAB get-digital-out

Returns the raw Teensy data-pin state for both digital IO ports, independent of role.

**Command:** `[0x01, 0xAB]`

**Response:** `[0x04, 0x00, 0xAB, do1_state, do2_state]`

- `do1_state`: 0 = LOW, 1 = HIGH (Digital IO 1, BNC J3, Teensy D37, via U2)
- `do2_state`: 0 = LOW, 1 = HIGH (Digital IO 2, BNC J4, Teensy D35, via U3)

The value's meaning depends on the port's current role: in an output role (`out_programmable`/`out_debug_framescan`) it's the driven level (host-set via `0xAA`, or SPI-frame-gated); in `off`/`in_trigger` it's a pass-through read of whatever the BNC/EINT side is presenting. Use `get-dio-role (0xAD)` to also learn the role each state applies to.

---

#### 0xAC set-dio-role

Configures what a digital IO port does: pass-through disabled, external trigger input, host-programmable output, or an SPI-frame-gated debug output. Ports are 1-based on the wire (matching the board's "Digital IO 1/2 (5V)" BNC silkscreen and the `0xAA`/`0xAB` channel numbering).

**Command:** `[0x03, 0xAC, port, role]`

- `port`: 1 or 2
- `role`: `0` = off (translator B→A, data pin hi-Z, BNC ignored); `1` = in_trigger (pin configured as `off`; on port 2 the BNC additionally feeds the panels' EINT net via U3 B→A + J30 shunt — the external trigger route); `2` = out_programmable (translator A→B, host drives the BNC via `0xAA`); `3` = out_debug_framescan (output, gated by `SpiManager` per SPI frame transfer — a per-frame scan-timing pulse)

Boot defaults (before any `0xAC` call): port 1 = `out_programmable` driving LOW (historic bench behavior); port 2 = `in_trigger` (the external trigger route to the panels' EINT net).

**Response (success):** `[0x02, 0x00, 0xAC]`

**Response (error):** `[len, 0x01, 0xAC, ASCII_msg]` — `port` not 1 or 2, or `role > 3`.

---

#### 0xAD get-dio-role

Returns each port's configured role plus a live pin read, in one call.

**Command:** `[0x01, 0xAD]`

**Response:** `[0x06, 0x00, 0xAD, role1, level1, role2, level2]`

- `role1`, `role2` (uint8, `0`–`3`): current role of port 1 / port 2, per `set-dio-role (0xAC)`.
- `level1`, `level2` (uint8, `0`/`1`): live read of the port's data pin — the driven latch in an output role, the translated BNC level in an input role. A free trigger-line readback that doesn't require switching the port to an output role first.

---

#### 0xC0 set-ethernet-ip-address

Reserved — not yet implemented. No wire form defined.

---

#### 0xC1 get-ethernet-ip-address

Returns the DHCP-resolved IP address as an ASCII string.

**Command:** `[0x01, 0xC1]`

**Response:** `[len, 0x00, 0xC1, char0…charN]` — ASCII dotted-quad (e.g. `"10.0.0.5"`), no null terminator.

---

#### 0xC2 get-controller-info

Returns the controller version byte, capability bitmap, and physical-setup identity (Ethernet MAC). Use this to detect G6 mode and v2/v3 feature availability before issuing feature-gated commands, and to tag run logs with which physical controller ran them.

**Command:** `[0x01, 0xC2]`

**Response:** `[0x0A, 0x00, 0xC2, version, capability, mac0, mac1, mac2, mac3, mac4, mac5]`

| Payload byte | Field | Description |
|---|---|---|
| 0 | `version` | Controller capability generation |
| 1 | `capability` | Bitmap — see below |
| 2–7 | `mac[6]` | Ethernet MAC, raw bytes (Teensy 4.1 burned-in unique ID via QNEthernet — sourced fresh on every call, valid even when the Ethernet link is down) |

`mac[6]` is a tolerant, additive extension: a host that predates it reads only bytes 0–1 and is unaffected by the longer payload.

**Capability bitmap (bit 0 = LSB):**

| Bit | Name | Meaning |
|---|---|---|
| 0 | `g6_mode` | Always 1 for any G6 controller |
| 1 | `v2_local_storage` | Local Storage Mode (PSRAM) supported |
| 2 | `mode_1_tsi` | Mode 1 / TSI file playback supported |
| 3 | `v3_triggered` | v3 Triggered mode supported |
| 4 | `v3_gated` | v3 Gated mode supported |
| 5–7 | reserved | Transmit as 0 |

---

#### 0xC3 set-diagnostic-output

Mutes or unmutes the `DEBUG_SERIAL` diagnostic text stream on the USB-CDC pipe. Has no effect in non-debug firmware builds but is still acknowledged. The flag persists across reconnects. Interactive clients mute on connect; CIPO capture scripts re-enable.

**Command:** `[0x02, 0xC3, on]` — `on = 0` mutes; `on ≠ 0` enables.

**Response:** `[len, 0x00, 0xC3, ASCII_msg]` — payload is `"diag on"` or `"diag off"`.

---

#### 0xC4 get-diagnostic-output

Returns the current diagnostic-output state.

**Command:** `[0x01, 0xC4]`

**Response:** `[0x03, 0x00, 0xC4, state]` — `state = 0` muted, `state = 1` active.

---

#### 0xC5 set-spi-clock

Sets the SPI clock rate. Values outside 1–30 MHz are clamped internally. The response echoes the applied (clamped) value.

**Command:** `[0x03, 0xC5, mhz_lo, mhz_hi]` — `mhz` uint16 LE.

**Response:** `[0x04, 0x00, 0xC5, applied_lo, applied_hi]` — uint16 LE applied MHz.

---

#### 0xC6 get-spi-clock

Returns the current SPI clock rate.

**Command:** `[0x01, 0xC6]`

**Response:** `[0x04, 0x00, 0xC6, mhz_lo, mhz_hi]` — uint16 LE MHz.

---

#### 0xC7 g6-panel-storage-mode

Switches the controller between SD Mode and Local Storage Mode. Transitioning to Local Storage Mode (`mode_byte = 1`) triggers the PSRAM load phase. v2 feature — not yet in firmware. (Relocated from `0x40`, which collided with the G4 `stopLog` opcode.)

**Command:** `[0x02, 0xC7, mode_byte]` — `mode_byte = 0` = SD Mode, `mode_byte = 1` = Local Storage Mode.

**Response (success):** `[0x02, 0x00, 0xC7]`

---

#### 0xC8 g6-program-panel

Reflashes a single panel from the firmware image on SD; see § Panel firmware update (ISP) for the full per-panel workflow. The image must already exist at `/firmware/panel.bin` (upload via `set-firmware-file (0xE0)`). Requires ALL_OFF. Blocks for ~20 s (the panel writes to LittleFS, reboots, and the OTA stub installs the image). (Relocated from `0x41`, which collided with the G4 `startLog` opcode.)

**Command:** `[0x02, 0xC8, panel_number]` — `panel_number` uint8, **1-based** (matches the panel-map labels); the controller converts to the 0-based row in `g6_arena_configs.h` (`row*10 + col`). `panel_number = 0` is rejected.

**Response (success):** `[len, 0x00, 0xC8, ASCII_msg]` — e.g. `panel N flashed via OTA (<bytes> bytes); rebooting + applying update` (N is the 1-based number).

**Response (error):** `[len, err, 0xC8, ASCII_msg]` — panel number 0 / out of range, firmware image not found, footer validation failed, or an ISP step failed (the message names the step reached). Confirm the install with `g6-verify-panel (0xC9)`.

---

#### 0xC9 g6-verify-panel

Reads the panel's **running** application flash CRC and compares it to the `/firmware/panel.bin` footer — the way to confirm a `g6-program-panel` install actually took (the boot banner is unreliable to capture). Runs `ISP_ENTER` + `ISP_VERIFY_CRC` over `[0, image_size)`; no reboot, no flash write. Requires ALL_OFF.

**Command:** `[0x02, 0xC9, panel_number]` — **1-based** (same convention as `0xC8`).

**Response (success / MATCH):** `[len, 0x00, 0xC9, ASCII_msg]` — `panel N running-app CRC=0x… expected=0x… -> MATCH (this firmware is installed)`.

**Response (mismatch / error):** `[len, err, 0xC9, ASCII_msg]` — CRC mismatch (a different image is running), or `ISP_ENTER: no valid reply` (panel not running ISP firmware / wiring).

---

#### 0xE0 set-firmware-file

Uploads the firmware image to `/firmware/panel.bin` on the controller's SD, overwriting any previous one — only a single firmware is held at a time, so no filename is needed. Opcode-first framing (no length prefix), with an 8-byte length, mirroring `set-pattern-file (0x85)`.

**Command:** `[0xE0, len_b0…len_b7, file_data…]` — `len` is the uint64 LE byte count of `file_data`.

**Response (success):** `[0x06, 0x00, 0xE0, crc_b0…crc_b3]` — uint32 LE CRC-32 of the stored bytes, so the host can confirm the upload before issuing `g6-program-panel`.

**Response (error):** `[len, err, 0xE0, ASCII_msg]` — SD write failure or out-of-space.

---

#### 0xE3 get-firmware-info

Returns metadata about the firmware image currently on the controller, without transferring the image itself: the 32-byte footer that ends `/firmware/panel.bin` (`magic`, `version`, `image_crc32`, `image_size`). Lets the host answer "what firmware is loaded?" cheaply. Standard framing.

**Command:** `[0x01, 0xE3]`.

**Response (success):** `[0x22, 0x00, 0xE3, footer_b0…footer_b31]` — the 32-byte footer copied verbatim from the end of `/firmware/panel.bin`.

**Response (error):** `[len, err, 0xE3, ASCII_msg]` — no firmware image present, or footer validation failed.

---

#### 0xFF all-on

Fills every panel buffer with maximum-brightness GS16 oneshot blocks and starts the refresh timer.

**Command:** `[0x01, 0xFF]`

**Response:** `[len, 0x00, 0xFF, ASCII_msg]` — status = 0.

---

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

- **`g6-panel-storage-mode`** (opcode `0xC7`) — switches controller from **SD Mode** (default, `mode_byte = 0`) to **Local Storage Mode** (`mode_byte = 1`). When transitioning to Local Storage Mode, triggers the load phase that copies SD patterns into panel PSRAM. Wire form: `[0x02, 0xC7, mode_byte]`.
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

The controller reflashes panel firmware over SPI one panel at a time. The panel stages the image in PSRAM, then commits it via the OTA stub (LittleFS + reboot) — panel-side protocol surface is in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § In-System Programming (ISP). Verified end-to-end on hardware (confirmed by `g6-verify-panel` CRC readback). This is distinct from the out-of-band WebUSB/BOOTSEL flasher (`webDisplayTools/flasher/`), which programs a panel plugged directly into USB.

**Getting an image onto the controller:** the host uploads the firmware image with `set-firmware-file (0xE0)` (overwriting the previous one) and can check what's loaded with `get-firmware-info (0xE3)` (returns the footer — version, CRC, size — not the image bytes); `g6-program-panel (0xC8)` then flashes it to the selected panel.

**SD layout:** a single firmware image at `/firmware/panel.bin` — only one firmware is held on the controller at a time. Each image ends with a 32-byte footer `{magic, version, image_crc32, image_size}`; the controller validates the footer before any SPI traffic. Its version is read from the footer, not the filename.

**Per-panel workflow** (the host selects the target by **1-based** `panel_number`; the controller converts it to the 0-based `panel_index` = row in [`g6_arena_configs.h`](g6_arena_configs.h)):

1. Assert the targeted panel's CS only; all other CS lines inactive.
2. `ISP_ENTER` → record session nonce.
3. Stream the image into the panel's PSRAM staging buffer page-by-page with `ISP_WRITE_PAGE` (per-page CRC).
4. `ISP_VERIFY_STAGED` over the staged image, using the footer's `image_crc32`. On mismatch, abort — no flash has been touched, so the panel still runs its old firmware.
5. `ISP_COMMIT` → the panel writes the staged image to a LittleFS file + an OTA command (`PicoOTA`) and replies with a receipt, then reboots. The controller waits a fixed window for the LittleFS write before reading the receipt (`IspController::kCommitWaitMs`, ~12 s — the panel may format LittleFS on first use), then a further window for the reboot + OTA-stub install + boot (`kRebootWaitMs`, ~8 s). The actual flash write is done by the arduino-pico OTA stub at early-boot — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § ISP.
6. (Optional, separate command) `g6-verify-panel (0xC9)` → `ISP_ENTER` + `ISP_VERIFY_CRC` over the running app `[0, image_size)` confirms the installed image's CRC against the footer.

Sequential, one panel at a time — no parallel ISP across buses. On any failure the controller aborts, reports the failed panel number (1-based) and the last successful step; remaining panels are not auto-attempted. The install runs through the OTA stub and its OTA command persists in LittleFS until the copy succeeds, so an interrupted copy retries on the next boot; a hard failure is recovered via BOOTSEL-on-USB (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Brick recovery). The panel needs a LittleFS region (`board_build.filesystem_size > 0`).

ISP primitives may be reused for v3's deferred predefined-pattern programming mechanism (separate flash region).

`g6-program-panel (0xC8)` blocks until the reboot + install window elapses, then returns a single pass/fail; the host confirms the install out-of-band with `g6-verify-panel (0xC9)`.

### Bench validation procedure

Staged so each step de-risks the next; also the regression checklist after changes. Commands shown for the v0.2.1 panel (`pico_v021` / `image21` / `dist/panel_v0.2.1.bin`); use `pico_v031` / `image31` for v0.3.1. Requires `pixi` in both firmware trees, a Chrome/Edge browser (Web Serial), and USB to **both** the panel (BOOTSEL connector — the recovery path) and the Teensy. A logic analyzer on the panel SPI lines (SCK/COPI/CIPO/CS) helps for step 4.

0. **Build.** `cd "Generation 6/Panel-Firmware" && pixi run image21` (compiles the panel build and wraps it in the ISP footer → `dist/panel_v0.2.1.bin`; record the printed `version` / `image_size` / `image_crc32`). Then `cd ../Arena-Firmware && pixi run build`.
1. **USB-flash the panel, then the controller.** The panel must already run this ISP-capable firmware before it can receive ISP commands. `cd "Generation 6/Panel-Firmware" && pixi run deploy21a` (panel, over USB/BOOTSEL — see `pixi.toml` for the per-serial deploy tasks); `cd ../Arena-Firmware && pixi run deploy` (Teensy). Confirm the panel boots/displays normally and the Teensy enumerates as USB serial.
2. **SD path (no SPI, no brick risk).** Serve the console (`cd "Generation 6/webDisplayTools" && python -m http.server 8080` → `http://localhost:8080/arena_console.html`), **Connect** to the Teensy, ensure the display is **stopped** (`0xE0`/`0xC8`/`0xC9` are rejected with `CE_DISPLAY_ACTIVE` while running). In the **firmware** row click **Upload .bin** → `dist/panel_v0.2.1.bin`; expect `stored, CRC-32 0x…` then auto-**Info** `on SD: <version> (<size> B)`. ✅ Pass = the CRC-32 and size match what `make_isp_image.py` printed in step 0.
3. **Full ISP round-trip.** With the display stopped, set the **panel number** (1-based — the same number the console panel-map shows; the controller converts it to the 0-based `ArenaConfig.h` index `row×10 + col`). Click **Flash panel**; the controller runs `ISP_ENTER → ISP_WRITE_PAGE×N → ISP_VERIFY_STAGED → ISP_COMMIT`, then waits out the reboot+install. Expect `panel N flashed via OTA (<bytes> bytes); rebooting + applying update`.
4. **Confirm the install** with **Verify panel** (`g6-verify-panel`, 0xC9): it reads the panel's *running* app-flash CRC and compares it to the footer → `running-app CRC=0x… expected=0x… -> MATCH`. This — not the boot banner — is the reliable tell-tale (the panel's 2 s Serial-wait races USB re-enumeration, so the one-shot banner is easy to miss). To exercise a real change, ISP-flash a build whose source differs from what's installed and confirm the CRC moves.

A failure *before* `ISP_COMMIT` never touches flash (panel keeps its old firmware). The OTA copy self-heals an interrupted install on the next boot; a hard failure (corrupt LittleFS) is recovered by holding BOOTSEL and USB-reflashing: `cd "Generation 6/Panel-Firmware" && pixi run pio run -d panel -e pico_v021 -t upload`.

### ISP debug checkpoints (logic analyzer)

- `ISP_ENTER` COPI: header `0x01`/`0x81`, cmd `0xE4`, then the 16-byte `G6PANELISPENTER\0` sentinel + 4-byte token `ISP!`.
- The **phase-B read** after each command: the panel drives a multi-byte reply `[status][payload…][crc8]` on CIPO. **All-zeros CIPO** here points at the wired-OR MISO decode / return-path timing (see [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md)), not the ISP logic. A non-ISP panel at that index is silent on `0xE4` → `ISP_ENTER: no reply`.

### Bench-tunable parameters

- **ISP SPI clock:** `IspController::kIspClockMhz` = 2 MHz — conservative to avoid the high-clock CIPO realign; raise only after readback is proven.
- **Inter-phase delay:** `IspController::readResp` waits ~300 µs between a command and its reply read (`ISP_ENTER` is worst case — it `pmalloc`s the PSRAM staging buffer). Increase if the first reply byte is missed.
- **Commit / reboot waits:** `kCommitWaitMs` (~12 s, covers the LittleFS write + a first-use **format**) and `kRebootWaitMs` (~8 s, reboot + OTA copy + boot). Size up for multi-hundred-KB images.
- **LittleFS region required:** `board_build.filesystem_size = 512k` in `panel/platformio.ini`. With FS=0 there is nowhere to stage and `ISP_COMMIT` fails (status 8). The panel mounts/formats LittleFS **lazily at COMMIT** (loop context) — doing it in `setup()` deadlocks `idleOtherCore`.
- **`ISP_ENTER` `app_crc32`** is a placeholder (returns 0); use `g6-verify-panel` to read the running-app CRC instead.

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

**G6 measured transport throughput (128 kB `.pat` upload/download, local 100 Mbps LAN):**

| Direction | USB-CDC serial | TCP |
|---|---|---|
| Host → controller (SD write) | ~1370 kB/s | ~84 kB/s |
| Controller → host (file read) | ~8300 kB/s | ~5000 kB/s |

TCP upload is capped by QNEthernet's receive-buffer management (one TCP segment exposed per `read()` call), not by the network or SD card. For interactive commands — short request/response pairs — neither transport imposes a noticeable delay. See `g6_05-host-software.md` § Transport performance & multi-arena scaling for context on when improving TCP upload throughput would be worth the effort.

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
