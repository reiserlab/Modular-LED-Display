# G6 — Panel Protocol

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Panel Version 1" → "Panel Version 4 and beyond" + "Panel Version Summary"; lines 61–1110) · Last reviewed: 2026-05-01 by mreiser
Status: **§ v1 = Specified, partially implemented** (wire format on the COPI side matches firmware; confirmation message + stretch + error display NOT yet implemented; 5 spec ↔ firmware divergences flagged below) · § v2/v3/v4/v5 + master summary = _not yet migrated, in subsequent passes_

This file holds the SPI-level protocol between the controller and the panels — message scaffolding, header byte, parity rule, the per-version command set, payload formats, panel confirmations, and pixel data layout. Versions are staged in chronological order (v1 first because it sets all the conventions and is the only version with deployable firmware in flight).

## Current state

- **v1 protocol implementation (authoritative):** [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) at `6944894` (2026-02-12). Local read-only clone at `/Users/reiserm/Documents/GitHub/g6_firmware_devel/`. Layout: `panel/{platformio.ini, src/{main, messenger, message, protocol, panel_spi_custom, display, pattern, constants}.{cpp,h}}` and `test_arena/{platformio.ini, src/main.cpp}`.
- **v3 prototype evidence:** [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — debug/test code that proved BCM-via-PIO, gating, all-off, and the experimental `PIXEL` command on G6 panels v0.2.1 / v0.3.1. Cited in the v3 section (when it lands) as "prototyped", **not** as a v1 reference and **not** as a deployable implementation.

### Reconciliation against `g6_firmware_devel` @ `6944894` (run 2026-05-01)

**Confirmations (spec matches firmware):**

| Spec claim | Firmware evidence | Verdict |
|---|---|---|
| Parity rule = `popcount(version_bits ‖ command ‖ payload) mod 2` | `Message::calculate_parity_bit()` ([message.cpp:157–168](../../../g6_firmware_devel/panel/src/message.cpp)) masks bit 7 of byte 0, sums popcounts across all bytes, returns `sum % 2` | ✓ |
| 1-byte header + 1-byte command + payload | `HEADER_SIZE = 2` ([protocol.cpp:8](../../../g6_firmware_devel/panel/src/protocol.cpp)); byte 0 = header, byte 1 = command (`Message::header_byte()`, `Message::command_byte()`) | ✓ |
| `0x01` / `0x10` / `0x30` opcodes | `CMD_ID_COMMS_CHECK = 0x01`, `CMD_ID_DISPLAY_GRAY_2 = 0x10`, `CMD_ID_DISPLAY_GRAY_16 = 0x30` ([protocol.h:12–14](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ |
| Payload sizes 200 / 51 / 201 bytes | `PAYLOAD_COMMS_CHECK = 200`, `PAYLOAD_DISPLAY_GRAY_2 = 51`, `PAYLOAD_DISPLAY_GRAY_16 = 201` ([protocol.cpp:10–12](../../../g6_firmware_devel/panel/src/protocol.cpp)) | ✓ |
| Pixel data row-major, MSB-first, `byte_index = k//8`, `bit_in_byte = 7 - (k%8)` (2bpp) | `Message::from_pattern_gray_2()` ([message.cpp:195–224](../../../g6_firmware_devel/panel/src/message.cpp)): outer loop `i = row 0..19`, inner `j = col 0..19`, `byte_num = pixel_num/8`, `bit_pos = 7 - (pixel_num - 8*byte_num)` | ✓ |
| 16-level: `byte_index = k//2`; even pixel → upper nibble, odd → lower | `Message::from_pattern_gray_16()` ([message.cpp:226–264](../../../g6_firmware_devel/panel/src/message.cpp)): `byte_num = pixel_num/2`, even → `upper = pixel_value << 4`, odd → `lower = pixel_value` | ✓ |
| `PANEL_SIZE = 20` (×20 = 400 pixels) | `constexpr uint8_t PANEL_SIZE = 20` ([protocol.h:26](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ |
| Stretch is the last byte of the payload | `Message::from_pattern_gray_*()` writes `data_.at(total_size-1) = pat.stretch();` ([message.cpp:222, 262](../../../g6_firmware_devel/panel/src/message.cpp)) | ✓ |
| Invalid messages silently discarded (parity / length) | `Messenger::update()` ([messenger.cpp:45–60](../../../g6_firmware_devel/panel/src/messenger.cpp)) only invokes the command callback when `check_parity()` AND `check_length()` both pass | ✓ |
| SPI message ends on CS rising edge; parser reset | `custom_spi_read_blocking` ([panel_spi_custom.cpp:16–49](../../../g6_firmware_devel/panel/src/panel_spi_custom.cpp)) breaks the read loop the moment `gpio_get(cs_pin)` goes high; the next `panel_spi_read()` reuses the same Message buffer (effectively a parser reset) | ✓ |
| Checksum is "8-bit (simple additive)" | `Message::calculate_8bit_checksum()` ([message.cpp:171–177](../../../g6_firmware_devel/panel/src/message.cpp)) returns `uint8_t(sum_of_all_bytes)` | ✓ on algorithm |
| `MESSAGE_MINIMUM_SIZE = 3` ("at least 3 bytes" rule) | `MESSAGE_MINIMUM_SIZE = HEADER_SIZE + PAYLOAD_MINIMUM_SIZE = 2 + 1 = 3` ([protocol.cpp:13](../../../g6_firmware_devel/panel/src/protocol.cpp)) | ✓ |

**Resolutions (firmware answers spec open questions):**

| Spec open question | Firmware answer |
|---|---|
| What is the COMM_CHECK "known sequence"? | `Message::to_comms_check()` ([message.cpp:121–136](../../../g6_firmware_devel/panel/src/message.cpp)) sets `payload[i] = uint8_t(i)` for `i ∈ [0, 200)` — i.e., bytes `0x00, 0x01, … 0xC7` |
| What is the parity rule, definitively? | `parity = popcount(byte0_with_bit7_masked ‖ byte1 ‖ payload) mod 2`, exactly as the spec describes |
| Examples 1, 2, 3 — which are right? | Working through firmware: Ex1 should be `0x01` (spec says `0x81` — **wrong**); Ex2 should be `0x81` (spec says `0x01` — **wrong**, headers swapped); Ex3 header `0x81` is correct but the parenthetical "1 + 1 from command → 0 parity" is doubly wrong (`0x30` has 2 ones, not 1; correct popcount = 1+2 = 3 → parity 1) |

**Spec ↔ firmware divergences (need a decision):**

| # | Topic | Spec | Firmware | Action |
|---|---|---|---|---|
| D1 | **Checksum scope** | "calculates a 8-bit checksum **of the payload**" (§ Confirmation message) | `calculate_8bit_checksum()` sums **all bytes** including header byte and command byte ([message.cpp:171–177](../../../g6_firmware_devel/panel/src/message.cpp)) | Decide whether checksum covers payload only or whole message. The firmware impl is simpler (one loop over `data_`), but the spec example (`checksum pixel data 1 + stretch`) reads as payload-only. |
| D2 | **Confirmation message** | Panel returns header + command + 8-bit checksum from previous command on next CS transaction; empty buffer → `0x81 0x00` | **Not implemented in v1 firmware.** No MISO write logic in `messenger.cpp` or `panel_spi_custom.cpp`; SPI is configured slave-receive-only | Spec is ahead of firmware. Not blocking spec sign-off, but the spec text should note this is "specified, firmware implementation pending". |
| D3 | **Stretch behavior** | "scales the brightness of all pixels in a pattern" — provides dynamic brightness, HDR, modulation, adaptive stimuli | **Stretch is parsed from the wire and stored on the Pattern, but `Display::show()` ([display.cpp:43–88](../../../g6_firmware_devel/panel/src/display.cpp)) never reads `pat_.stretch()`.** Stretch has zero effect on the rendered display. | Major divergence. v1 firmware does not yet implement stretch. Spec sign-off OK; firmware ticket needed. |
| D4 | **`COMM_CHECK` visual response** | "upon reception of the command a specific part of the panel could light up" (aspirational) | `Messenger::on_cmd_comms_check()` is empty ([messenger.cpp:82–84](../../../g6_firmware_devel/panel/src/messenger.cpp)) — wire-level reception is validated but no display response | Spec was already aspirational ("could light up"). Either (a) make it normative and require a visual response, or (b) drop the aspirational sentence. Firmware would need updating either way to make it visible. |
| D5 | **Schematic-to-position LED mapping in panel firmware** | "Host owns LED mapping (pixel → physical LED), including corrections for rotated / flipped panels" — i.e., panel firmware should NOT remap | `display.cpp::sch_to_pos_index()` ([display.cpp:91–114](../../../g6_firmware_devel/panel/src/display.cpp)) **does** apply a non-trivial mapping from "schematic" pixel coordinates to physical row/column pin indices, with a 4-color quadrant scheme based on `NUM_COLOR = 4` | Layering decision needed. Likely correct framing: host owns *logical → schematic* mapping (rotation, flip, panel-position-in-arena); firmware owns *schematic → physical-pin* mapping (driven by the panel PCB layout). Update spec to reflect this 2-stage mapping rather than the absolute "host owns mapping" wording. Cross-references the same architecture flag in [`g6_00-architecture.md`](g6_00-architecture.md). |

**Items the firmware exposes but the spec does not yet specify:**

- **SPI mode / polarity / clock**: `spi_set_format(spi0, 8, SPI_CPOL_1, SPI_CPHA_1, SPI_MSB_FIRST)`, `SPI_SPEED = 30 MHz` ([messenger.cpp:42](../../../g6_firmware_devel/panel/src/messenger.cpp), [constants.cpp:15](../../../g6_firmware_devel/panel/src/constants.cpp)). Spec should specify SPI mode (CPOL=1, CPHA=1 = Mode 3), bit order (MSB first), and a max clock for cross-platform interop. Pin assignments are firmware-side: `SPI_SCK_PIN = 34`, `SPI_MOSI_PIN = 32`, `SPI_MISO_PIN = 35`, `SPI_CS_PIN = 33` ([constants.cpp:7–10](../../../g6_firmware_devel/panel/src/constants.cpp)).
- **v2 command codes already declared:** `protocol.h` already declares `CMD_ID_QUERY_DIAGNOSTIC = 0x02`, `CMD_ID_RESET_DIAGNOSTICS = 0x03`, `CMD_ID_RESET_PSRAM = 0x0F`, `CMD_ID_SET_PSRAM_GRAY_2 = 0x1F`, `CMD_ID_SET_PSRAM_GRAY_16 = 0x3F`, `CMD_ID_DISPLAY_PSRAM = 0x50` — the v2 PSRAM command set. They are scaffolded but not implemented (no entries in `PAYLOAD_SIZE_UMAP`, no callbacks in `Messenger::cmd_umap_`). Useful starting point for v2 reconciliation.
- **`check_protocol(uint8_t protocol)`** ([message.cpp:69–71](../../../g6_firmware_devel/panel/src/message.cpp)) compares the *full header byte* (including parity bit) against `CMD_PROTOCOL_V1 = 0x01`. For a parity=1 message (header `0x81`) this returns false — it would reject a valid v1 message with parity=1. **However, `Messenger::update()` does not call `check_protocol()`** ([messenger.cpp:45–60](../../../g6_firmware_devel/panel/src/messenger.cpp)), so this latent bug is dormant in v1. It would surface at v2 (when multiple protocol versions co-exist) unless `check_protocol` is changed to mask the parity bit before comparing.
- **Optional Panel Error Display:** not implemented. Confirmed the spec's "not required for protocol v1 compliance" — firmware doesn't include it.

> **⚠ Flag — file-scope status mixing:** the file is being built up version-by-version (v1 first, then v2, then v3, then v4/v5/summary), each with sign-off. While that's in progress, the status line above will mix Specified (for landed versions) with `_not yet migrated_` for the rest. This is expected during Phase-1 development.

---

# v1 — G6 Panel Protocol

Based on `<will@iorodeo.com>`'s [G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit), here is an updated request for comments for version 1 of the protocol between controller and panels.

Thinking ahead, future versions could look similar to what is specified in [Version 2 (teaser)](#v2--g6-panel-protocol-v2-teaser), [Version 3 (teaser)](#v3--g6-panel-protocol-v3-teaser), or even [Version 4 and beyond](#v4-and-beyond), but all of those developments will depend on the things we can learn from v1.

Just to map out the space for commands, there is a preliminary list of commands in [Version Summary](#master-command-summary-v1v4), but all of this is subject to change.

## Message Format

All messages consist of:

- **Byte 0**: Header byte
- **Byte 1**: Command
- **Bytes 2–n**: Payload (command-dependent)

### Header Byte (Byte 0)

The header byte structure:

- **Bit 7** (MSB): Parity bit (parity of entire message)
- **Bits 0–6**: Protocol version

For Protocol v1, the version bits are `0b0000001`, giving possible header values:

- `0x01` (`0b00000001`) — when parity bit = 0
- `0x81` (`0b10000001`) — when parity bit = 1

### Parity Calculation

The parity bit (MSB of byte 0) is set such that the total count of '1' bits in the entire message (excluding the parity bit itself) modulo 2 equals the parity bit value. Specifically, it counts all '1' bits in:

- Bits 0–6 of byte 0 (version bits)
- All bits in byte 1 (command)
- All bits in bytes 2–n (payload)

The parity bit is set such that this count modulo 2 equals the parity bit value, providing basic parity-based error detection.

**Parity Examples:**

- 2-level oneshot (command `0x10`), all pixels=0, stretch=0 → header should be `0x01` (1 from version + 1 from command = 2 ones → parity 0)
- 2-level oneshot (command `0x10`), all pixels=0, stretch=1 → header should be `0x81` (1 from version + 1 from command + 1 from stretch = 3 ones → parity 1)
- 16-level oneshot (command `0x30`), all pixels=0, stretch=0 → header should be `0x81` (1 from version + 2 from command = 3 ones → parity 1)

### Stretch Value

The stretch value is a single byte (0-255) that scales the brightness of all pixels in a pattern. This provides:

- **Dynamic brightness control**: Adjust pattern intensity without changing the pattern
- **High dynamic range**: Use low-bit patterns (e.g., 4-level) with stretch to achieve effective higher dynamic ranges
- **Efficient modulation**: Change brightness rapidly for temporal experiments
- **Adaptive stimuli**: Match brightness to experimental conditions or subject sensitivity

> **⚠ Flag — stretch semantics underspecified:** "scales the brightness of all pixels" is intuitive but not normative. Open questions: is the scaling linear (`displayed = pixel × stretch / 255`), gamma-corrected, or a BCM duty-cycle multiplier? Does stretch=0 mean "off" (multiplicative interpretation) or does it have some floor? How does stretch interact with the BCM bit-plane refresh in the v3 prototype? Reconcile against `g6_firmware_devel` (v1 baseline) and `G6_Panels_Test_Firmware` (BCM characterization).
>
> **🔴 Divergence (2026-05-01) vs `g6_firmware_devel @ 6944894`:** stretch is parsed from the wire and stored on the `Pattern` object, but `Display::show()` ([display.cpp:43–88](../../../g6_firmware_devel/panel/src/display.cpp)) **never reads `pat_.stretch()`**. So in v1 firmware, stretch has zero effect on what gets displayed. See [Current state § D3](#reconciliation-against-g6_firmware_devel--6944894-run-2026-05-01). Action: spec stays as-is for the wire format; firmware needs a ticket to wire stretch into the display loop.

### Endianness and Bit Packing

little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

> **⚠ Flag — redundancy:** this rule is already stated in [`g6_00-architecture.md`](g6_00-architecture.md). Consider removing the duplicate in Phase 2 consolidation, or keep as a per-section reminder if helpful.

### SPI framing

Each message SHALL be transmitted as exactly one SPI transaction, bounded by chip-select (CS). The message begins on CS falling edge and ends on CS rising edge. The controller and panel SHALL reset their message parsers on CS rising edge.

A message from the controller to the panel is defined by the "protocol commands". The panels return the header and command from the previously received message followed by an 8-bit checksum.

The controller SHALL clock exactly the number of bytes required by the command for that protocol version, but at least 3 bytes. Invalid messages are ignored and don't trigger a panel update.

**Message rejection behavior:**

If any validation fails (unsupported protocol version, unsupported command, incorrect message length, parity failure), the panel SHALL discard the message.

> **⚠ Flag — v2 forward note:** the "at least 3 bytes" floor is encoded in firmware as `MESSAGE_MINIMUM_SIZE = HEADER_SIZE (2) + PAYLOAD_MINIMUM_SIZE (1) = 3`. v2 commands `0x02`, `0x03`, `0x0F` have zero-byte payloads in the source spec — under the firmware's current rule those would need at least 1 dummy payload byte (since `PAYLOAD_MINIMUM_SIZE = 1`), or `PAYLOAD_MINIMUM_SIZE` needs to drop to 0. Decide during v2 migration.

## Implemented Commands

Version 1 of the protocol supports only three commands (controller → panel):

- `0x01` — Communication check
- `0x10` — Display 2-Level Grayscale (Oneshot)
- `0x30` — Display 16-Level Grayscale (Oneshot)

| Header (parity) | Header (version) | Cmd | Payload bytes | Total bytes | Name |
| :-: | :-: | :-: | :-: | :-: | :-- |
| 0\|1 | 1 | `0x01` | 200 | 202 | `COMM_CHECK` |
| 0\|1 | 1 | `0x10` | 51 (50 + stretch) | 53 | `DISP_2LVL_ONESHOT` |
| 0\|1 | 1 | `0x30` | 201 (200 + stretch) | 203 | `DISP_16LVL_ONESHOT` |

> **⚠ Flag — table column structure flattened from source:** the source table had a 2-row merged header (`Header` over `parity / version`) and a stray empty 6th column. Flattened to clean Markdown above. Verify equivalence: parity column is `0|1` (parity bit can be either), version column is `1` (v1 version bits = `0b0000001` = 1).

### `0x01` — Communication check

Send a known message, display response. For example, upon reception of the command a specific part of the panel could light up. If it is interpreted correctly, a second part of the panel could light up for some time.

**Payload**: 200 bytes of known values — the byte sequence `0x00, 0x01, 0x02, …, 0xC7` (i.e., `payload[i] = i` for `i ∈ [0, 200)`).

**Example**:

`[0x01] [0x01] [0x00] [0x01] [0x02] … [0xC7]`

> **⚠ Flag — open: panel-side validation behavior:** with the canonical sequence pinned, the remaining open question is whether the panel should also *verify* the bytes match the expected sequence (rejecting mismatches), or whether it just echoes back the checksum and lets the host compare. Firmware currently does no payload-content validation beyond length/parity. Spec the verification policy explicitly.

### `0x10` — Display 2-Level Grayscale (Oneshot)

Displays a 2-level (1-bit per pixel) pattern once.

**Payload**: 50 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x01] [0x10] [pixel data: 50 bytes] [stretch]`

### `0x30` — Display 16-Level Grayscale (Oneshot)

Displays a 16-level (4-bit per pixel) pattern once.

**Payload**: 200 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x01] [0x30] [pixel data: 200 bytes] [stretch]`

## Confirmation message

On CS falling edge, a panel returns the version, command, and a checksum from the previously received command.

When the panel receives a command, it stores the header, version, and calculates a 8-bit checksum of the payload. For invalid commands no information is stored, since they are ignored. This happens, for example, when the parity bit does not match the content, or when the message length does not match the command definition.

The next time the CS is active for more than 3 bytes, the panel sends this message (recalculating the parity bit). After sending it successfully, the temporary buffer is deleted: each confirmation message is only sent once.

If the panel buffer is empty, it returns `0x8100` (empty command "0").

We use an 8-bit (simple additive) checksum since this is faster to calculate than CRC, SHA, or other error detecting algorithms.

> **⚠ Flag — checksum algorithm naming inconsistency:** the prose says "8-bit (simple additive) checksum" but the [Pattern File Format tab](g6_04-pattern-file-format.md) uses an "XOR" checksum for the PAT-file body. Two different checksum algorithms in the same protocol family is fine if intentional, but worth noting. Confirm `g6_firmware_devel` implements additive (sum mod 256), not XOR, for panel confirmations.

> **⚠ Flag — "CS active for more than 3 bytes" trigger condition:** the rule is that the panel transmits its stored confirmation when the next CS transaction exceeds 3 bytes. But the "at least 3 bytes" rule above also says the controller clocks at least 3 bytes per message. So *every* valid message would trigger confirmation transmission — no discriminator. Question: is the trigger really `>3 bytes` (strict) so that a hypothetical 3-byte heartbeat could read empty buffer state without triggering confirmation send? Or is it `≥3 bytes`? Reconcile against `g6_firmware_devel`.

> **⚠ Flag — "0x8100" empty-buffer response is endianness-ambiguous:** is this a 16-bit value `0x8100` packed little-endian (so on the wire it's `0x00 0x81`)? Or is it `[header=0x81] [command=0x00]` as 2 separate bytes (so on the wire it's `0x81 0x00`)? The example block shows `CIPO: [0x81] [0x00]` which suggests the latter byte order. Recommend rewording to "returns header `0x81` followed by command `0x00`" to remove ambiguity.

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

## Pixel Data Format

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

### Example pixel ↔ LED mapping for panel v0.1

The arrangement of pixels (row, column) looks like this:

```
pixel[0,0],  pixel[0,1],  …, pixel[0,19],
pixel[1,0],  pixel[1,1],  …, pixel[1,19],
…
pixel[19,0], pixel[19,1], …, pixel[19,19]
```

The current G6 v0.1 hardware has LED designators in the following matrix:

```
D1   D21  D20  …  D341  D340  D360
D41  D61  D60  …  D381  D380  D400
D2   D22  D19  …  D342  D339  D359
…
D49  D69  D52  …  D389  D372  D392
D10  D30  D11  …  D350  D331  D351
D50  D70  D51  …  D390  D371  D391
```

For the full mapping, see [`g6_02-led-mapping.md`](g6_02-led-mapping.md).

We want `pixel[0,0]` to start at the bottom-left corner and `pixel[19,19]` to end at the top-right.

This means:

- `pixel[0,0]` corresponds to LED D50
  - 2-level: byte_index=0, bit_in_byte=7; bit 0
  - 16-level: byte_index=0, even; bits 0…3
- `pixel[0,1]` to LED D70
  - 2-level: byte_index=0, bit_in_byte=6; bit 1
  - 16-level: byte_index=0, odd; bits 4…7
- `pixel[19,18]` to LED 340
  - 2-level: byte_index=49, bit_in_byte=1; bit 398
  - 16-level: byte_index=199, even; bits 0…3
- `pixel[19,19]` to LED 360, and so on
  - 2-level: byte_index=49, bit_in_byte=0; bit 399
  - 16-level: byte_index=199, odd; bits 4…7

> **⚠ Flag — example pinned to v0.1 hardware:** current production is `panel_rp2354_20x20_v0p2` and `v0.3.0` is in draft; the v0.1 LED designator layout used in this example is not the production layout. The full LED mapping (`g6_02-led-mapping.md`) needs to either (a) carry per-revision tables and have this example annotate which revision the worked numbers refer to, or (b) supersede this v0.1 example with a v0.2 / v0.3 walkthrough. Decide once `g6_02-led-mapping.md` lands.

## Optional: Panel Error Display

While not essential for implementing the v1 commands described here, we expect it will be useful for G6 Panels to implement simple visual error indicators, similar to G3 implementation, to aid troubleshooting during development (and usage). When an error is detected, the panel displays a small predefined pattern representing an error index. A future-proof implementation could already use the command `0x70`. If Flash pattern storage and display are working well, then this should be the most convenient implementation.

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

> **⚠ Flag — `0x70` collides with v4:** the suggestion to use command `0x70` for the error display puts it in command space that v4 reserves for "Display Predefined Pattern with Stretch (Oneshot)". Either the error display uses a different command code, or the v4 spec should explicitly carve out a slot for the error glyph (e.g., `predefined pattern 0` is the error glyph, indexed via the v4 `0x70` command). Reconcile when the v4 section lands.

> **⚠ Flag — error-display frame ASCII shows 2×2 chars not 5×7:** the source claims "5×7 pixel size per char is typical" but the ASCII glyphs in the example are roughly 5 columns wide × 7 rows tall arranged as 2×2 (4 chars total: P / E / digit / digit). Verify the pixel count by counting the `#` cells in the source glyph; the migration above preserved the source ASCII verbatim — note the asterisks (`\*`) in the source were Markdown escapes for `#`, which I've decoded.

---

## v2 — G6 Panel Protocol v2 (teaser)

_Not yet migrated. Source: Google Doc tab "Panel Version 2 [teaser]", lines 436–621. Adds PSRAM (Pseudo-Static RAM) support for indexed pattern storage, plus diagnostic and reset commands. Will be added in the next sub-pass._

## v3 — G6 Panel Protocol v3 (teaser)

_Not yet migrated. Source: Google Doc tab "Panel Version 3 [teaser]", lines 622–850. Adds gated and persistent display modes (trigger-line synchronization). Will reconcile against [`G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) which has a working prototype on v0.2.1 / v0.3.1 hardware. The `PIXEL` command exists in that prototype but is **not yet adopted into the protocol**; will be flagged as such._

## v4 and beyond

_Not yet migrated. Source: Google Doc tab "Panel Version 4 and beyond", lines 851–1041. Predefined patterns (flash-stored) with stretch multiplier; v5 sketch (additional grayscale levels, color, pattern modifiers)._

## Master command summary (v1–v4)

_Not yet migrated. Source: Google Doc tab "Panel Version Summary", lines 1042–1110._

---

## Open Questions / TBDs (v1)

1. **Stretch semantics underspecified.** Linear scale, gamma-corrected, BCM duty-cycle multiplier? What does stretch=0 mean? How does it interact with the BCM bit-plane refresh? Firmware currently parses stretch but does not apply it (see [Current state § D3](#reconciliation-against-g6_firmware_devel--6944894-run-2026-05-01)). Action: spec the scaling semantics; firmware ticket to wire stretch into the display loop.
2. **D1 — Checksum scope.** Spec says "of the payload"; firmware sums whole message including header + command bytes. Decide which is normative.
3. **D2 — Confirmation message implementation.** Specified, not yet implemented in `g6_firmware_devel`. Decide whether to keep spec as-is (firmware-pending) or reword to defer until firmware lands.
4. **D4 — `COMM_CHECK` visual response.** Spec aspirational ("could light up"); firmware callback empty. Make it normative or drop the sentence.
5. **D5 — LED-mapping layering.** Spec says "host owns LED mapping"; firmware also maps schematic→physical. Confirm two-stage model (host: logical→schematic; firmware: schematic→physical) and rewrite both this spec and [`g6_00-architecture.md`](g6_00-architecture.md).
6. **`COMM_CHECK` panel-side validation policy.** With the canonical sequence pinned, decide whether the panel must verify the bytes or merely echo back the checksum.
7. **Confirmation-message trigger: `>3` or `≥3` bytes?** As written, every valid message would trigger confirmation send (since "at least 3 bytes" applies to every message). Decide once confirmation message is implemented.
8. **"`0x8100`" empty-buffer response endianness.** Could be ambiguous between the 16-bit value `0x8100` packed LE (on-wire `0x00 0x81`) and "header `0x81`, command `0x00`" (on-wire `0x81 0x00`). The CIPO example block strongly suggests the latter. Action: reword as two-byte description.
9. **Checksum algorithm name conflict.** Panel-confirmation checksum is "additive" (sum mod 256); pattern-file checksum is "XOR". Confirm both intentional during [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) reconciliation.
10. **`0x70` command code collides with v4 predefined-pattern command.** Action: pick one (move error display to a different command code, or reserve `predefined-pattern index 0` as the error glyph slot in v4). Reconcile when v4 section lands.
11. **v2 forward note: zero-payload commands.** v2 commands `0x02`, `0x03`, `0x0F` have zero-byte payloads in the source spec but firmware enforces `PAYLOAD_MINIMUM_SIZE = 1`. Decide during v2 migration whether to drop the floor or add a dummy byte.
12. **Worked pixel-mapping example is pinned to panel v0.1 hardware.** Production is now v0.2; v0.3 is in draft. Decide whether [`g6_02-led-mapping.md`](g6_02-led-mapping.md) carries per-revision tables and this example annotates which revision, or if the example gets refreshed for v0.2/v0.3.
13. **Panel error display command-set decision.** The source explicitly defers to `<will@iorodeo.com>`: which errors are most relevant and what command code carries them. Action: track in `g6_firmware_devel` issues / discussions, then update spec.
14. **SPI mode / clock not yet specified.** Firmware uses CPOL=1, CPHA=1 (Mode 3), MSB-first, 30 MHz. Lift these into normative spec text for cross-platform interop.

## Cross-references

- [Source Google Doc, "Panel Version 1" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this section.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — origin of pattern-data row-major MSB-first convention.
- [`g6_00-architecture.md`](g6_00-architecture.md) — system architecture, host/controller/panel responsibilities, endianness.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — full pixel ↔ LED designator table for the worked example above.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — host-side panel-block formatting (parity pre-computation), checksum algorithm.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side framing, panel-set transmission, command dispatch.
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — authoritative v1 panel firmware (reconciliation pending).
