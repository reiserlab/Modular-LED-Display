# G6 — Panel Protocol

SPI-level protocol between the controller and the panels — message framing, header byte, parity rule, command set, payload formats, panel confirmations, pixel data layout.

The version byte (low 7 bits of byte 0) selects a **feature class**, not an implementation phase:

- **v1** (header `0x01`/`0x81`) — Live SPI display. Pattern arrives on each display command. All four display modes × 2L/16L grayscale, plus COMM_CHECK.
- **v2** (header `0x02`/`0x82`) — PSRAM-backed display. Pattern lives in on-panel PSRAM; display commands reference it by index.
- **v3** (header `0x03`/`0x83`) — Everything else: diagnostics, panel-flash predefined patterns, reserved range for future grayscale/color extensions.
- **ISP** (uses v1 header with opcode block `0xE0`–`0xE4`) — In-system programming for panel firmware updates. Namespace-separated from display protocol.

Display commands across v1/v2/v3 share a **low-nibble-mode encoding**:

- High nibble = pattern type: `0x1x` = 2L Grayscale, `0x3x` = 16L Grayscale, `0x5x` = PSRAM-indexed (implicit `duty_cycle`), `0x6x` = PSRAM-indexed (explicit `duty_cycle` byte), `0x7x` = Predefined pattern.
- Low nibble = mode: `0` = Oneshot, `1` = Persistent, `2` = Triggered, `3` = Gated.

Display commands at the **`Fx` low nibble** are administrative (e.g., `0x3F` = PSRAM-write 16L). Reset commands (`0x0F`, `0x02`, `0x03`) do not follow the encoding.

Source: G6 panels protocol v1 proposal ([Google Doc `17crYq4s...`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)) and [`<will@iorodeo.com>`'s message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit). Implementation status of v1 firmware: see § [Implementation status](#implementation-status) at the end of this document.

---

## v1 — G6 Panel Protocol

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

- 2-level oneshot (command `0x10`), all pixels=0, duty_cycle=0 → header should be `0x01` (1 from version + 1 from command = 2 ones → parity 0)
- 2-level oneshot (command `0x10`), all pixels=0, duty_cycle=1 → header should be `0x81` (1 from version + 1 from command + 1 from duty_cycle = 3 ones → parity 1)
- 16-level oneshot (command `0x30`), all pixels=0, duty_cycle=0 → header should be `0x81` (1 from version + 2 from command = 3 ones → parity 1)

#### CRC-8 algorithm

All single-byte checksums in the G6 protocol family use **CRC-8/AUTOSAR**:

| Parameter | Value |
| :-- | :-- |
| Polynomial | `0x2F` (`x^8 + x^5 + x^3 + x^2 + x + 1`; Koopman notation `0x97`) |
| Initial value | `0xFF` |
| Input reflection | false |
| Output reflection | false |
| Final XOR | `0xFF` |
| Universal check value | `0xDF` over the ASCII string `"123456789"` |

Three sites use this algorithm:

1. **CIPO panel-confirmation checksum** — third byte of the 3-byte confirmation slot, over `{incoming COPI header_byte_with_parity_cleared, cmd_byte, payload_bytes}` of the message being acknowledged.
2. **ISP extended-confirmation checksum** — trailing byte of the ISP confirmation slot, over `{outgoing CIPO header_byte_with_parity_cleared, cmd_byte, response_payload}`.
3. **Pattern-file header checksum** — byte 17 of the `.pat` file header (see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Header CRC). Scope: header bytes 0-16 only. Frame-data integrity is the job of the per-frame CRC-16 trailer specified in `g6_04` § Frame Format (CRC-16/CCITT, HD=4 across our frame sizes, localizes corruption to a specific frame).

**Detection properties at G6 message sizes:**

- HD=4 (catches all 3-bit errors) for data words up to 119 bits.
- HD=2 (catches all 1-bit errors) for longer messages, including the 424-bit GS2 payload, 1624-bit GS16 payload, and multi-MB pattern files. The HD=2 regime above 119 bits is the price of the 1-byte budget; some 2-bit errors slip through (~2/256 probability for random 2-bit patterns).
- Catches all burst errors up to 8 bits long at every message size.
- Strictly stronger than sum-mod-256 or XOR for burst errors.

**Bit and byte ordering.** SPI is MSB-first on the wire (§ SPI framing). CRC-8/AUTOSAR has `refin=false`, meaning each input byte is fed MSB-first into the LFSR. The two conventions align — the bit stream the CRC processes is the bit stream that hits the wire. **No bit reversal needed.** Bytes are fed in transmission order (byte 0 first). The CRC byte itself is NOT included in the CRC computation.

**Construction order for the 3-byte confirmation slot** (resolves CRC/parity dependency):

1. Compute CRC over `{version_byte_with_parity_bit_cleared, cmd_byte, payload_bytes}` of the message being acknowledged.
2. Place `{header_byte_template_with_parity_cleared, cmd_byte, crc_byte}` in the confirmation slot.
3. Compute parity over the resulting 3-byte slot (count 1-bits across all 24 bits except the parity bit) and set the parity bit in the header.

The same procedure applies to the ISP extended-confirmation slot over its longer response payload.

**Sentinel discriminator.** Confirmation-slot sentinels use the cmd byte as the discriminator: `cmd=0x00` for the empty-buffer sentinel and `cmd=0xFF` for the COMM_CHECK-fail sentinel. The CRC byte in those slots is the literal `0x00` (convention: no real payload to checksum), NOT a computed CRC over `{version, sentinel_cmd}`. **Validators MUST branch on the cmd byte before treating byte 2 as a CRC** — a valid message can naturally produce CRC `0x00`, so the checksum value alone cannot distinguish a sentinel from a real message.

**Protocol-specific test vectors** (final values pinned in [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) once the encoders are regenerated):

| Input bytes (hex) | Description | CRC |
| :-- | :-- | :-- |
| `01 10 00…00 00` (53 bytes: hdr + cmd + 50× zero pixels + duty=0) | 2L Oneshot all-zero | `0xC6` |
| `01 30 00…00 00` (203 bytes: hdr + cmd + 200× zero pixels + duty=0) | 16L Oneshot all-zero | `0x6D` |
| `01 01 00 01 02 … C7` (202 bytes: COMM_CHECK canonical) | COMM_CHECK | `0x8B` |

Implementers MUST verify their CRC implementation against both the universal `"123456789"` → `0xDF` check value and at least one protocol-specific vector before integration.

**Reference implementations:** Linux kernel `lib/crc8.c`, Boost.CRC, Python `crcmod`. RP2354 implementation can use a 256-byte lookup table in flash; computational cost is negligible at SPI traffic rates.

#### Duty Cycle Value

The `duty_cycle` value is a single byte (0–255) that scales the brightness of all pixels in a pattern by **modulating the BCM bit-plane ON-time durations** (not the pixel values themselves). Effective per-bit-plane ON time = `base_T × duty_cycle / 255`, where `base_T` is the BCM base time (3.0 µs in v1 panel firmware). `duty_cycle = 0` → all bit-planes have zero ON time → display off. `duty_cycle = 255` → unchanged from base BCM weights.

**Brightness is linear in `duty_cycle` only when the scan period is fixed.** The panel firmware enforces a fixed scan period (1 kHz refresh by default), so the LED-off portion of the duty cycle scales correctly. Without this enforcement, low-duty-cycle scans run back-to-back and the perceived brightness ratio collapses. Achievable per-LED duty-cycle ratio between `duty_cycle=1` and `duty_cycle=255`: ~260× for Gray_2 patterns; ~1360× for Gray_16 patterns where intensity and duty cycle combine (theoretical max 15 × 255 = 3825× compressed by the PIO 5-cycle overhead floor at the lowest values).

Properties:
- **Per-frame uniform brightness control** without rewriting pixel values.
- **High dynamic range** via low-bit patterns + per-frame duty cycle (e.g., a 2-level pattern displayed across consecutive frames with stepped `duty_cycle` values yields a richer effective brightness range than the pattern's two intensity levels alone).
- **Cheap on the panel** (one multiplier on the BCM weight array per frame; no per-pixel multiply).

#### Endianness and Bit Packing

little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

#### SPI framing

Each message SHALL be transmitted as exactly one SPI transaction, bounded by chip-select (CS). The message begins on CS falling edge and ends on CS rising edge. The controller and panel SHALL reset their message parsers on CS rising edge.

**SPI mode**: CPOL=1, CPHA=1 (SPI Mode 3), MSB-first. **Clock**: panels accept up to 30 MHz (firmware default in [`reiserlab/LED-Display_G6_Firmware_Panel/panel/src/constants.cpp`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel/blob/feat/v1-stage1-protocol/panel/src/constants.cpp)). Cross-platform implementations SHOULD configure the same.

A message from the controller to the panel is defined by the "protocol commands". The panels return the header and command from the previously received message followed by an 8-bit CRC-8 checksum (per § CRC-8 algorithm).

The controller SHALL clock exactly the number of bytes required by the command for that protocol version, but at least 3 bytes. Invalid messages are ignored and don't trigger a panel update.

**Message rejection behavior:**

If any validation fails (unsupported protocol version, unsupported command, incorrect message length, parity failure), the panel SHALL discard the message.

### Commands

v1 covers nine display commands (four modes × two grayscale resolutions, plus COMM_CHECK). All carry the pattern data on-the-wire — the panel does not need to retain anything between display calls.

| Header (parity) | Header (version) | Cmd | Payload bytes | Total bytes | Name |
| :-: | :-: | :-: | :-: | :-: | :-- |
| 0\|1 | 1 | `0x01` | 200 | 202 | `COMM_CHECK` |
| 0\|1 | 1 | `0x10` | 51 (50 + duty_cycle) | 53 | `DISP_2LVL_ONESHOT` |
| 0\|1 | 1 | `0x11` | 51 (50 + duty_cycle) | 53 | `DISP_2LVL_PERSIST` |
| 0\|1 | 1 | `0x12` | 51 (50 + duty_cycle) | 53 | `DISP_2LVL_TRIGGERED` |
| 0\|1 | 1 | `0x13` | 51 (50 + duty_cycle) | 53 | `DISP_2LVL_GATED` |
| 0\|1 | 1 | `0x30` | 201 (200 + duty_cycle) | 203 | `DISP_16LVL_ONESHOT` |
| 0\|1 | 1 | `0x31` | 201 (200 + duty_cycle) | 203 | `DISP_16LVL_PERSIST` |
| 0\|1 | 1 | `0x32` | 201 (200 + duty_cycle) | 203 | `DISP_16LVL_TRIGGERED` |
| 0\|1 | 1 | `0x33` | 201 (200 + duty_cycle) | 203 | `DISP_16LVL_GATED` |

All four modes share the same payload shape per pattern type — only the mode (low nibble of cmd byte) differs.

**Default operating model: controller-driven, one-shot per command.** The expected production model is that the controller continuously streams commands to the panel — one command per intended stimulus event. Under this model, **Oneshot (`0x?0`), Triggered (`0x?2`), and Gated (`0x?3`) are all one-shot semantically**: a command arms the panel for one display unit (one scan / one trigger consumption / one gate cycle — see per-mode descriptions for precise definitions), after which the panel goes dark/idle until a new command arrives.

**Persistent (`0x?1`) is the special-case exception** — the panel keeps refreshing the loaded pattern indefinitely without further commands. Useful for static backgrounds, single-panel bench tests, and low-SPI-bandwidth scenarios, but not the canonical production case.

The Triggered and Gated commands require the EINT trigger line; without an active EINT source they're functionally equivalent to a no-op load (pattern accepted, no display until EINT activity).

#### `0x01` — Communication check

Send a known message; the panel silently validates it (byte-for-byte against the canonical sequence) and reports failure via the standard confirmation-message slot. No visual response — visual diagnostics live in the dedicated [Panel Error Display](#optional-panel-error-display) feature.

**Payload**: 200 bytes of known values — the byte sequence `0x00, 0x01, 0x02, …, 0xC7` (i.e., `payload[i] = i` for `i ∈ [0, 200)`).

**Example**:

`[0x01] [0x01] [0x00] [0x01] [0x02] … [0xC7]`

**Validation**: the panel MUST verify that the received payload matches the expected canonical sequence byte-for-byte. On mismatch, the panel reports a COMM_CHECK failure via the standard confirmation-message slot (in addition to the normal length/parity checks). This catches single-bit errors that pass parity, sequence-shift faults, and dropped-byte SPI faults — the whole point of having a known canonical payload.

#### `0x10` — Display 2-Level Grayscale (Oneshot)

Displays a 2-level (1-bit per pixel) pattern **once** — a single BCM scan, then the panel idles dark until the next display command.

**Payload**: 50 bytes of pattern data & 1 byte duty_cycle value

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x01] [0x10] [pixel data: 50 bytes] [duty_cycle]`

#### `0x11` — Display 2-Level Grayscale (Persistent)

Same payload shape as `0x10`; mode differs. Pattern is loaded into the display engine and **scanned continuously** until a new display command replaces it. Use for static backgrounds, single-panel bench tests, and low-SPI-bandwidth scenarios. For frame-by-frame deterministic stimulus delivery, prefer `0x10` Oneshot streamed by the controller.

**Example**:

`[0x01] [0x11] [pixel data: 50 bytes] [duty_cycle]`

#### `0x12` — Display 2-Level Grayscale (Triggered)

Same payload shape as `0x10`. **One-shot Triggered semantics**: pattern is loaded by this command, then fired by EINT rising edges. Each rising edge fires **one row × all 4 BCM bit-planes for that row** (the panel scans row-by-row; 20 row drivers, 20 column drivers — see [`g6_02-led-mapping.md`](g6_02-led-mapping.md) § Hardware Reference).

**Consumption rule**: 20 EINT rising edges complete one full frame, after which the panel returns to dark/idle. The controller re-arms with a new `0x12` command for each subsequent stimulus burst.

**Overwrite-on-new-pattern**: if a new display command arrives before the 20 EINT edges complete, the new pattern overwrites the current one and the internal row counter resets to 0. Intermediate patterns are silently discarded. If the controller pushes Triggered patterns faster than 20 edges arrive between commands, the older pattern's rows never fire — this is a controller-side monitoring responsibility (no panel-side warning today).

**Between-edge state**: the panel is naturally dark between EINT rising edges. Each edge fires one row × all 4 bit-planes briefly, then the row goes inactive. If EINT stops mid-burst (e.g., the scanner halts before delivering all 20 edges), the panel is dark from that point until either more edges arrive or a new pattern arms a fresh row-0 fire. No stuck-pixel state — no timeout fallback is required.

**Example**: `[0x01] [0x12] [pixel data: 50 bytes] [duty_cycle]`

Use case: sub-frame synchronization with external scanning systems (two-photon microscope resonant scanners, etc.). Trigger-to-LED latency measured at 865 ± 17 ns at 8 kHz on prototype hardware; will be remeasured on production arena hardware.

#### `0x13` — Display 2-Level Grayscale (Gated)

Same payload shape as `0x10`. **One-shot Gated semantics**: pattern processing follows the normal Oneshot model (one scan per command, queue drain-to-latest as in `0x10`). The EINT signal acts as a **global output-enable gate**, operating independently of the command/pattern stream:

- **EINT HIGH** → LED output enabled: the panel displays the most recent queued pattern at the standard BCM scan rate (continuous refresh while HIGH, since the controller is still streaming Oneshot commands to keep new frames coming in).
- **EINT LOW** → LED output disabled: panel goes dark. The pattern queue keeps building as new `0x13` (or `0x10`/`0x11`/etc.) commands arrive; they're processed but not visibly displayed.

The controller is expected to stream patterns at its normal cadence regardless of gate state — the gate is a downstream output mask, not a flow-control signal. When the gate transitions LOW→HIGH → the latest pattern that's been queued during the LOW interval becomes visible; when the gate transitions HIGH→LOW → output is masked off immediately.

**Gate timing details:**

- **Mid-scan HIGH→LOW transition**: the gate is taken strictly. The panel stops scanning and stops displaying at the moment of the transition (LEDs go dark within one bit-plane interval). Partially-scanned rows are abandoned; the next LOW→HIGH transition starts fresh with whatever pattern is then queue-latest.
- **Initial state**: if EINT is HIGH when the first `0x13` command arrives but no prior pattern has been processed, the panel displays nothing until the first pattern is processed. The gate cannot reveal a pattern that doesn't exist yet.
- **Stale queue on LOW→HIGH transition**: the queue drains to the latest pattern at the moment of the transition. Older patterns that were enqueued during the LOW window are discarded (with `frames_skipped_` incremented). This matches the existing drain-to-latest semantics in v1's Oneshot path.

**Example**: `[0x01] [0x13] [pixel data: 50 bytes] [duty_cycle]`

Use case: window-gated display for behavior-rig event windows. The rig's event-window controller drives EINT; the panel controller streams patterns at its own cadence; the animal sees patterns only during event windows. The two control streams are decoupled, which simplifies the controller-side software and makes the event-window timing precise (driven by the rig clock, not the SPI clock).

#### `0x30` — Display 16-Level Grayscale (Oneshot)

Displays a 16-level (4-bit per pixel) pattern **once** — single BCM scan, then idle.

**Payload**: 200 bytes of pattern data & 1 byte duty_cycle value

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x01] [0x30] [pixel data: 200 bytes] [duty_cycle]`

#### `0x31` — Display 16-Level Grayscale (Persistent)

Same payload shape as `0x30`; pattern scanned continuously until next command. Same trade-off vs. Oneshot as `0x11` vs `0x10`.

**Example**:

`[0x01] [0x31] [pixel data: 200 bytes] [duty_cycle]`

#### `0x32` — Display 16-Level Grayscale (Triggered)

Same payload shape as `0x30`. **Semantics per `0x12`**: one row × all 4 BCM bit-planes per EINT rising edge; 20 edges = one frame consumed → panel returns to dark; new pattern mid-consumption overwrites.

**Example**: `[0x01] [0x32] [pixel data: 200 bytes] [duty_cycle]`

#### `0x33` — Display 16-Level Grayscale (Gated)

Same payload shape as `0x30`. **Semantics per `0x13`**: pattern processing follows normal Oneshot; EINT is a global output-enable mask. Gate HIGH → LEDs visible; Gate LOW → panel dark (queue still building); mid-scan transition stops scanning immediately.

**Example**: `[0x01] [0x33] [pixel data: 200 bytes] [duty_cycle]`

### Confirmation message

On CS falling edge, a panel returns a **3-byte confirmation slot** describing the previously received command:

```
[byte 0: header_with_parity]  [byte 1: cmd_or_sentinel]  [byte 2: checksum]
```

When the panel receives a valid command, it stores the version (from the incoming header), the command byte, and an 8-bit CRC-8 checksum (per § CRC-8 algorithm) over the incoming message bytes excluding the CRC byte itself. The header byte in the confirmation slot echoes the **incoming protocol version** (`0x01` for V1; in future, `0x02` for V2) with the parity bit **recomputed** per the construction-order rule in § CRC-8 algorithm.

For invalid commands (parity failure, length mismatch, unsupported protocol version, unknown command, etc.) the buffer is **not updated** — the panel continues to return whatever was in the slot before. This preserves the spec invariant "for invalid commands no information is stored."

**Every valid panel-protocol message MUST be at least 3 bytes** (header + cmd + ≥ 1 payload byte). Commands that would otherwise have a zero-byte payload are padded with one reserved byte (`0x0F` Reset PSRAM, `0x02` Query diagnostics, `0x03` Reset diagnostic stats — all carry a 1-byte ignored payload). The minimum-3-byte rule guarantees that every CS-active window clocks out all 3 bytes of the prior confirmation, so confirmations cannot accumulate or be silently dropped between commands.

If a controller violates the ≥ 3 byte rule (e.g., asserts CS for fewer than 3 byte windows after sending a too-short message), the panel rejects the short message on length-check; the prior confirmation slot stays armed and is delivered on the next valid CS-active window.

**4-state encoding** (normative; matches firmware behavior):

| Slave state | Bytes returned on next CIPO |
| :-- | :-- |
| No prior message (boot, or last confirmation already drained) | `{0x81, 0x00, 0x00}` — parity-correct empty-buffer sentinel (header parity = 1 ⊕ cmd=0 ⊕ checksum=0 ⇒ header byte `0x81`) |
| Last message valid + COMM_CHECK passed | `{header_with_parity, cmd, checksum}` |
| Last message was COMM_CHECK and byte-mismatched | `{header_with_parity, 0xFF, 0x00}` — `0xFF` is the **reserved COMM_CHECK-fail sentinel** (see Master command summary); checksum is `0x00` because the slot has no real payload to checksum (the message was rejected). Header parity recomputed against `{version, 0xFF, 0x00}`. |
| Last message invalid for any other reason (parity, length, unsupported, unknown cmd) | Slot unchanged — controller observes the previous confirmation. |

**`cmd = 0xFF` is reserved panel-side** for the COMM_CHECK-fail sentinel and MUST NOT be issued by a controller. See Master command summary § Reserved confirmation values.

Algorithm details and test vectors in § CRC-8 algorithm above. Note: pattern-file frame integrity uses **CRC-16/CCITT per-frame** (`g6_04` § Frame Format), distinct from this wire-level CRC-8; only the file header at `g6_04` byte 17 shares this CRC-8 algorithm.

**Examples:**

```
COPI: [0x01] [0x10] [pixel data 1: 50 bytes]  [duty_cycle 1]      // first valid message ever (2L Oneshot)
CIPO: [0x81] [0x00] [0x00]                                      // boot empty-buffer sentinel
…
COPI: [0x01] [0x30] [pixel data 2: 200 bytes] [duty_cycle 2]      // valid 16L Oneshot
CIPO: [0x_1] [0x10] [checksum-of-message-1]                     // echo of message 1
…
COPI: [0x01] [0x31] [pixel data 3: 200 bytes] [duty_cycle 3]      // valid 16L Persistent
CIPO: [0x_1] [0x30] [checksum-of-message-2]                     // echo of message 2
…
COPI: [0x01] [0x01] [byte-corrupted COMM_CHECK payload]        // COMM_CHECK with one byte flipped
CIPO: [0x_1] [0x31] [checksum-of-message-3]                     // echo of message 3
…
COPI: [0x01] [0x11] [pixel data 4: 50 bytes] [duty_cycle 4]       // valid 2L Persistent
CIPO: [0x_1] [0xFF] [0x00]                                      // COMM_CHECK FAIL sentinel from prior frame
```

`[0x_1]` is shorthand for "either `0x01` or `0x81`" — the actual parity bit is recomputed for each 3-byte confirmation message.

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

- `pixel[0,0]` corresponds to LED D50 — 2-level: byte_index=0, bit_in_byte=7, bit 0; 16-level: byte_index=0, even, bits 4…7
- `pixel[0,1]` to LED D70 — 2-level: byte_index=0, bit_in_byte=6, bit 1; 16-level: byte_index=0, odd, bits 0…3
- `pixel[19,18]` to LED D340 — 2-level: byte_index=49, bit_in_byte=1, bit 398; 16-level: byte_index=199, even, bits 4…7
- `pixel[19,19]` to LED D360 — 2-level: byte_index=49, bit_in_byte=0, bit 399; 16-level: byte_index=199, odd, bits 0…3

For the full v0.1 mapping table (400 rows), see [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv); v0.2 / v0.3 mappings pending KiCad source extraction (see [`g6_02-led-mapping.md`](g6_02-led-mapping.md) Open Questions).

### Optional: Panel Error Display

While not essential for implementing the v1 commands described here, we expect it will be useful for G6 Panels to implement simple visual error indicators, similar to G3 implementation, to aid troubleshooting during development (and usage). When an error is detected, the panel displays a small predefined pattern representing an error index. The dedicated v1-namespace opcode for this is **`0xC2`** (alongside the existing panel-utility opcodes `0xC0` COMM_CHECK and `0xC1` Diagnostic — though the diagnostic-spec opcodes are tentative; see v2 § Query diagnostics). The error glyph itself can be a panel-firmware-baked predefined pattern, or composed by the controller and sent via `0x30` SetFrame as a v1-firmware-only fallback. When v4 ships, **predefined-pattern index 0 is reserved as the canonical error-glyph slot**, accessed via the v4 `0x70` Display Predefined Pattern command — resolves the v1 `0xC2`/v4 `0x70` namespace pressure and avoids a second opcode dedicated to error display.

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

Suggested errors to surface: unknown/uninterpretable command, payload-length mismatch, checksum/parity failure, data timeout. Keep displayed for ≥ 500 ms; receive-and-ignore incoming commands during the display window. Not required for v1 compliance.

---

## v2 — G6 Panel Protocol v2 — PSRAM-backed display

Version 2 adds **PSRAM** (Pseudo-Static RAM) for on-panel pattern storage. The controller pre-uploads patterns to indexed slots, then displays them via short index-only commands. This trades upload cycles for runtime SPI bandwidth — useful for closed-loop stimulus libraries with hundreds of pre-computed frames where the on-the-wire cost of `0x30`/`0x31` 16-Level commands (203 bytes each) becomes prohibitive at high frame rates.

For Protocol v2, the version bits are `0b0000010`, giving possible header values `0x02` (parity 0) / `0x82` (parity 1).

**Compatibility:** A v2 panel MUST accept all v1 commands (header `0x01`/`0x81`). A v1 panel MAY reject v2 commands; the controller is expected to query panel capabilities (mechanism TBD with v2 design) before issuing them.

> **⚠ Status.** v2 PSRAM ops have open semantic questions (PSRAM addressing model, behavior on out-of-range index, power-loss-mid-write, slot collision with v3 predefined patterns) that must be resolved before firmware implementation begins. The opcode table is a working baseline.

### v2 Commands

Opcode encoding follows the low-nibble-mode rule (`0`=Oneshot, `1`=Persistent, `2`=Triggered, `3`=Gated). PSRAM-display opcodes come in two flavors: `0x5x` uses the duty_cycle value stored at PSRAM-write time (implicit), and `0x6x` carries an explicit per-display duty_cycle byte (lets the controller display the same stored pattern at multiple brightness levels without re-uploading).

- `0x0F` — Reset PSRAM (clear user-stored patterns)
- `0x3F` — Write 16-Level Grayscale pattern to PSRAM
- `0x50` / `0x51` / `0x52` / `0x53` — Display PSRAM Index in Oneshot / Persistent / Triggered / Gated (duty_cycle implicit, from PSRAM-write time)
- `0x60` / `0x61` / `0x62` / `0x63` — Display PSRAM Index with explicit duty_cycle in Oneshot / Persistent / Triggered / Gated

**Removed from earlier drafts:** 2-Level PSRAM write (`0x1F`). v2 supports PSRAM storage for 16-Level only. 2-Level live patterns are 53 bytes each over SPI — bandwidth-efficient enough that PSRAM storage isn't worth the design complexity.

#### `0x0F` — Reset PSRAM

Clears all user-stored patterns from PSRAM (preserves predefined patterns under v3 `0x70`–`0x73`, if those use a separate flash region — see v3).

**Payload**: 1 byte (reserved; transmit as `0x00`, panel ignores). Padding ensures every message is ≥ 3 bytes so the CIPO confirmation slot drains in each CS-active window (see § Confirmation message).

**Example**: `[0x02] [0x0F] [0x00]`

#### `0x3F` — Write 16-Level Grayscale to PSRAM

Writes a 16-level (4-bit per pixel) pattern to PSRAM for later retrieval by `0x5x` (implicit duty_cycle) or `0x6x` (explicit duty_cycle) Display PSRAM Index commands.

**Payload**: 204 bytes (3 idx + 200 pattern + 1 duty_cycle)

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit little-endian integer)
- **Bytes 5–204**: Pattern data (200 bytes, 20×20 × 4bpp row-major MSB-first)
- **Byte 205**: duty_cycle value (stored alongside the pattern; used by `0x5x` display commands; ignored by `0x6x` since those carry their own duty_cycle byte)

**Example**:

`[0x02] [0x3F] [index: 3 bytes] [pixel data: 200 bytes] [duty_cycle]`

> **⚠ Open question — PSRAM addressing semantics.** Is the 24-bit index a byte address, a fixed-size slot index, a record handle, or a typed reference? What's the maximum allowed index? What happens on out-of-range, on collision with predefined-pattern slots (v3 `0x70`–`0x73` live in a separate flash region, but the addressing convention should be aligned across both), on power-loss mid-write? These need a half-page subsection before v2 firmware.

#### `0x50` / `0x51` / `0x52` / `0x53` — Display PSRAM Index (implicit duty_cycle)

Display a previously-stored PSRAM pattern by index, in one of the four display modes. The `duty_cycle` value used is **the one stored alongside the pattern** via `0x3F`. Mode semantics follow the v1 default (Oneshot / Triggered / Gated all one-shot, Persistent the special case) — see v1 § Display Mode Summary and the open questions under v1 `0x12` / `0x13`.

| Cmd | Mode | Notes |
|:-:|:--|:--|
| `0x50` | Oneshot                | one scan, then dark |
| `0x51` | Persistent             | continuous refresh until next command (special-case exception) |
| `0x52` | Triggered (one-shot)   | per-edge firing per v1 `0x12`: 20 EINT edges = one frame, then dark; new pattern overwrites mid-consumption |
| `0x53` | Gated (one-shot)       | output-enable model per v1 `0x13`: HIGH = LEDs visible, LOW = dark; queue keeps building during LOW |

**Payload**: 3 bytes — PSRAM index (24-bit little-endian).

**Example**:

```
[0x02] [0x50] [0x00 0x00 0x00]      // display PSRAM index 0 once at stored duty_cycle
[0x02] [0x51] [0x01 0x00 0x00]      // display PSRAM index 1 persistently at stored duty_cycle
```

#### `0x60` / `0x61` / `0x62` / `0x63` — Display PSRAM Index with explicit duty_cycle

Display a previously-stored PSRAM pattern by index, in one of the four display modes, **using a per-display duty_cycle byte** (overriding the stored duty_cycle). Lets the controller show the same stored pattern at multiple brightness levels without re-uploading.

| Cmd | Mode | Notes |
|:-:|:--|:--|
| `0x60` | Oneshot                | one scan, then dark |
| `0x61` | Persistent             | continuous refresh until next command (special case) |
| `0x62` | Triggered (one-shot)   | semantics per v1 `0x12`: 20 EINT edges = one frame, then dark |
| `0x63` | Gated (one-shot)       | semantics per v1 `0x13`: output-enable gate, queue keeps building during LOW |

**Payload**: 4 bytes — PSRAM index (3 bytes, 24-bit little-endian) + duty_cycle (1 byte).

**Example**:

```
[0x02] [0x60] [0x00 0x00 0x00] [0x40]    // display PSRAM index 0 once at duty_cycle=64
[0x02] [0x60] [0x00 0x00 0x00] [0xFF]    // same pattern again at full brightness
```

### Typical v2 Workflow

1. **Pre-load patterns into PSRAM** (16-Level only):

   ```
   [0x02] [0x3F] [0x00 0x00 0x00] [pattern 0 data: 200 bytes] [0xC0]   // index 0, duty_cycle 192
   [0x02] [0x3F] [0x01 0x00 0x00] [pattern 1 data: 200 bytes] [0x05]   // index 1, duty_cycle 5
   [0x02] [0x3F] [0x02 0x00 0x00] [pattern 2 data: 200 bytes] [0x20]   // index 2, duty_cycle 32
   ```

2. **Display patterns by index in any mode (implicit duty_cycle)**:

   ```
   [0x02] [0x50] [0x00 0x00 0x00]    // index 0, Oneshot, duty_cycle from PSRAM (192)
   [0x02] [0x51] [0x01 0x00 0x00]    // index 1, Persistent, duty_cycle from PSRAM (5)
   [0x02] [0x53] [0x02 0x00 0x00]    // index 2, Gated (refresh while EINT HIGH), duty_cycle from PSRAM (32)
   ```

3. **Or display with explicit duty_cycle override**:

   ```
   [0x02] [0x60] [0x00 0x00 0x00] [0x40]   // index 0, Oneshot at duty_cycle=64 (overrides stored 192)
   [0x02] [0x61] [0x00 0x00 0x00] [0xFF]   // same index 0, now Persistent at full duty_cycle
   ```

(Example headers use `[0x02]` throughout; the actual parity bit depends on the elided pattern payloads — recompute when concrete patterns are chosen for a worked example.)

## v3 — G6 Panel Protocol v3 — Diagnostics, predefined patterns, future feature classes

Version 3 covers everything that isn't live-SPI display (v1) or PSRAM-backed display (v2): **diagnostics**, **predefined patterns** stored in panel flash, and a placeholder for future feature classes (additional grayscale levels, color support).

For Protocol v3, the version bits are `0b0000011`, giving possible header values `0x03` (parity 0) / `0x83` (parity 1).

**Compatibility:** A v3 panel MUST accept all v1 + v2 commands.

> **⚠ Status.** v3 feature classes are pre-design: diagnostics needs a data-shape spec (counters, error codes, response carrier); predefined patterns needs a flash-region design (slot count, factory vs. user-installable, programming mechanism — likely reuses ISP primitives over a different region).

### v3 Commands

- `0x02` — Query diagnostics (data shape TBD)
- `0x03` — Reset diagnostic stats
- `0x70` / `0x71` / `0x72` / `0x73` — Display Predefined Pattern in Oneshot / Persistent / Triggered / Gated

(Future feature classes — additional grayscale levels via `0x20`/`0x40`/`0x80` pattern-type nibbles, color support — are out-of-scope for this revision of the spec; see § Open Questions / TBDs.)

#### `0x02` — Query diagnostics

Get diagnostics from the panel. Current candidates from `<will@iorodeo.com>`: counts of bad bytes, short messages, parity failures, queue drops, or other error rates. Statistics could be collected from `0x01` COMM_CHECK responses or from all messages since the last reset.

**Payload**: 1 byte (reserved; transmit as `0x00`, panel ignores). Padding ensures every message is ≥ 3 bytes — see § Confirmation message.

**Example**: `[0x03] [0x02] [0x00]`

> **⚠ Flag — diagnostic data shape unspecified.** Spec the diagnostic record format (counters, error codes, response carrier slot) before this command becomes implementable. The CIPO confirmation slot is 3 bytes — diagnostic data exceeds that, so a separate response mechanism is needed (extended slot? streamed over CIPO with explicit length? mailbox via PSRAM?).

#### `0x03` — Reset diagnostic stats

Reset the diagnostic counter(s).

**Payload**: 1 byte (reserved; transmit as `0x00`, panel ignores). Padding ensures every message is ≥ 3 bytes — see § Confirmation message.

**Example**: `[0x83] [0x03] [0x00]`

#### `0x70` / `0x71` / `0x72` / `0x73` — Display Predefined Pattern (mode in low nibble)

Display a panel-flash-stored pattern by index, in one of the four display modes. Predefined patterns are stored in a dedicated flash region (separate from PSRAM) and survive power-cycle. Use cases: error glyphs (slot 0 reserved as canonical error-display glyph), test patterns, calibration patterns, factory-loaded stimuli. Mode semantics follow the v1 default (Oneshot / Triggered / Gated all one-shot, Persistent the special case) — see v1 § Display Mode Summary and the open questions under v1 `0x12` / `0x13`.

| Cmd | Mode | Notes |
|:-:|:--|:--|
| `0x70` | Oneshot                | one scan of the predefined pattern, then dark |
| `0x71` | Persistent             | continuous refresh until next command (special-case exception) |
| `0x72` | Triggered (one-shot)   | per-edge firing per v1 `0x12`: 20 EINT edges = one frame, then dark |
| `0x73` | Gated (one-shot)       | output-enable gate per v1 `0x13`: HIGH = LEDs visible, LOW = dark |

**Payload**: 3 bytes — predefined-pattern index (24-bit little-endian) + 1 byte duty_cycle.

**Example**:

```
[0x03] [0x70] [0x00 0x00 0x00] [0xC0]    // display predefined pattern 0 (error glyph) at duty_cycle=192, Oneshot
[0x03] [0x71] [0x01 0x00 0x00] [0xFF]    // display predefined pattern 1 (test pattern) Persistent at full
```

> **⚠ Open question — Predefined pattern catalog.** Slot count, factory vs. user-installable, programming mechanism (likely reuses the ISP primitives over a different flash region), 2L vs. 16L pattern storage, what happens on display of an unprogrammed slot — all TBD before v3 firmware.

### Future feature classes (v3 reservation, no opcodes yet)

The remaining `0x20` / `0x40` / `0x80` high-nibble pattern-type ranges are reserved for future grayscale extensions (4-level, 256-level, etc.) using the same low-nibble-mode encoding. Color support, if ever added, would likely claim an additional high-nibble range. No opcode-level detail today.

## In-System Programming (ISP)

Status: **Draft — design-review needed**. ISP commands live in the v1 namespace (header `0x01`/`0x81`); they reflash the running panel image one panel at a time via SPI, selected by chip-select. Reserved opcode block `0xE0–0xEF`. The framing and safety design below has open issues (see § ISP open questions); do not treat as a stable wire surface yet.

### Opcode table

| Cmd | Payload (COPI) | Name | Response payload (CIPO; see § ISP confirmation format below) |
| :-: | :-- | :-- | :-- |
| `0xE0` | 16-byte sentinel `"G6PANELISPENTER\0"` + 4-byte unlock token | `ISP_ENTER` | 17 bytes: 4-byte `session_nonce` + 4-byte `flash_size` + 2-byte `page_size` + 2-byte `sector_size` + 4-byte `app_crc32` + 1-byte `bootrom_version` |
| `0xE1` | 3-byte sector index + 4-byte session nonce | `ISP_ERASE_SECTOR` | 0 bytes (ack only via header + cmd + checksum) |
| `0xE2` | 3-byte page index + 4-byte session nonce + 256-byte page data + 4-byte page CRC32 over the 256 data bytes only | `ISP_WRITE_PAGE` | 0 bytes (ack only) |
| `0xE3` | 3-byte start address + 3-byte length + 4-byte session nonce + 4-byte expected CRC32 | `ISP_VERIFY_CRC` | 5 bytes: 1-byte status (`0x00` = pass, `0x01` = mismatch) + 4-byte panel-computed CRC32 |
| `0xE4` | 4-byte session nonce + 1-byte mode (`0x00` = boot new app; `0x01` = stay in factory bootrom) | `ISP_EXIT_REBOOT` | No response (panel resets) |

### ISP confirmation format

ISP messages use an **extended confirmation slot** that adds an opcode-specific response payload between the echoed command and the 8-bit CRC-8 checksum (per § CRC-8 algorithm, including the construction-order rule for the parity bit). Format on CIPO during the *next* ISP-armed CS-active window:

```
[header (parity recomputed)] [echoed_cmd] [response_payload_N_bytes] [8-bit checksum]
```

where `N` depends on `echoed_cmd` (see opcode table, "Response payload" column). The 8-bit CRC-8 checksum covers the CIPO message bytes excluding the CRC byte itself (header + cmd + response_payload). This differs from the standard 3-byte confirmation slot (§ Confirmation message above): standard panel-protocol messages keep the 3-byte form; only ISP opcodes use this extended form.

For `ISP_ENTER` specifically, the response cannot piggyback on a preceding command (no prior ISP command exists). The controller therefore clocks out exactly `1 + 1 + 17 + 1 = 20` bytes on the SAME `ISP_ENTER` transaction: the panel computes its response during the COPI phase (after parsing payload), then drives MISO during the trailing CIPO byte windows. CS stays asserted for the full 20-byte exchange. All subsequent ISP commands follow the standard "response piggybacks on next ISP command" pattern.

### State machine

Idle → `ISP_ENTER` → ISP-armed → (`ERASE_SECTOR` × N → `WRITE_PAGE` × N → `VERIFY_CRC` → `EXIT_REBOOT`) → reset. Any non-ISP message in ISP-armed aborts ISP and re-enables normal display.

The session nonce returned by `ISP_ENTER` is required on every subsequent ISP opcode (`0xE1`, `0xE2`, `0xE3`, `0xE4`) — replay protection against bus noise re-presenting an earlier write payload. Panel rejects ISP commands whose payload nonce doesn't match the active session nonce.

Validation is two-layered: per-page CRC32 over the 256 data bytes only (catches bus errors mid-upload) and whole-image CRC32 via `ISP_VERIFY_CRC` (catches state-machine bugs).

### Brick recovery

Single firmware image, no bootloader split. If in-firmware ISP gets corrupted mid-flash, recovery is out of band via BOOTSEL-on-USB at the panel (see [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md)). Controller-side workflow + SD layout in [`g6_03-controller.md`](g6_03-controller.md) § Panel firmware update (ISP).

### ISP open questions (design-review)

1. **Atomic image staging.** No A/B slot, no "stage entire image before erase" requirement, no rollback path. A read error after `ISP_ERASE_SECTOR` leaves a partially programmed panel.
2. **Firmware-blob authenticity.** Per-page + whole-image CRC32 catch accidents, not adversarial or wrong-target images. No signature, no board-compatibility tag, no anti-rollback policy.
3. **ISP-in-v1 vs separate protocol version.** Putting flash-write opcodes in v1 means every future v2/v3/v4 panel firmware must continue to support them. A dedicated ISP protocol (with explicit `BOOT_TO_ISP` transition) would isolate dangerous operations and survive version evolution better. Current choice favors bring-up simplicity; revisit before stable release.
4. **Mixed-firmware arenas on partial-flash failure.** Sequential one-at-a-time ISP avoids bus-wide damage but creates mixed-version arenas if a mid-arena panel fails. Audit before experiments.

## Master command summary

Two tables: **Must implement** (v1 firmware ship target) and **Specced, deferred** (v1 Triggered/Gated, all v2, all v3, and ISP).

### Must implement (v1)

| Byte 0 (header) | Byte 1 (cmd) | Bytes 2+ (payload) | Description | Status |
| :--: | :--: | :-- | :-- | :-- |
| `0x01` / `0x81` | `0x01` | 200 bytes | Communication check | implemented |
| `0x01` / `0x81` | `0x10` | 51 bytes (50 pattern + duty_cycle) | Display 2-Level Grayscale (Oneshot) | implemented |
| `0x01` / `0x81` | `0x11` | 51 bytes (50 pattern + duty_cycle) | Display 2-Level Grayscale (Persistent) | implemented |
| `0x01` / `0x81` | `0x30` | 201 bytes (200 pattern + duty_cycle) | Display 16-Level Grayscale (Oneshot) | implemented |
| `0x01` / `0x81` | `0x31` | 201 bytes (200 pattern + duty_cycle) | Display 16-Level Grayscale (Persistent) | implemented |

### Specced, deferred (v1 Triggered/Gated, all v2, all v3, ISP)

v1 Triggered + Gated are prototyped (Triggered measured at 865 ± 17 ns trigger-to-LED latency at 8 kHz on prototype hardware). v2 PSRAM and v3 diagnostics + predefined patterns have open semantic questions that must be resolved before implementation. ISP is a draft pending design review.

| Byte 0 (header) | Byte 1 (cmd) | Bytes 2+ (payload) | Description | Version | Review notes |
| :--: | :--: | :-- | :-- | :--: | :-- |
| `0x01` / `0x81` | `0x12` | 51 bytes (50 pattern + duty_cycle) | Display 2-Level Grayscale (Triggered) | v1 | prototyped |
| `0x01` / `0x81` | `0x13` | 51 bytes (50 pattern + duty_cycle) | Display 2-Level Grayscale (Gated) | v1 | prototyped |
| `0x01` / `0x81` | `0x32` | 201 bytes (200 pattern + duty_cycle) | Display 16-Level Grayscale (Triggered) | v1 | prototyped |
| `0x01` / `0x81` | `0x33` | 201 bytes (200 pattern + duty_cycle) | Display 16-Level Grayscale (Gated) | v1 | prototyped |
| `0x02` / `0x82` | `0x0F` | 1 byte (reserved) | Reset PSRAM (clear user patterns) | v2 | |
| `0x02` / `0x82` | `0x3F` | 3 idx + 200 pattern + duty_cycle | Write 16-Level Grayscale to PSRAM | v2 | ⚠ index semantics open |
| `0x02` / `0x82` | `0x50` | 3 idx | Display PSRAM Index, implicit duty_cycle (Oneshot) | v2 | |
| `0x02` / `0x82` | `0x51` | 3 idx | Display PSRAM Index, implicit duty_cycle (Persistent) | v2 | |
| `0x02` / `0x82` | `0x52` | 3 idx | Display PSRAM Index, implicit duty_cycle (Triggered) | v2 | |
| `0x02` / `0x82` | `0x53` | 3 idx | Display PSRAM Index, implicit duty_cycle (Gated) | v2 | |
| `0x02` / `0x82` | `0x60` | 3 idx + duty_cycle | Display PSRAM Index, explicit duty_cycle (Oneshot) | v2 | |
| `0x02` / `0x82` | `0x61` | 3 idx + duty_cycle | Display PSRAM Index, explicit duty_cycle (Persistent) | v2 | |
| `0x02` / `0x82` | `0x62` | 3 idx + duty_cycle | Display PSRAM Index, explicit duty_cycle (Triggered) | v2 | |
| `0x02` / `0x82` | `0x63` | 3 idx + duty_cycle | Display PSRAM Index, explicit duty_cycle (Gated) | v2 | |
| `0x03` / `0x83` | `0x02` | 1 byte (reserved) | Query diagnostic stats | v3 | ⚠ data shape unspecified |
| `0x03` / `0x83` | `0x03` | 1 byte (reserved) | Reset diagnostic stats | v3 | |
| `0x03` / `0x83` | `0x70` | 3 idx + duty_cycle | Display Predefined Pattern (Oneshot) | v3 | ⚠ pattern catalog TBD |
| `0x03` / `0x83` | `0x71` | 3 idx + duty_cycle | Display Predefined Pattern (Persistent) | v3 | ⚠ pattern catalog TBD |
| `0x03` / `0x83` | `0x72` | 3 idx + duty_cycle | Display Predefined Pattern (Triggered) | v3 | ⚠ pattern catalog TBD |
| `0x03` / `0x83` | `0x73` | 3 idx + duty_cycle | Display Predefined Pattern (Gated) | v3 | ⚠ pattern catalog TBD |
| `0x01` / `0x81` | `0xE0` | 16-byte sentinel + 4-byte unlock token | `ISP_ENTER` (begin in-system programming session) | v1 (ISP) | draft — design review needed |
| `0x01` / `0x81` | `0xE1` | 3 sector + 4 nonce | `ISP_ERASE_SECTOR` | v1 (ISP) | draft |
| `0x01` / `0x81` | `0xE2` | 3 page + 4 nonce + 256 data + 4 CRC32 | `ISP_WRITE_PAGE` | v1 (ISP) | draft |
| `0x01` / `0x81` | `0xE3` | 3 start + 3 length + 4 nonce + 4 expected CRC32 | `ISP_VERIFY_CRC` | v1 (ISP) | draft |
| `0x01` / `0x81` | `0xE4` | 4 nonce + 1 mode | `ISP_EXIT_REBOOT` | v1 (ISP) | draft |

ISP opcodes use an extended confirmation slot — see § In-System Programming.

**Notes on table columns:**

- **Byte 0 (Header)**: The two values shown (e.g., `0x01` / `0x81`) differ only in the MSB parity bit. The actual value depends on the parity of the entire message.
- **Protocol Version**: encoded in bits 0–6 of byte 0 — `0x01` = v1 live-SPI display, `0x02` = v2 PSRAM-backed display, `0x03` = v3 diagnostics + predefined patterns + future.
- **Cmd encoding** (display commands): high nibble = pattern type (`1`=2L Grayscale, `3`=16L Grayscale, `5`=PSRAM-indexed [implicit `duty_cycle`], `6`=PSRAM-indexed [explicit `duty_cycle`], `7`=Predefined pattern); low nibble = mode (`0`=Oneshot, `1`=Persistent, `2`=Triggered, `3`=Gated). PSRAM-write (`0x3F`) uses low nibble `F` as the "storage op, not a display mode" marker. Reset commands (`0x0F`, `0x02`, `0x03`) are administrative and don't follow the encoding.
- **Index**: 24-bit little-endian integer (3 bytes) specifying PSRAM or predefined-pattern location.
- **`duty_cycle`**: 8-bit value (0–255) for brightness control (see § Duty Cycle Value).
- **Pattern Data**:
  - 2-level: 50 bytes (1 bit per pixel, 20×20 = 400 pixels)
  - 16-level: 200 bytes (4 bits per pixel, 20×20 = 400 pixels)

### Reserved confirmation values (panel → controller)

These values appear **only in the 3-byte CIPO confirmation slot** (see § Confirmation message) and MUST NOT be issued as controller → panel commands. They are reserved across all protocol versions.

| Cmd byte | Slot encoding | Meaning |
| :--: | :-- | :-- |
| `0xFF` | `{header_with_parity, 0xFF, 0x00}` | **COMM_CHECK fail sentinel.** Panel returns this when the most recent valid COMM_CHECK message had a byte-level mismatch against the canonical payload (`payload[i] != i` for some `i ∈ [0, 200)`). Header parity is recomputed over `{version, 0xFF, 0x00}`; checksum byte is `0x00` since the offending message had no valid checksum to echo. |

### Display Mode Summary

Modes are encoded in the low nibble of the command byte (`0`=Oneshot, `1`=Persistent, `2`=Triggered, `3`=Gated). The default operating model is **controller-driven, one-shot per command** — Oneshot, Triggered, and Gated all "consume" the pattern on one display unit (one scan, one trigger event, or one gate cycle respectively) and return the panel to dark/idle until the next command. Persistent is the **special-case exception** where the panel keeps refreshing without further commands.

| Low nibble | Mode | Behavior | Use Case | Status |
| :--: | :-- | :-- | :-- | :-- |
| `0` | **Oneshot** | One BCM scan on receipt, then dark | Frame-by-frame deterministic control (canonical production case); controller streams one command per stimulus | **v1, implemented** in `feat/v1-stage2-bcm` |
| `1` | **Persistent** (special case) | Continuous refresh until next display command | Static backgrounds, single-panel bench tests, low-SPI-bandwidth scenarios | **v1, implemented** in `feat/v1-stage2-bcm` |
| `2` | **Triggered** (one-shot) | Pattern loaded; each EINT rising edge fires one row × 4 bit-planes; **20 edges = one frame consumed → dark**. New pattern mid-consumption overwrites (controller-side responsibility to monitor; warning instrumentation deferred). | Sub-frame synchronization (two-photon microscopy resonant scanners, etc.) | specced; prototyped |
| `3` | **Gated** (one-shot) | Pattern processing follows normal Oneshot (one scan per command, queue drain-to-latest); EINT is a **global output-enable gate**: HIGH → LEDs visible, LOW → panel dark with queue still building. | Window-gated display for behavior-rig event windows (gate driven by rig clock, decoupled from controller streaming) | v1 specced, prototyped |

### Protocol Evolution

- **v1 — Live SPI display**: All four display modes (Oneshot, Persistent, Triggered, Gated) for both 2-level and 16-level grayscale; pattern data on every command. Includes COMM_CHECK and the CIPO 3-byte confirmation slot. Implemented in `reiserlab/LED-Display_G6_Firmware_Panel @ feat/v1-stage1-protocol`: COMM_CHECK + Oneshot + Persistent. Triggered + Gated specced + prototyped in test firmware; not in v1 production firmware yet.
- **v2 — PSRAM-backed display**: 16-Level pattern storage in panel PSRAM (`0x3F` write, `0x0F` reset); indexed display in all four modes, with two duty_cycle flavors (`0x5x` implicit / `0x6x` explicit). Specced; not implementing now (subject to continued review on PSRAM addressing semantics).
- **v3 — Everything else**: Diagnostics (`0x02`/`0x03`); panel-flash Predefined Patterns (`0x7x`); placeholder for future grayscale-level / color extensions. Specced; not implementing now.

---

## Open Questions / TBDs

1. **Worked pixel-mapping example pinned to panel v0.1 hardware.** Per-revision LED designator tables pending KiCad source extraction (see [`g6_02-led-mapping.md`](g6_02-led-mapping.md) Open Q #2).
2. **Panel error display command-set decision.** Which errors are most relevant and what command code carries them within the `0xC2`/predefined-pattern-0 framework.
3. **v3 trigger edge polarity** (from test rig). Firmware code expects rising edge but AD3 + Ch2 captures show LED fires on the **falling edge** of W1 — likely hardware ringing (±2.5 V overshoot). Hypothesis in `G6_Panels_Test_Firmware/single_led/SESSION_2026-04-24_PIOFULL_AD3.md`; not yet fixed.

## Implementation status

v1 panel firmware: [`reiserlab/LED-Display_G6_Firmware_Panel`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel).

| Spec item | Status |
| :-- | :-- |
| Message framing, header byte, parity rule, CIPO 3-byte confirmation slot (4-state encoding, `0xFF` COMM_CHECK-fail sentinel) | **CIPO checksum: CRC-8/AUTOSAR (firmware update pending).** Other framing items: implemented, not yet stacked-panel bench-validated. |
| `0x01` COMM_CHECK (byte-for-byte validation against canonical payload) | implemented |
| `0x10` / `0x11` 2L Oneshot + Persistent, `0x30` / `0x31` 16L Oneshot + Persistent | implemented |
| Duty cycle (BCM-via-PIO with fixed-period scan, default 1 kHz refresh) | implemented |
| `0x12` / `0x13` / `0x32` / `0x33` Triggered + Gated | specced; prototyped on separate test firmware; not in production firmware yet |
| All v2, v3, and ISP commands | specced; not implemented |

## Cross-references

- [Source Google Doc, "Panel Version 1" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this section.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — origin of pattern-data row-major MSB-first convention.
- [`g6_00-architecture.md`](g6_00-architecture.md) — system architecture, host/controller/panel responsibilities, endianness.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — panel hardware reference (v0.2 + v0.3) + LED mapping; v0.1 mapping CSV in [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv).
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — host-side panel-block formatting (parity pre-computation), checksum algorithm.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side framing, panel-set transmission, command dispatch.
- [`reiserlab/LED-Display_G6_Firmware_Panel`](https://github.com/reiserlab/LED-Display_G6_Firmware_Panel) — active v1 panel firmware (Reiser Lab fork).
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — baseline upstream of the fork; reference only.
- [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — prototype / characterization rig (BCM, gating, trigger latency).
