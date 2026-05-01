# G6 — Panel Protocol

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Panel Version 1" → "Panel Version 4 and beyond" + "Panel Version Summary"; lines 61–1110) · Last reviewed: 2026-05-01 by mreiser
Status: **§ v1 = Specified (with multiple flagged inconsistencies — reconcile vs `iorodeo/g6_firmware_devel` next)** · § v2/v3/v4/v5 + master summary = _not yet migrated, in subsequent passes_

This file holds the SPI-level protocol between the controller and the panels — message scaffolding, header byte, parity rule, the per-version command set, payload formats, panel confirmations, and pixel data layout. Versions are staged in chronological order (v1 first because it sets all the conventions and is the only version with deployable firmware in flight).

## Current state

- **v1 protocol implementation:** [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — Will Dickson's panel firmware development repo, last push 2026-02-12. Reconciliation of every byte / opcode / parity rule / confirmation message in this v1 section against that code is the next step in the doc-by-doc loop, before this file is signed off.
- **v3 prototype evidence:** [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — debug/test code that proved BCM-via-PIO, gating, all-off, and the experimental `PIXEL` command on G6 panels v0.2.1 / v0.3.1. Cited in the v3 section (when it lands) as "prototyped", **not** as a v1 reference and **not** as a deployable implementation.

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

The parity bit (MSB of byte 0) is set to make the total count of '1' bits in the entire message (excluding the parity bit itself) either even or odd. Specifically, it counts all '1' bits in:

- Bits 0–6 of byte 0 (version bits)
- All bits in byte 1 (command)
- All bits in bytes 2–n (payload)

The parity bit is set such that this count modulo 2 equals the parity bit value, providing basic parity-based error detection.

> **⚠ Flag — parity rule ambiguity:** "either even or odd" in the prose is ambiguous on its own; the next sentence anchors it to "count modulo 2 equals the parity bit value" (i.e., `parity = count_of_ones(version || command || payload) mod 2`). Under that rule, parity examples 1 and 2 below are wrong (see next flag). Either the rule needs rewording or the examples need to be regenerated. Decide once we read what `g6_firmware_devel` actually computes.

**Parity Examples:**

- 2-level oneshot (command `0x10`), all pixels=0, stretch=0 → header should be `0x81` (1 from command → parity 1)
- 2-level oneshot (command `0x10`), all pixels=0, stretch=1 → header should be `0x01` (1 from command, 1 from stretch = 2 → 0 parity)
- 16-level oneshot (command `0x30`), all pixels=0, stretch=0 → header should be `0x81` (1 + 1 from command → 0 parity)

> **⚠ Flag — parity examples contradict the stated rule (and each other):** working through each example using the rule literally as stated above (`parity = popcount(version_bits || command || payload) mod 2`):
> - Ex 1 (`0x10`, zeros, stretch=0): popcount = 1 (version `0b0000001`) + 1 (`0x10`) + 0 = **2** → parity = 0 → header `0x01`. Source says `0x81`.
> - Ex 2 (`0x10`, zeros, stretch=1): popcount = 1 + 1 + 1 = **3** → parity = 1 → header `0x81`. Source says `0x01`.
> - Ex 3 (`0x30`, zeros, stretch=0): popcount = 1 + 2 (`0x30 = 0b00110000`) + 0 = **3** → parity = 1 → header `0x81`. Source says `0x81`. ✓ on the header value, but the parenthetical "(1 + 1 from command → 0 parity)" is wrong twice over — `0x30` has two 1-bits, not one, and "0 parity" contradicts the claimed header `0x81`.
>
> No single convention — even-parity, odd-parity, or "parity = count mod 2" — reproduces all three examples. The contradiction must be resolved against the firmware. Likely fixes: (a) Examples 1 and 2 had their headers swapped during transcription, or (b) the rule wording is wrong. Action: read `iorodeo/g6_firmware_devel` parity computation and rewrite either the rule or the examples (or both) to be self-consistent.

### Stretch Value

The stretch value is a single byte (0-255) that scales the brightness of all pixels in a pattern. This provides:

- **Dynamic brightness control**: Adjust pattern intensity without changing the pattern
- **High dynamic range**: Use low-bit patterns (e.g., 4-level) with stretch to achieve effective higher dynamic ranges
- **Efficient modulation**: Change brightness rapidly for temporal experiments
- **Adaptive stimuli**: Match brightness to experimental conditions or subject sensitivity

> **⚠ Flag — stretch semantics underspecified:** "scales the brightness of all pixels" is intuitive but not normative. Open questions: is the scaling linear (`displayed = pixel × stretch / 255`), gamma-corrected, or a BCM duty-cycle multiplier? Does stretch=0 mean "off" (multiplicative interpretation) or does it have some floor? How does stretch interact with the BCM bit-plane refresh in the v3 prototype? Reconcile against `g6_firmware_devel` (v1 baseline) and `G6_Panels_Test_Firmware` (BCM characterization).

### Endianess and Bit Packing

little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

> **⚠ Flag — typo + redundancy:** "Endianess" → "Endianness" (same typo as in [`g6_00-architecture.md`](g6_00-architecture.md)). Also, this rule is already stated in `g6_00-architecture.md`; consider removing the duplicate in Phase 2 consolidation, or keep as a per-section reminder if helpful.

### SPI framing

Each message SHALL be transmitted as exactly one SPI transaction, bounded by chip-select (CS). The message begins on CS falling edge and ends on CS rising edge. The controller and panel SHALL reset its message parsers on CS rising edge.

A message from the controller to the panel is defined by the "protocol commands". The panels return the header and command from the previously received message followed by an 8-bit checksum.

The controller SHALL clock exactly the number of bytes required by the command for that protocol version, but at least 3 bytes. Invalid messages are ignored and don't trigger a panel update.

**Message rejection behavior:**

If any validation fails (unsupported protocol version, unsupported command, incorrect message length, parity failure), the panel SHALL discard the message.

> **⚠ Flag — "at least 3 bytes" minimum is incompletely specified:** Why 3? The shortest defined v1 message is 3 bytes total (header + command + 0 payload), but no v1 command is exactly 3 bytes; the shortest is `0x01` COMM_CHECK at 202 bytes and `0x10` at 53 bytes. Question: does "at least 3" describe a minimum SPI clocking length the *controller* enforces (so that the panel always sees enough bytes to decode header + command and decide whether to discard), or is this a forward-looking constraint for v2+ commands like `0x02` / `0x03` / `0x0F` (which have zero-byte payloads)? Reconcile against `g6_firmware_devel`.

> **⚠ Flag — "controller and panel SHALL reset its message parsers" subject-verb mismatch:** typo, should be "shall reset their message parsers" (plural). Trivial.

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

**Payload**: 200 bytes of known values

**Example**:

`[0x01] [0x01] [known sequence: 200 bytes]`

> **⚠ Flag — `COMM_CHECK` "known sequence" is underspecified:** the spec says "200 bytes of known values" without specifying what values. Without a fixed pattern, the panel cannot validate the comm check is "correct" — it can only confirm that the message arrived without parity/length failure. Open questions: (a) Is there a canonical test pattern (e.g., `0x00, 0x01, 0x02, … 0xC7`)? (b) Does the panel just echo back the checksum, or does it verify against an expected sequence? Reconcile against `g6_firmware_devel`.

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

To make this error visible — we will need to keep them displayed for a short interval, at least 500 ms. This could be done with a dedicated error message routine that repeats the same pattern. During this time the controller should receive but ignore incoming commands so that the error can be noticed.

This feature is not required for protocol v1 compliance but provides a quick, hardware-level diagnostic without needing serial debug output.

> **⚠ Flag — "controller should receive but ignore" subject error:** the sentence should say "the *panel* should receive but ignore incoming commands" (the panel is what's busy displaying the error glyph). Trivial typo.

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

1. **Parity rule vs. examples — fundamental contradiction.** The literal rule in § Parity Calculation says `parity = popcount(version || command || payload) mod 2`, but examples 1 and 2 produce headers that don't match the rule. No single parity convention reconciles all three examples. Action: reconcile against `iorodeo/g6_firmware_devel` parity computation; rewrite either the rule or examples 1 and 2 (most likely the latter — looks like the headers got swapped during transcription).
2. **Stretch semantics underspecified.** Linear scale, gamma-corrected, BCM duty-cycle multiplier? What does stretch=0 mean? How does it interact with the BCM bit-plane refresh? Action: reconcile against firmware (v1 baseline) and BCM prototype (`G6_Panels_Test_Firmware`).
3. **`COMM_CHECK` "known sequence" is undefined.** Which 200 bytes? Is the panel expected to verify them, or just round-trip the checksum? Action: reconcile against `g6_firmware_devel`.
4. **"At least 3 bytes" SPI clocking minimum.** Justification unclear since the shortest v1 command is 53 bytes. Likely a forward-looking rule for v2+ zero-payload commands, but worth confirming. Action: reconcile against `g6_firmware_devel`.
5. **Confirmation-message trigger: `>3` or `≥3` bytes?** As written, every valid message would trigger confirmation send (since "at least 3 bytes" applies to every message). Action: reconcile against firmware.
6. **"`0x8100`" empty-buffer response endianness.** Could be ambiguous between the 16-bit value `0x8100` packed LE (so on-wire `0x00 0x81`) and "header `0x81`, command `0x00`" (on-wire `0x81 0x00`). The CIPO example block strongly suggests the latter. Action: reword as two-byte description.
7. **Checksum algorithm name conflict.** Panel-confirmation checksum is "additive" (sum mod 256); pattern-file checksum is "XOR". Confirm both intentional.
8. **Error-display command code `0x70` collides with v4 predefined-pattern command.** Action: pick one (move error display to a different command code, or reserve `predefined-pattern index 0` as the error glyph slot in v4). Reconcile when v4 section lands.
9. **Worked pixel-mapping example is pinned to panel v0.1 hardware.** Production is now v0.2; v0.3 is in draft. Decide whether `g6_02-led-mapping.md` carries per-revision tables and this example annotates which revision, or if the example gets refreshed for v0.2/v0.3.
10. **Subject/verb / typo cleanups deferred to consolidation:** "controller and panel SHALL reset its message parsers" → "their"; "controller should receive but ignore" (re: error display) → "panel should receive…"; "Endianess" → "Endianness".
11. **Panel error display command-set decision.** The source explicitly defers to `<will@iorodeo.com>`: which errors are most relevant and what command code carries them. Action: track in `g6_firmware_devel` issues / discussions, then update spec.

## Cross-references

- [Source Google Doc, "Panel Version 1" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this section.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — origin of pattern-data row-major MSB-first convention.
- [`g6_00-architecture.md`](g6_00-architecture.md) — system architecture, host/controller/panel responsibilities, endianness.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — full pixel ↔ LED designator table for the worked example above.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — host-side panel-block formatting (parity pre-computation), checksum algorithm.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side framing, panel-set transmission, command dispatch.
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — authoritative v1 panel firmware (reconciliation pending).
