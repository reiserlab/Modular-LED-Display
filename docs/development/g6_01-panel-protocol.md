# G6 — Panel Protocol

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Panel Version 1" → "Panel Version 4 and beyond" + "Panel Version Summary"; lines 61–1110) · Last reviewed: 2026-05-02 by mreiser
Status: **§ v1 = Specified, partially implemented** (5 spec ↔ firmware divergences vs `iorodeo/g6_firmware_devel`) · **§ v2 = Migrated (teaser); opcodes declared in firmware but behavior not implemented** · **§ v3 = Migrated (teaser) with Triggered/Gated/Persistent mode set finalized 2026-05-02; feasibility strongly prototyped via `G6_Panels_Test_Firmware`** (BCM, gating, trigger latency) · **§ v4 = Migrated (~30 % specified); zero firmware support anywhere; predefined-pattern flash mechanism is a prerequisite to design** · **§ v5 = Sketch only (roadmap, not implementable)** · **§ master command summary = Migrated; documents 24 commands across v1–v4**

This file holds the SPI-level protocol between the controller and the panels — message scaffolding, header byte, parity rule, the per-version command set, payload formats, panel confirmations, and pixel data layout. Versions are staged in chronological order (v1 first because it sets all the conventions and is the only version with deployable firmware in flight).

## Live Divergences (action items requiring decision)

| # | Topic | Spec | Firmware | Action |
|---|---|---|---|---|
| D2 | **Confirmation message** | Panel returns header + command + 8-bit checksum from previous command on next CS transaction; empty buffer → `0x81 0x00` | **Not implemented in v1 firmware.** No MISO write logic in `messenger.cpp` or `panel_spi_custom.cpp`; SPI is configured slave-receive-only | Spec is ahead of firmware. Note in spec text that this is "specified, firmware implementation pending". |
| D4 | **`COMM_CHECK` visual response** | "upon reception of the command a specific part of the panel could light up" (aspirational) | `Messenger::on_cmd_comms_check()` is empty ([messenger.cpp:82–84](../../../g6_firmware_devel/panel/src/messenger.cpp)) | Either (a) make it normative and require a visual response, or (b) drop the aspirational sentence. Firmware needs updating either way. |

(D1 Checksum scope, D3 Stretch behavior, D5 LED-mapping layering — all resolved 2026-05-02; see § History & Reconciliation § Major decisions log.)

Items the firmware exposes but the spec does not yet specify (lift into spec normatively):

- **SPI mode / polarity / clock**: `spi_set_format(spi0, 8, SPI_CPOL_1, SPI_CPHA_1, SPI_MSB_FIRST)`, `SPI_SPEED = 30 MHz`. Lifted into § SPI framing below.
- **`check_protocol(uint8_t protocol)`** ([message.cpp:69–71](../../../g6_firmware_devel/panel/src/message.cpp)) compares the *full header byte* (including parity bit) against `CMD_PROTOCOL_V1 = 0x01`. For a parity=1 message (header `0x81`) this returns false — would reject a valid v1 message with parity=1. Latent bug; would surface at v2 unless fixed.

---

## v1 — G6 Panel Protocol

Based on `<will@iorodeo.com>`'s [G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit), here is an updated request for comments for version 1 of the protocol between controller and panels.

Thinking ahead, future versions could look similar to what is specified in [Version 2 (teaser)](#v2--g6-panel-protocol-v2-teaser), [Version 3 (teaser)](#v3--g6-panel-protocol-v3-teaser), or even [Version 4 and beyond](#v4--g6-panel-protocol-v4-teaser), but all of those developments will depend on the things we can learn from v1.

Just to map out the space for commands, there is a preliminary list of commands in [Master command summary](#master-command-summary-v1v4), but all of this is subject to change.

### Message Format

All messages consist of:

- **Byte 0**: Header byte
- **Byte 1**: Command
- **Bytes 2–n**: Payload (command-dependent)

#### Header Byte (Byte 0)

The header byte structure:

- **Bit 7** (MSB): Parity bit (parity of entire message)
- **Bits 0–6**: Protocol version

For Protocol v1, the version bits are `0b0000001`, giving possible header values:

- `0x01` (`0b00000001`) — when parity bit = 0
- `0x81` (`0b10000001`) — when parity bit = 1

#### Parity Calculation

The parity bit (MSB of byte 0) is set such that the total count of '1' bits in the entire message (excluding the parity bit itself) modulo 2 equals the parity bit value. Specifically, it counts all '1' bits in:

- Bits 0–6 of byte 0 (version bits)
- All bits in byte 1 (command)
- All bits in bytes 2–n (payload)

The parity bit is set such that this count modulo 2 equals the parity bit value, providing basic parity-based error detection.

**Parity Examples:**

- 2-level oneshot (command `0x10`), all pixels=0, stretch=0 → header should be `0x01` (1 from version + 1 from command = 2 ones → parity 0)
- 2-level oneshot (command `0x10`), all pixels=0, stretch=1 → header should be `0x81` (1 from version + 1 from command + 1 from stretch = 3 ones → parity 1)
- 16-level oneshot (command `0x30`), all pixels=0, stretch=0 → header should be `0x81` (1 from version + 2 from command = 3 ones → parity 1)

#### Stretch Value

The stretch value is a single byte (0–255) that scales the brightness of all pixels in a pattern by **modulating the BCM bit-plane ON-time durations** (not the pixel values themselves). Effective per-bit-plane ON time = `base_T × stretch / 255`, where `base_T` is the BCM base time (0.5 µs in the test rig). Stretch = 0 → all bit-planes have zero ON time → display off; stretch = 255 → unchanged from base BCM weights. This:

- Gives **per-frame uniform brightness control** without rewriting pixel values.
- Enables **high dynamic range** via low-bit patterns + per-frame stretch (e.g., 4-level pattern at varying stretch yields finer effective brightness levels than 4-level alone).
- Is **cheap on the panel** (one multiplier on the BCM weight array per frame; no per-pixel multiply).
- Aligns with the test rig's **float-weight architecture** (`G6_Panels_Test_Firmware @ bb26a44` § BCMWEIGHTS), which already encodes per-bit-plane ON time as a float.

> **💡 Note — implementation status.** Stretch is parsed from the wire and stored on the `Pattern` object in `g6_firmware_devel @ 6944894`, but `Display::show()` does not yet apply it (Live Divergence D3 — historical, see History). Firmware ticket: scale BCM weights by `stretch/255` in the per-frame setup before bit-plane dispatch.

#### Endianness and Bit Packing

little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

#### SPI framing

Each message SHALL be transmitted as exactly one SPI transaction, bounded by chip-select (CS). The message begins on CS falling edge and ends on CS rising edge. The controller and panel SHALL reset their message parsers on CS rising edge.

**SPI mode**: CPOL=1, CPHA=1 (SPI Mode 3), MSB-first. **Clock**: panels accept up to 30 MHz (firmware default in `g6_firmware_devel/panel/src/constants.cpp`). Cross-platform implementations SHOULD configure the same.

A message from the controller to the panel is defined by the "protocol commands". The panels return the header and command from the previously received message followed by an 8-bit checksum.

The controller SHALL clock exactly the number of bytes required by the command for that protocol version, but at least 3 bytes. Invalid messages are ignored and don't trigger a panel update.

**Message rejection behavior:**

If any validation fails (unsupported protocol version, unsupported command, incorrect message length, parity failure), the panel SHALL discard the message.

### Implemented Commands

Version 1 of the protocol supports only three commands (controller → panel):

- `0x01` — Communication check
- `0x10` — Display 2-Level Grayscale (Oneshot)
- `0x30` — Display 16-Level Grayscale (Oneshot)

| Header (parity) | Header (version) | Cmd | Payload bytes | Total bytes | Name |
| :-: | :-: | :-: | :-: | :-: | :-- |
| 0\|1 | 1 | `0x01` | 200 | 202 | `COMM_CHECK` |
| 0\|1 | 1 | `0x10` | 51 (50 + stretch) | 53 | `DISP_2LVL_ONESHOT` |
| 0\|1 | 1 | `0x30` | 201 (200 + stretch) | 203 | `DISP_16LVL_ONESHOT` |

#### `0x01` — Communication check

Send a known message, display response. For example, upon reception of the command a specific part of the panel could light up. If it is interpreted correctly, a second part of the panel could light up for some time.

**Payload**: 200 bytes of known values — the byte sequence `0x00, 0x01, 0x02, …, 0xC7` (i.e., `payload[i] = i` for `i ∈ [0, 200)`).

**Example**:

`[0x01] [0x01] [0x00] [0x01] [0x02] … [0xC7]`

**Validation**: the panel MUST verify that the received payload matches the expected canonical sequence byte-for-byte. On mismatch, the panel reports a COMM_CHECK failure via the standard confirmation-message slot (in addition to the normal length/parity checks). This catches single-bit errors that pass parity, sequence-shift faults, and dropped-byte SPI faults — the whole point of having a known canonical payload.

#### `0x10` — Display 2-Level Grayscale (Oneshot)

Displays a 2-level (1-bit per pixel) pattern once.

**Payload**: 50 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x01] [0x10] [pixel data: 50 bytes] [stretch]`

#### `0x30` — Display 16-Level Grayscale (Oneshot)

Displays a 16-level (4-bit per pixel) pattern once.

**Payload**: 200 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x01] [0x30] [pixel data: 200 bytes] [stretch]`

### Confirmation message

On CS falling edge, a panel returns the version, command, and a checksum from the previously received command.

When the panel receives a command, it stores the header, version, and calculates an 8-bit checksum **over the whole message** (header byte + command byte + payload bytes, sum mod 256). For invalid commands no information is stored, since they are ignored. This happens, for example, when the parity bit does not match the content, or when the message length does not match the command definition.

The next time the CS is active for more than 3 bytes, the panel sends this message (recalculating the parity bit). After sending it successfully, the temporary buffer is deleted: each confirmation message is only sent once.

If the panel buffer is empty, it returns `0x8100` (empty command "0").

We use an 8-bit (simple additive) checksum over the whole message since this is faster to calculate than CRC, SHA, or other error-detecting algorithms (one loop over the receive buffer). Matches `Message::calculate_8bit_checksum()` in `g6_firmware_devel @ 6944894` ([message.cpp:171–177](../../../g6_firmware_devel/panel/src/message.cpp)). (Note: the panel-confirmation checksum here is **additive** (sum mod 256); the [pattern-file checksum in `g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) is **XOR**. Both are confirmed against firmware; the two algorithms intentionally differ.)

> **⚠ Flag — "CS active for more than 3 bytes" trigger condition.** Strict `>3` (so 3-byte heartbeat reads empty state) or `≥3` (every valid message triggers)? Reconcile against firmware.

> **⚠ Flag — `0x8100` empty-buffer response endianness.** Spec writes `0x8100` but the example block shows on-wire `[0x81] [0x00]`. Reword as "header `0x81` followed by command `0x00`" to remove ambiguity.

**Example:**

```
COPI: [0x01] [0x10] [pixel data 1: 50 bytes]  [stretch 1]
CIPO: [0x81] [0x00]
…
COPI: [0x01] [0x30] [pixel data 2: 200 bytes] [stretch 2]
CIPO: [0x_1] [0x10] [checksum pixel data 1 + stretch]
…
COPI: [0x01] [0x30] [pixel data 3: 200 bytes] [stretch 3]
CIPO: [0x_1] [0x30] [checksum pixel data 2 + stretch]
```

`[0x_1]` is shorthand for "either `0x01` or `0x81`" depending on the parity bit recomputed for the confirmation message.

### Pixel Data Format

Pixels are transmitted in row-major order. For 2-level, bits are packed MSB-first, 8 pixels per byte. For 16-level, there are two pixels per byte (upper nibble first).

**Explicit Indexing**:

Let `k = row × 20 + col`; `row ∈ (0…19)`, `col ∈ (0…19)`, `k ∈ (0..399)`, row-major.

**2-level (1bpp)**:

```
byte_index   = k // 8
bit_in_byte  = 7 - (k % 8)              # MSB-first
pixel        = (payload[byte_index] >> bit_in_byte) & 1
```

**16-level (4bpp)**:

```
byte_index = k // 2
if k even → pixel = (payload[byte_index] >> 4) & 0x0F
if k odd  → pixel =  payload[byte_index]       & 0x0F
```

No per-row padding; the bitstream is continuous across row boundaries.

#### Example pixel ↔ LED mapping for panel v0.1

The arrangement of pixels (row, column) looks like this:

```
pixel[0,0],  pixel[0,1],  …, pixel[0,19],
pixel[1,0],  pixel[1,1],  …, pixel[1,19],
…
pixel[19,0], pixel[19,1], …, pixel[19,19]
```

The G6 v0.1 panel hardware has LED designators in a 20×20 matrix; `pixel[0,0]` corresponds to D50 (bottom-left corner) and `pixel[19,19]` corresponds to D360 (top-right). Worked-example pixels:

- `pixel[0,0]` corresponds to LED D50 — 2-level: byte_index=0, bit_in_byte=7, bit 0; 16-level: byte_index=0, even, bits 0…3
- `pixel[0,1]` to LED D70 — 2-level: byte_index=0, bit_in_byte=6, bit 1; 16-level: byte_index=0, odd, bits 4…7
- `pixel[19,18]` to LED D340 — 2-level: byte_index=49, bit_in_byte=1, bit 398; 16-level: byte_index=199, even, bits 0…3
- `pixel[19,19]` to LED D360 — 2-level: byte_index=49, bit_in_byte=0, bit 399; 16-level: byte_index=199, odd, bits 4…7

For the full v0.1 mapping table (400 rows), see [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv); v0.2 / v0.3 mappings pending KiCad source extraction (see [`g6_02-led-mapping.md`](g6_02-led-mapping.md) Open Questions).

### Optional: Panel Error Display

While not essential for implementing the v1 commands described here, we expect it will be useful for G6 Panels to implement simple visual error indicators, similar to G3 implementation, to aid troubleshooting during development (and usage). When an error is detected, the panel displays a small predefined pattern representing an error index. The dedicated v1-namespace opcode for this is **`0xC2`** (alongside the existing panel-utility opcodes `0xC0` COMM_CHECK and `0xC1` Diagnostic — though the diagnostic-spec opcodes are tentative; see v2 § Query diagnostics). The error glyph itself can be a panel-firmware-baked predefined pattern, or composed by the controller and sent via `0x30` SetFrame as a v1-firmware-only fallback.

Suggested error message format: with 20×20 pixels, have plenty of space for 2×2 characters (5×7 pixel size per char is typical), so suggested messages would be: "PE / 01 - 99" — `PE` = panel error on the top row, and the error code would be displayed on the lower row.

Example (or some other font library with maybe 8×8 glyphs would be better):

```
....................
....................
...####....#####....
...#...#...#........
...####....####.....
...#.......#........
...#.......#........
...#.......#####....
....................
....................
...###.....###......
..#...#...#...#.....
..#..##......#......
..#.#.#......##.....
..##..#......#......
..#...#...#...#.....
...###.....###......
....................
....................
....................
```

During implementation, `<will@iorodeo.com>` should decide which errors are most relevant, but some suggestions are:

- Unknown or uninterpretable command
- Payload length mismatch
- Checksum/parity failure
- Data timeout / incomplete message

To make this error visible — we will need to keep them displayed for a short interval, at least 500 ms. This could be done with a dedicated error message routine that repeats the same pattern. During this time the panel should receive but ignore incoming commands so that the error can be noticed.

This feature is not required for protocol v1 compliance but provides a quick, hardware-level diagnostic without needing serial debug output.

---

## v2 — G6 Panel Protocol v2 (teaser)

Version 2 of the protocol extends v1 by adding PSRAM (Pseudo-Static RAM) support, enabling panels to store multiple patterns in memory and display them on demand. While protocol version 1 is already able to emulate all the commands G4 can support, protocol version 2 should be capable of handling higher framerates and might be a first useful version to release to the community.

For Protocol v2, the version bits are `0b0000010`, giving possible header values `0x02` (parity 0) / `0x82` (parity 1).

**Compatibility:** Panels implementing protocol version N MUST accept all commands from versions 1 through N. The version-bits in the header byte select which command set is dispatched, but a v2 panel receiving a header `[0x01]` with a v1 command MUST handle it as a valid v1 command. This rule is what lets v3 workflow examples mix v2 commands (e.g., `0x1F` Write 2-Level to PSRAM) into v3 sequences without conflict. (Scope of which commands carry over per version may be narrowed during implementation review — TBD.)

### Additional Commands (v2)

- `0x02` — Query diagnostics
- `0x03` — Reset diagnostic stats
- `0x0F` — Reset PSRAM
- `0x1F` — Write 2-Level Grayscale to PSRAM
- `0x3F` — Write 16-Level Grayscale to PSRAM
- `0x50` — Display PSRAM Index (Oneshot)

#### `0x02` — Query diagnostics

Get the diagnostics from the panel. We should circle back to this once v1 is implemented; current ideas from `<will@iorodeo.com>` include counting the number of bad bytes, short messages, or other error rates. Statistics could either be collected from `0x01` messages or from all messages sent since the last reset.

**Payload**: None (0 bytes)

**Example**:

`[0x02] [0x02]`

> **⚠ Flag — diagnostic data shape unspecified.** Spec the diagnostic record format (counters, error codes, response carrier slot) before this command becomes implementable.

#### `0x03` — Reset diagnostic stats

Reset the diagnostic counter.

**Payload**: None (0 bytes)

**Example**:

`[0x82] [0x03]`

#### `0x0F` — Reset PSRAM

Clears all user-stored patterns from PSRAM, keeping only factory predefined patterns.

**Payload**: None (0 bytes)

**Example**:

`[0x82] [0x0F]`

**Purpose**: Reset the panel's PSRAM to a clean state, removing all patterns stored via commands `0x1F` and `0x3F`.

- Starting a new experimental session with fresh memory
- Ensuring a known initial state before loading new patterns

#### `0x1F` — Write 2-Level Grayscale to PSRAM

Writes a 2-level (1-bit per pixel) pattern to PSRAM for later retrieval.

**Payload**: 54 bytes (3 idx + 50 pattern + 1 stretch)

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)
- **Bytes 5–54**: Pattern data (50 bytes)
  - 20×20 pixels in row-major order
  - 1 bit per pixel (0=off, 1=on)
  - Total: 400 pixels / 8 = 50 bytes
- **Byte 55**: stretch value

**Example**:

`[0x02] [0x1F] [index: 3 bytes] [pixel data: 50 bytes] [stretch]`

**Purpose**: Store patterns in the panel's PSRAM instead of transmitting them every time. This reduces transmission overhead during high-speed pattern sequences and enables efficient pattern libraries. (Multi-byte index follows the file-wide little-endian convention from [`g6_00-architecture.md`](g6_00-architecture.md); same applies to `0x3F` and `0x50`.)

#### `0x3F` — Write 16-Level Grayscale to PSRAM

Writes a 16-level (4-bit per pixel) pattern to PSRAM for later retrieval.

**Payload**: 204 bytes (3 idx + 200 pattern + 1 stretch)

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)
- **Bytes 5–204**: Pattern data (200 bytes)
  - 20×20 pixels in row-major order
  - 4 bits per pixel (0–15 intensity levels)
  - Total: 400 pixels × 4 bits / 8 = 200 bytes
- **Byte 205**: stretch value

**Example**:

`[0x02] [0x3F] [index: 3 bytes] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x1F` but for higher grayscale resolution patterns. Allows storage of more complex visual stimuli with 16 distinct brightness levels.

#### `0x50` — Display PSRAM Index (Oneshot)

Displays a pattern that was previously stored in PSRAM using command `0x1F` or `0x3F`.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x02] [0x50] [index: 3 bytes]`

**Purpose**: Display a pre-stored pattern immediately (oneshot = display once). This provides:

- **Fast pattern switching**: Only 5 bytes total (header + command + 3-byte index) need to be transmitted instead of 52–202 bytes
- **Efficient memory usage**: Store patterns once, reference them by index
- **Reduced bandwidth**: Critical for high-frequency pattern sequences

### Typical v2 Workflow

1. **Pre-load patterns into PSRAM**:

   ```
   [0x02] [0x1F] [0x00 0x00 0x00] [pattern 0 data…] [0xC0]   // stretch 192
   [0x02] [0x1F] [0x00 0x00 0x01] [pattern 1 data…] [0x05]   // stretch 5
   [0x02] [0x3F] [0x00 0x00 0x02] [pattern 2 data…] [0x20]   // stretch 32
   ```

2. **Display patterns by index during experiment**:

   ```
   [0x02] [0x50] [0x00 0x00 0x00]
   [0x02] [0x50] [0x00 0x00 0x01]
   [0x02] [0x50] [0x00 0x00 0x02]
   ```

(Example headers use `[0x02]` throughout; the actual parity bit depends on the elided pattern payloads — recompute when concrete patterns are chosen for a worked example.)

## v3 — G6 Panel Protocol v3 (teaser)

Version 3 adds high-performance modes to the existing protocol. This takes advantage of the PSRAM and the additional trigger line, allowing synchronized displays with imaging setups. This release will enable a whole new set of experiments, precisely controlling the timing of visual stimuli to the rest of the experimental rigs.

For Protocol v3, the version bits are `0b0000011`, giving possible header values `0x03` (parity 0) / `0x83` (parity 1).

### Display Modes

Protocol v3 introduces three new display modes alongside v1's Oneshot. Mode definitions finalized 2026-05-02:

**Oneshot** (v1 default): Display the pattern once immediately. Controller drives every frame. Most deterministic; canonical for G6.

**Triggered**: Each rising edge on the EINT trigger line fires one unit of display (e.g., one row, one frame, or one row-bit-plane — exact semantics per command). The pattern stays loaded after the command; subsequent rising edges refire it. Validated in `G6_Panels_Test_Firmware @ bb26a44` with **865 ± 17 ns trigger-to-LED latency** and zero jitter at 8 kHz (one row per trigger, the prototype's mode). Use case: sub-frame synchronization with external scanning systems (e.g., two-photon microscope resonant scanners).

**Gated**: While the EINT trigger line is HIGH, the panel internally refreshes the most recently loaded frame; while LOW, the display is off. Pattern remains loaded across HIGH↔LOW transitions until a new command. Use case: window-gated display for behavior-rig event windows.

> **💡 Note — Persistent mode (`0x13`, `0x33`, `0x53`) is proposed but NOT IMPLEMENTED in initial v3.** Controller-per-frame Oneshot is the canonical deterministic approach; bandwidth savings of Persistent are not justified by current use cases. Spec entries below are kept so the opcode slots are reserved if the case emerges later.

**Persistent** *(proposed; not implemented in initial v3)*: Display the pattern continuously, repeating it over and over until another command is received. Useful in principle for static backgrounds, but supplanted by Oneshot-per-frame for determinism.

### Additional Commands (v3)

Nine v3 display commands, three modes × three pattern types:

- `0x12` — Display 2-Level Grayscale (Triggered)
- `0x13` — Display 2-Level Grayscale (Persistent) — *proposed, not implemented*
- `0x14` — Display 2-Level Grayscale (Gated)
- `0x32` — Display 16-Level Grayscale (Triggered)
- `0x33` — Display 16-Level Grayscale (Persistent) — *proposed, not implemented*
- `0x34` — Display 16-Level Grayscale (Gated)
- `0x52` — Display PSRAM Index (Triggered)
- `0x53` — Display PSRAM Index (Persistent) — *proposed, not implemented*
- `0x54` — Display PSRAM Index (Gated)

#### `0x12` — Display 2-Level Grayscale (Triggered)

Displays a 2-level (1-bit per pixel) pattern, fired by each rising edge on the external trigger line.

**Payload**: 51 bytes (50 pattern + 1 stretch)

- 20×20 pixels in row-major order, 1 bit per pixel (0=off, 1=on); 400 pixels / 8 = 50 bytes

**Example**:

`[0x03] [0x12] [pixel data: 50 bytes] [stretch]`

**Purpose**: High-performance synchronization where individual display events are fired by external trigger edges. Critical for two-photon microscopy with resonant scanners, where visual stimuli must only be displayed during specific phases of the scan cycle.

#### `0x13` — Display 2-Level Grayscale (Persistent) — *proposed, not implemented in initial v3*

> **💡 Note — opcode reserved; not implemented in initial v3.** See § Display Modes above.

Displays a 2-level (1-bit per pixel) pattern continuously until a new command is received.

**Payload**: 51 bytes (50 pattern + 1 stretch)

**Example**:

`[0x03] [0x13] [pixel data: 50 bytes] [stretch]`

#### `0x14` — Display 2-Level Grayscale (Gated)

Displays a 2-level (1-bit per pixel) pattern, internally refreshed by the panel while the EINT trigger line is HIGH; display off while LOW. Pattern remains loaded across trigger transitions until a new command is received.

**Payload**: 51 bytes (50 pattern + 1 stretch)

- 20×20 pixels in row-major order, 1 bit per pixel; 400 pixels / 8 = 50 bytes

**Example**:

`[0x03] [0x14] [pixel data: 50 bytes] [stretch]`

**Purpose**: Window-gated display for experiments where the stimulus should be visible only during specific phases of an external control signal (behavior-rig event windows, gating pulses, optogenetics interleave).

#### `0x32` — Display 16-Level Grayscale (Triggered)

Displays a 16-level (4-bit per pixel) pattern, fired by each rising edge on the external trigger line.

**Payload**: 201 bytes (200 pattern + 1 stretch)

- 20×20 pixels in row-major order, 4 bits per pixel (0–15 intensity levels); 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x03] [0x32] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x12` but with 16-level grayscale for more complex visual stimuli.

#### `0x33` — Display 16-Level Grayscale (Persistent) — *proposed, not implemented in initial v3*

> **💡 Note — opcode reserved; not implemented in initial v3.** See § Display Modes above.

Displays a 16-level (4-bit per pixel) pattern continuously until a new command is received.

**Payload**: 201 bytes (200 pattern + 1 stretch)

**Example**:

`[0x03] [0x33] [pixel data: 200 bytes] [stretch]`

#### `0x34` — Display 16-Level Grayscale (Gated)

Displays a 16-level (4-bit per pixel) pattern, internally refreshed by the panel while the EINT trigger line is HIGH; display off while LOW.

**Payload**: 201 bytes (200 pattern + 1 stretch)

- 20×20 pixels in row-major order, 4 bits per pixel (0–15 intensity levels); 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x03] [0x34] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x14` but with 16-level grayscale for more complex visual stimuli.

#### `0x52` — Display PSRAM Index (Triggered)

Displays a pattern from PSRAM, fired by each rising edge on the external trigger line.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x03] [0x52] [index: 3 bytes]`

**Purpose**: High-performance mode combining PSRAM efficiency with trigger-aligned firing for two-photon microscopy synchronization.

#### `0x53` — Display PSRAM Index (Persistent) — *proposed, not implemented in initial v3*

> **💡 Note — opcode reserved; not implemented in initial v3.** See § Display Modes above.

Displays a pattern from PSRAM continuously until a new command is received.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x03] [0x53] [index: 3 bytes]`

#### `0x54` — Display PSRAM Index (Gated)

Displays a pattern from PSRAM, internally refreshed by the panel while the EINT trigger line is HIGH; display off while LOW. Pattern remains loaded across trigger transitions until a new command is received.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x03] [0x54] [index: 3 bytes]`

**Purpose**: Window-gated repeated display from PSRAM — useful for stimuli that should be visible only during specific phases of an external control signal (behavior-rig event windows) without re-issuing a display command per gating window.

### Typical v3 Workflows

**Two-photon microscopy with triggered display** (per-trigger-edge firing):

```
// Send pattern that will be fired on each scanner trigger edge, stretch 5
[0x03] [0x32] [pattern data: 200 bytes] [0x05]
// Each rising edge on EINT fires one display unit
```

**Window-gated PSRAM display** (display while trigger HIGH, off while LOW):

```
// Pre-load pattern to PSRAM, stretch 5
[0x02] [0x1F] [0x00 0x00 0x00] [pattern data: 50 bytes] [0x05]
// Display pattern from PSRAM, gated to EINT HIGH window
[0x03] [0x54] [0x00 0x00 0x00]
// Trigger HIGH -> pattern visible
// Trigger LOW  -> display off
// Trigger HIGH -> pattern visible again
// …until new command received
```

(The pre-load step uses `0x1F` from v2 with the v3 header byte `[0x03]` — explicit application of the version-superset rule from v2 § Compatibility.)

## v4 — G6 Panel Protocol v4 (teaser)

Version 4 introduces predefined patterns. Predefined patterns are widely used patterns such as all-on, checkerboards, etc.

For Protocol v4, the version bits are `0b0000100`, giving possible header values `0x04` (parity 0) / `0x84` (parity 1).

> **⚠ Flag — v4 deferred to future work; v1–v3 prioritized.** The v4 section below is a **teaser** — content gaps are intentional and not actionable until v1+v2+v3 ship. Specifically deferred: per-command spec sections for 7 of 10 v4 commands; the predefined-pattern catalog (slot count, factory-loaded vs user-installable, format, programming mechanism); **alignment to the v3 4-mode model** (Oneshot/Triggered/Gated/Persistent — current v4 list still uses the older "Trigger" / "Gated-Persistent" naming and will need updating; `0x64` / `0x74` Gated-Persistent slots will likely be dropped or repurposed since Gated-Persistent is no longer in the mode set). Do not target v4 for near-term implementation. The list and partial spec below are a roadmap, not a buildable surface.

### Additional Commands (v4)

- `0x60` — Display PSRAM Index with Stretch (Oneshot)
- `0x61` — Display PSRAM Index with Stretch (Trigger)
- `0x62` — Display PSRAM Index with Stretch (Gated)
- `0x63` — Display PSRAM Index with Stretch (Persistent)
- `0x64` — Display PSRAM Index with Stretch (Gated-Persistent) *— mode dropped from v3; slot likely deprecated*
- `0x70` — Display Predefined Pattern with Stretch (Oneshot)
- `0x71` — Display Predefined Pattern with Stretch (Trigger)
- `0x72` — Display Predefined Pattern with Stretch (Gated)
- `0x73` — Display Predefined Pattern with Stretch (Persistent)
- `0x74` — Display Predefined Pattern with Stretch (Gated-Persistent) *— mode dropped from v3; slot likely deprecated*

#### `0x70` — Display Predefined Pattern with Stretch (Oneshot)

Displays a predefined pattern (stored in panel flash memory) once with specified stretch value.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x70] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Access factory-loaded or pre-programmed patterns stored in panel flash memory. Useful for common patterns (calibration grids, test patterns, standard backgrounds) without requiring PSRAM upload. Stretch allows these base patterns to be displayed at different intensities. (`0x70` opcode also referenced by v1 § Optional Panel Error Display — see [v1 flag](#optional-panel-error-display) for the resolution options.)

#### `0x72` — Display Predefined Pattern with Stretch (Gated)

Displays a predefined pattern with stretch, gated by external trigger signal.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x72] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Gated display of predefined patterns. Useful for synchronized display of standard patterns during specific experimental phases.

#### `0x73` — Display Predefined Pattern with Stretch (Persistent)

Displays a predefined pattern continuously with stretch until new command received.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x73] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Persistent display of predefined patterns. Ideal for standard backgrounds or inter-trial displays that can be set once and left running.

(Catalog of predefined patterns — slot count, factory-loaded vs user-installable, programming mechanism — is part of the v4 deferred work; see banner at the top of v4 § Additional Commands.)

### Typical v4 Workflows

**Brightness modulation experiment**:

```
// Pre-load base pattern at medium intensity
[0x04] [0x1F] [0x00 0x00 0x00] [pattern data: 50 bytes]

// Display same pattern at different brightnesses
[0x04] [0x60] [0x00 0x00 0x00] [0x40]   // 25% brightness
[0x04] [0x60] [0x00 0x00 0x00] [0x80]   // 50% brightness
[0x04] [0x60] [0x00 0x00 0x00] [0xFF]   // 100% brightness
```

**High dynamic range with low-bit patterns**:

```
// Use 2-level pattern (1-bit) but achieve HDR via stretch
[0x04] [0x1F] [0x00 0x00 0x00] [2-level pattern: 50 bytes]

// Display at various intensities for effective multi-level grayscale
[0x04] [0x60] [0x00 0x00 0x00] [0x11]   // Dim
[0x04] [0x60] [0x00 0x00 0x00] [0x55]   // Medium-low
[0x04] [0x60] [0x00 0x00 0x00] [0xAA]   // Medium-high
[0x04] [0x60] [0x00 0x00 0x00] [0xFF]   // Bright

// Achieves 4+ effective brightness levels with 50-byte patterns
```

**Using predefined patterns for calibration**:

```
// Display factory calibration grid at full brightness
[0x04] [0x70] [0x00 0x00 0x00] [0xFF]

// Display test pattern at 50% brightness
[0x04] [0x70] [0x00 0x00 0x01] [0x80]
```

**Adaptive brightness during experiment**:

```
// Start with bright stimulus
[0x04] [0x63] [0x00 0x00 0x00] [0xFF]

// Adapt to subject — reduce brightness mid-experiment
[0x04] [0x63] [0x00 0x00 0x00] [0x60]

// Pattern continues displaying at new brightness
```

(The `0x1F` write through a `[0x04]` v4 header above raises the same cross-version-compatibility question as v3 — see the v3 gated example. Workflows here use `0x60` / `0x63` whose per-command details are tracked in the v4 spec-coverage flag earlier in this section.)

## v5 — G6 Panel Protocol v5 (sketch)

Add more grayscale levels, color support, and pattern modifiers.

- `0x20…0x2F` — use 4-level grayscales similar to `0x10…0x1F`
- `0x40…0x4F` — use 256-level grayscales similar to `0x10…0x1F`

(Pattern: `0x10` = 2-level, `0x20` = 4-level, `0x30` = 16-level, `0x40` = 256-level; the `0x00` slot and 8-level encoding are skipped, likely reserved for future use.)

Other commands that might be interesting:

- Get pattern from PSRAM and display as 2, 4, 16, or 256 level pattern with new color lookup table. That way one could invert a 2-color pattern from memory by just sending 7 bytes payload.
- Get pattern from PSRAM but translate by x or y pixel.
- Get pattern from PSRAM and change contrast (either using brightest or darkest pixel as reference).
- Increase or decrease brightness in other ways than stretch.
- Scale pattern sizes (zoom in, zoom out).

## Master command summary (v1–v4)

This table provides a complete reference of all commands across protocol versions v1–v4.

| Byte 0 (header) | Byte 1 (cmd) | Bytes 2+ (payload) | Description | Protocol version |
| :--: | :--: | :-- | :-- | :--: |
| `0x01` / `0x81` | `0x01` | 200 bytes | Communication check | v1 |
| `0x01` / `0x81` | `0x10` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Oneshot) | v1 |
| `0x01` / `0x81` | `0x30` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Oneshot) | v1 |
| `0x02` / `0x82` | `0x02` | None | Query diagnostic stats | v2 |
| `0x02` / `0x82` | `0x03` | None | Reset diagnostic stats | v2 |
| `0x02` / `0x82` | `0x0F` | None | Reset PSRAM (clear user patterns) | v2 |
| `0x02` / `0x82` | `0x1F` | 3 idx + 50 pattern + stretch | Write 2-Level Grayscale to PSRAM | v2 |
| `0x02` / `0x82` | `0x3F` | 3 idx + 200 pattern + stretch | Write 16-Level Grayscale to PSRAM | v2 |
| `0x02` / `0x82` | `0x50` | 3 idx | Display PSRAM Index (Oneshot) | v2 |
| `0x03` / `0x83` | `0x12` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Triggered) | v3 |
| `0x03` / `0x83` | `0x13` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Persistent) — *proposed, not implemented* | v3 |
| `0x03` / `0x83` | `0x14` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Gated) | v3 |
| `0x03` / `0x83` | `0x32` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Triggered) | v3 |
| `0x03` / `0x83` | `0x33` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Persistent) — *proposed, not implemented* | v3 |
| `0x03` / `0x83` | `0x34` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Gated) | v3 |
| `0x03` / `0x83` | `0x52` | 3 idx | Display PSRAM Index (Triggered) | v3 |
| `0x03` / `0x83` | `0x53` | 3 idx | Display PSRAM Index (Persistent) — *proposed, not implemented* | v3 |
| `0x03` / `0x83` | `0x54` | 3 idx | Display PSRAM Index (Gated) | v3 |
| `0x04` / `0x84` | `0x60` | 3 idx + stretch | Display PSRAM Index with Stretch (Oneshot) | v4 |
| `0x04` / `0x84` | `0x62` | 3 idx + stretch | Display PSRAM Index with Stretch (Gated) | v4 |
| `0x04` / `0x84` | `0x63` | 3 idx + stretch | Display PSRAM Index with Stretch (Persistent) | v4 |
| `0x04` / `0x84` | `0x70` | 3 idx + stretch | Display Predefined Pattern with Stretch (Oneshot) | v4 |
| `0x04` / `0x84` | `0x72` | 3 idx + stretch | Display Predefined Pattern with Stretch (Gated) | v4 |
| `0x04` / `0x84` | `0x73` | 3 idx + stretch | Display Predefined Pattern with Stretch (Persistent) | v4 |

(v4 Trigger and Gated-Persistent rows omitted pending alignment to the v3 mode set — see v4 deferred banner.)

**Notes:**

- **Byte 0 (Header)**: The two values shown (e.g., `0x01` / `0x81`) differ only in the MSB parity bit. The actual value depends on the parity of the entire message.
- **Protocol Version**: Encoded in bits 0–6 of Byte 0 (`0x01` = v1, `0x02` = v2, `0x03` = v3, `0x04` = v4).
- **Index**: 24-bit integer (3 bytes) specifying PSRAM or predefined pattern location.
- **Stretch**: 8-bit value (0–255) for brightness control.
- **Pattern Data**:
  - 2-level: 50 bytes (1 bit per pixel, 20×20 = 400 pixels)
  - 16-level: 200 bytes (4 bits per pixel, 20×20 = 400 pixels)

### Display Mode Summary

| Mode | Behavior | Use Case | Status |
| :-- | :-- | :-- | :-- |
| **Oneshot** | Display pattern once immediately; controller drives every frame | Standard display, frame-by-frame deterministic control | v1, canonical |
| **Triggered** | Each rising edge on EINT fires one display unit; pattern stays loaded | Sub-frame synchronization (two-photon microscopy resonant scanners, etc.) | v3, prototyped (`G6_Panels_Test_Firmware @ bb26a44`) |
| **Gated** | While EINT HIGH the panel internally refreshes the loaded pattern; while LOW, off | Window-gated display for behavior-rig event windows | v3 |
| **Persistent** | Display pattern continuously until next command | Static backgrounds (supplanted by Oneshot-per-frame for determinism) | v3, **proposed, not implemented in initial v3** |

### Protocol Evolution

- **v1**: Basic Oneshot display with stretch (2-level and 16-level grayscale)
- **v2**: PSRAM storage and indexed display (storage efficiency, fast pattern switching)
- **v3**: Triggered and Gated display modes (trigger-line synchronization for two-photon microscopy and behavior-rig gating); Persistent reserved but deferred
- **v4**: Predefined patterns with stretch — deferred to future work; will need re-alignment to v3 mode set
- **v5**: Additional grayscale levels, color support, pattern modifiers (future)

---

## Open Questions / TBDs

1. **D2 — Confirmation message implementation.** Specified, not yet implemented in `g6_firmware_devel`.
2. **D4 — `COMM_CHECK` visual response.** Spec aspirational; firmware callback empty. Make it normative or drop the sentence.
3. **`COMM_CHECK` panel-side validation policy.** With the canonical sequence pinned, decide whether the panel must verify the bytes or merely echo back the checksum.
4. **Confirmation-message trigger: `>3` or `≥3` bytes?** As written, every valid message would trigger confirmation send.
5. **`0x8100` empty-buffer response endianness.** Reword as two-byte description.
6. **`0x70` command code collides with v4 predefined-pattern command.** Pick one (move error display to a different code, or reserve predefined-pattern index 0 as the error-glyph slot in v4). Reconcile when v4 implementation begins.
7. **v2 zero-payload commands.** `0x02`, `0x03`, `0x0F` have zero-byte payloads in spec but firmware enforces `PAYLOAD_MINIMUM_SIZE = 1`. Decide during v2 migration: drop the floor or add a dummy byte.
8. **Worked pixel-mapping example pinned to panel v0.1 hardware.** Per-revision LED designator tables pending KiCad source extraction (see [`g6_02-led-mapping.md`](g6_02-led-mapping.md) Open Q #2).
9. **Panel error display command-set decision.** Which errors are most relevant and what command code carries them.
10. **PIXEL command** (in `G6_Panels_Test_Firmware`): future-version candidate (e.g., `0x55` PIXEL_SET in v4 or later); keep out of v3 spec.
11. **v3 trigger edge polarity** (from test rig). Firmware code expects rising edge but AD3 + Ch2 captures show LED fires on the **falling edge** of W1 — likely hardware ringing (±2.5 V overshoot). Hypothesis in `G6_Panels_Test_Firmware/single_led/SESSION_2026-04-24_PIOFULL_AD3.md`; not yet fixed.
12. **v3 synchronous vs asynchronous gating.** Test rig validates async (external GPIO trigger polling). Sync mode (PIO SM armed by internal counter) unproven — decide before deploying v3.

## History & Reconciliation

- **v1 reconciliation** against `g6_firmware_devel @ 6944894` (run 2026-05-01): 11 spec claims verified (parity rule, byte structure, opcode values `0x01`/`0x10`/`0x30`, payload sizes 200/51/201, pixel encoding row-major MSB-first, SPI rules, `PANEL_SIZE = 20`, stretch placement, message rejection, additive checksum); 3 spec open questions resolved by firmware (COMM_CHECK known sequence = `payload[i] = i`; parity rule = `popcount(version_bits ‖ command ‖ payload) mod 2`; source-spec parity examples 1–3 had errors — firmware is correct); 5 live divergences (D1–D5 above). Full reconciliation table in commit `9d36b9f`.
- **v2 reconciliation** (run 2026-05-01): all 6 v2 opcodes (`0x02`/`0x03`/`0x0F`/`0x1F`/`0x3F`/`0x50`) declared in `protocol.h:17–22`, but no payload sizes registered, no callbacks wired, no PSRAM driver — opcodes-declared, behavior-not-implemented. Forward-looking constraints: zero-payload commands collide with `PAYLOAD_MINIMUM_SIZE = 1`; `0x50` payload size discrepancy unresolved (recommend 3 bytes); diagnostic data shape still unspec'd. Full table in commit `9d36b9f`.
- **v3 test-rig validation** (run 2026-05-01) against `G6_Panels_Test_Firmware @ bb26a44` on G6 panels v0.2.1/v0.3.1: BCM 4-bit grayscale at 0.5 µs base time + 16 distinguishable brightness levels + 56% per-bit-plane brightness decay corrected via weight optimization `[1, 2, 5.02, 10.19]` (2.5% max error); zero-jitter external trigger gating (865 ± 17 ns latency, 0.000 µs std dev over 10k triggers); persistent BCMBURST loop at 400 Hz; 9.42 µs per-row burst within 15 µs 2P scan window with 5.6 µs margin. Full evidence in repo's `single_led/PRODUCTION_ARCHITECTURE.md`, `TIMING_SUMMARY.md`, `RESULTS.md`, `SESSION_2026-04-24_PIOFULL_AD3.md`. Two open blockers: trigger edge polarity (Open Q #14), sync-vs-async gating (Open Q #15).
- **v4 / v5**: nothing implemented anywhere (`protocol.h:10–23` declares only v1+v2 opcodes; test rig has no v4 capabilities). v4 deferred per banner; v5 a sketch.

### Major decisions log

- **2026-04-29** — Drop `SWITCH_GRAYSCALE_CMD` (0x06), `DISPLAY_RESET_CMD` (0x01) for G6 (commit `46264ae`).
- **2026-04-29** — Pattern File Format v2 (18-byte header) sole canonical; v1 historical content dropped (commit `6167e55`).
- **2026-04-29** — Drop standalone Panel Map file; panel mask (6 bytes) + row/col counts in pattern header (commit `f2aa1e5`).
- **2026-05-01** — TCP-only host↔controller transport (commit `46264ae`).
- **2026-05-01** — Arena jumper J30 = OPEN by default (Teensy-mediated EINT trigger) (commit `78be9ca`).
- **2026-05-01** — Panel-protocol opcode `0xC2` = Panel Error Display (v1 panel namespace) (commit `508da9e`).
- **2026-05-01** — Controller opcodes assigned: `0x40` = `g6-panel-storage-mode` (v2), `0x67` = `get-controller-info` (v1, version-dispatched response) (commit `508da9e`).
- **2026-05-01** — D9 panel ordering = row-major canonical (commit `f2aa1e5`).
- **2026-05-01** — `all_on (0x01,0xff)` and `all_off (0x01,0x00)` carry over from slim G4.1 controller-side opcodes (commit `46264ae`).
- **2026-05-01** — COMM_CHECK panel-side: panel MUST verify received bytes match expected sequence (commit `508da9e`).
- **2026-05-01** — TSI filename convention: `tsi<NNNN>_<descriptive-name>.tsi` (commit `f2aa1e5`).
- **2026-05-01** — Mode 4 AI lines exposed on Teensy D14/D15 (±10V); specific wiring still TBD (commit `78be9ca`).
- **2026-05-01** — v4 explicitly deferred to future work; v1–v3 prioritized (commit `f3da927`).
- **2026-05-01** — Modes table (1–5) lives in `g6_03` as the unified reference (commit `3c39a44`).
- **2026-05-02** — **Triggered / Gated / Persistent v3 mode set finalized.** Triggered = per-edge single-shot (`0x12`/`0x32`/`0x52`); Gated = window gating (`0x14` NEW + `0x34` NEW + `0x54` reused); Persistent (`0x13`/`0x33`/`0x53`) reserved but proposed-not-implemented; Gated-Persistent dropped from mode set (commit `a334004`).
- **2026-05-02** — **D5 LED-mapping layering RESOLVED**: two-stage model. Host owns *logical → schematic* mapping (rotation, flip, panel position in arena); panel firmware owns *schematic → physical-pin* mapping (PCB layout-driven, with `NUM_COLOR = 4` quadrant scheme per `display.cpp::sch_to_pos_index()` in `g6_firmware_devel @ 6944894`). Spec text in `g6_00`, `g6_01`, `g6_02` updated to reflect this (this commit).
- **2026-05-02** — **D1 Checksum scope RESOLVED**: whole-message (header + command + payload, sum mod 256). Matches `g6_firmware_devel @ 6944894` (`Message::calculate_8bit_checksum()` in `message.cpp:171–177`); spec § Confirmation message updated. Worked example reads payload-only but the value happens to be the same when header + command bytes round to 0 mod 256 — spec text now explicit (this commit).
- **2026-05-02** — **Stretch semantics RESOLVED**: BCM duty-cycle multiplier. Effective per-bit-plane ON time = `base_T × stretch / 255`; stretch = 0 → display off. Aligns with the test rig's float-weight architecture; cheap on the panel (one multiplier per frame). Firmware ticket: scale BCM weights in `Display::show()` setup (this commit).

## Cross-references

- [Source Google Doc, "Panel Version 1" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this section.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — origin of pattern-data row-major MSB-first convention.
- [`g6_00-architecture.md`](g6_00-architecture.md) — system architecture, host/controller/panel responsibilities, endianness.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — panel hardware reference (v0.2 + v0.3) + LED mapping; v0.1 mapping CSV in [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv).
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — host-side panel-block formatting (parity pre-computation), checksum algorithm.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side framing, panel-set transmission, command dispatch.
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — authoritative v1 panel firmware (reconciliation pending).
- [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — v3 prototype / characterization rig (BCM, gating, trigger latency).
