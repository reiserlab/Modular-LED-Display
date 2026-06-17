# G6 — Pattern File Format & Panel Map

Source: G6 panels protocol v1 proposal ([Google Doc `17crYq4s...`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#), tabs "Pattern Format / Panel Map" + "Panel Map proposal", merged).
Status: **v2 canonical** — 18-byte header, written by [`maDisplayTools/g6/g6_save_pattern.m`](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m), round-trip-validated against `webDisplayTools` via [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json). Panel layout lives entirely in the pattern header in v2.

## Current state

- Files **written** today by `maDisplayTools` and `webDisplayTools` use the v2 18-byte header and have a shared bit-level test vector set in [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json).
- Files **read** today: nothing — there's no consumer until a G6 controller firmware ships.

---

## Logical Structure

```
PAT file
 ├─ Header (18 bytes)
 └─ Frames[]
      ├─ Frame magic + index (4 bytes)
      └─ Panel blocks (53 or 203 bytes each, in row-major panel order)
```

## Header Format (v2)

| Bytes (0-indexed) | Field | Type | Value/Range | Description |
| :-: | :-- | :-- | :-- | :-- |
| 0–3 | Magic | ASCII | `"G6PT"` | File type identifier (`0x47 0x36 0x50 0x54`) |
| 4 | `[VVVV][AAAA]` | uint8 | V=2, A=arena_id high 4 bits | Bits 7–4 = format version (= 2); bits 3–0 = upper 4 bits of 6-bit Arena ID |
| 5 | `[AA][OOOOOO]` | uint8 | A=arena_id low 2 bits, O=observer_id 6 bits | Bits 7–6 = lower 2 bits of Arena ID; bits 5–0 = Observer ID (0–63) |
| 6–7 | Frame Count | uint16 LE | 1–65,535 (0 invalid) | Number of frames in file |
| 8 | Row Count | uint8 | 1–255 | Panel rows in arena |
| 9 | Column Count | uint8 | 1–255 | **Full** grid columns in arena (subset installed via panel mask) |
| 10 | `gs_val` | uint8 | 1 = GS2, 2 = GS16 | Pixel encoding throughout file |
| 11–16 | Panel Mask | 6 bytes | bitmask | Which panel positions are physically present (up to 48 panels) |
| 17 | Header CRC | uint8 | 0–255 | CRC-8/AUTOSAR of header bytes 0-16 (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § CRC-8 algorithm). Frame-data integrity is handled separately by per-frame CRC-16 trailers (see § Frame Format). |

### Arena ID and Observer ID

Both are 6-bit, per-generation namespaces resolved by the [maDisplayTools arena registry](../../Generation%206/maDisplayTools/configs/arena_registry/README.md): Arena ID 1–10 lab / 11–50 community / 51–62 user / 63 reserved; Observer ID 1–20 lab / 21–50 community / 51–62 user / 63 reserved. **Observer ID is host-side metadata only — the controller does not interpret it**; it identifies the observer perspective a pattern was rendered for, supporting one pattern × many perspectives in a library.

### Panel Mask (Bytes 11–16)

Compact bitmask indicating which panel positions are physically present:

- **Bit encoding**: `panel_id = row × col_count + col` (row-major, 0-based).
- **Byte/bit mapping**: `byte_index = panel_id // 8`, `bit_index = panel_id % 8` (LSB-first).
- **Bit value**: 1 = panel present, 0 = panel absent.
- **Maximum panels**: 48 (6 bytes × 8 bits).

**Validation:** Controller MUST verify (a) `row_count × col_count ≤ 48`, and (b) the count of bits set in the mask is ≤ `row_count × col_count`. If either check fails, return a "pattern error" to the host.

### Header CRC (Byte 17)

- **Algorithm**: CRC-8/AUTOSAR (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § CRC-8 algorithm for parameters, test vectors, and bit ordering)
- **Scope**: header bytes 0-16 only. Frame-data integrity is the job of the per-frame CRC-16 trailers described in § Frame Format.
- **Result**: single byte (0–255)
- **Usage**: required integrity check on the file header. Controller MUST verify on SD read and refuse to open the file on mismatch. Catches header-level bit-flips (`G6PT` magic + sanity rules already cover gross corruption; this is the bit-level defense for fields like `panel_mask` where a single-bit flip might pass the popcount validation).

## Frame Format

Each frame begins with a 4-byte validation header, followed by all panel blocks for that frame in row-major panel order, then a 2-byte CRC-16 trailer:

```
Frame:
  [Magic: "FR" (0x46 0x52): 2 bytes]
  [Frame Index: uint16 LE: 2 bytes]
  [Panel blocks for all panels, row-major order: panels 0, 1, 2, …, num_panels-1]
  [CRC-16/CCITT: 2 bytes, little-endian]
```

**Frame overhead:** 6 bytes per frame (2 magic + 2 index + 2 CRC).

### Per-frame CRC-16

| Parameter | Value |
| :-- | :-- |
| Polynomial | `0x1021` (CRC-16/CCITT-FALSE) |
| Initial value | `0xFFFF` |
| Input reflection | false |
| Output reflection | false |
| Final XOR | `0x0000` |
| Universal check value | `0x29B1` over the ASCII string `"123456789"` |

**Scope:** `{FR_magic, frame_index, all_panel_blocks}` — everything in the frame except the CRC-16 trailer itself. CRC bytes are appended little-endian (byte 0 = low 8 bits, byte 1 = high 8 bits).

**Detection at G6 frame sizes:**
- GS2 frame (1064 B = 8512 bits): HD=4 — catches all 3-bit errors.
- GS16 frame (4064 B = 32512 bits): HD=4 at the boundary.
- 3×12 GS16 frame (7312 B = 58496 bits): HD=3 above the 32-kbit HD=4 limit.
- 16-bit burst-detection floor across all frame sizes.

**Validation policy:** controller computes CRC-16 as each frame is read; on mismatch, the controller MUST refuse to display that frame and report a frame-level pattern error to the host. Localized detection lets the controller skip/retry a single bad frame instead of binning the whole file.

**Reference implementations:** Linux kernel `lib/crc-ccitt.c`, Boost.CRC `crc_16_ccitt_false_t`, Python `crcmod` (poly `0x11021`).

### Panel ordering

Panels are written in **simple row-major order**: `0, 1, 2, …, num_panels-1`. The G6 controller reads panel blocks sequentially and dispatches them to the appropriate SPI bus per panel ID; parallel-region transmission, if needed, is the controller's job (re-batching CS lines), not the file format's. The earlier panel-set-interleaved proposal from the source spec is dropped as needlessly complex.

## Panel Block Format

Panel blocks are **pre-formatted for SPI transmission** following G6 Panel Protocol v1. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) for complete details.

```
[Header byte: 1 byte]         ← Protocol v1 (0x01 or 0x81 with parity)
[Command byte: 1 byte]        ← 0x10 (GS2) or 0x30 (GS16)
[Pixel data: 50 (GS2) or 200 (GS16) bytes]   ← Row-major, MSB-first packing, origin at bottom-left
[duty_cycle: 1 byte]          ← Brightness scale (0–255); see g6_01 § Duty Cycle Value
```

### Block sizes

- **GS2**: 53 bytes total (1 header + 1 command + 50 pattern + 1 duty_cycle)
- **GS16**: 203 bytes total (1 header + 1 command + 200 pattern + 1 duty_cycle)

The header byte includes parity bit (bit 7) and protocol version (bits 0–6). **Parity ownership rule:** each entity that *sends* a panel block must ensure parity is correct; each entity that *receives* one must validate parity and drop on mismatch. Concretely:

- **Host** pre-computes parity when writing pattern files. The `.pat` file carries pre-formatted, parity-correct panel blocks.
- **Controller** validates parity on each SD-card read (and, in v2, on each PSRAM read) and **recomputes parity** for any panel block it modifies or synthesizes — Modes 4 (closed-loop generated frames), Mode 5 (host-streamed raw pixels sliced into panel blocks), all-on/all-off, error displays, ISP messages. Blocks read intact from SD and forwarded unchanged in Modes 2/3 do not need recomputation, but read-time validation is the recommended defense in depth.
- **Panel** validates parity on every received message and silently drops mismatches (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Message rejection behavior).

### Pixel Data Layout

Pixel data is row-major, MSB-first, with origin at the bottom-left of the panel. **Normative pixel-encoding reference:** [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — round-trip test vectors that webDisplayTools and maDisplayTools both validate against. Implementations of any G6 pattern reader/writer SHOULD validate against this JSON.

```
pixel_num    = row_from_bottom × 20 + col          # 0..399
byte_index   = pixel_num // 8                       # GS2
bit_in_byte  = 7 - (pixel_num % 8)                  # GS2, MSB-first
pixel_value  = (byte >> bit_in_byte) & 1            # GS2

byte_index   = pixel_num // 2                       # GS16
upper_nibble = pixel even (high nibble first)
lower_nibble = pixel odd
```

This matches [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format and the worked example in [`g6_02-led-mapping.md`](g6_02-led-mapping.md) (`pixel[0,0]` = D50, `pixel[0,1]` = D70, `pixel[19,18]` = D340, `pixel[19,19]` = D360).

## File Size Calculation

```
file_size  = 18 + (num_frames × frame_size)
frame_size = 4 + (num_panels × block_size) + 2  # +2 for CRC-16 trailer
num_panels = row_count × col_count              # full grid; subset selected via panel mask
block_size = 53 (GS2) or 203 (GS16)
```

### Worked examples

| Arena | Frames | Mode | Frame size | File size |
|---|---:|---|---:|---:|
| 2×10 (20 panels) | 100 | GS2 | 1,066 B | **106,618 B** (~104 KB) |
| 2×10 (20 panels) | 100 | GS16 | 4,066 B | **406,618 B** (~397 KB) |
| 3×12 (36 panels) | 1,000 | GS16 | 7,314 B | **7,314,018 B** (~6.97 MB) |

## Validation Layers

Five validation mechanisms. The two CRCs are **required** (controller refuses to display on mismatch); the others are catch-all sanity checks:

1. **Pattern magic** (bytes 0–3): `"G6PT"` identifies file type.
2. **Header CRC-8** (byte 17): CRC-8/AUTOSAR over the 17-byte header. Required — catches header-level bit-flips before any frame is read.
3. **Per-frame CRC-16** (2-byte trailer per frame): CRC-16/CCITT over the frame body. Required — localizes corruption to specific frames.
4. **Frame magic** (per frame): `"FR"` + index validates frame boundaries.
5. **Panel parity** (per block): header byte bit 7 detects transmission errors at the panel-block level.

## Controller Operation

### Reading pattern files

1. Read 18-byte header.
2. Validate magic `"G6PT"` and version (= 2 in v2).
3. Extract `frame_count`, `row_count`, `col_count`, `gs_val`, `panel_mask`, Arena ID, Observer ID.
4. Verify `row_count × col_count ≤ 48`.
5. Compute and verify the **header CRC-8** over bytes 0-16; on mismatch, return a "header error" to the host and refuse to open the file.
6. For each frame:
   - Read frame magic `"FR"` and `frame_index` (4 bytes).
   - (Optional) Verify `frame_index` matches the expected sequence value.
   - Read all panel blocks sequentially.
   - Read the 2-byte CRC-16 trailer.
   - Compute and verify **CRC-16/CCITT** over `{FR_magic, frame_index, panel_blocks}`; on mismatch, return a frame-level "pattern error" to the host and skip this frame.
   - For each panel block: (optional) validate parity in header byte, then transmit entire block (53 or 203 bytes) directly to the panel via SPI.

### Transmission

For Modes 2 and 3 (pre-formatted blocks loaded from `.pat` on SD), the controller transmits panel blocks **without modification**: enable chip-select for the panel, clock out the entire panel block (`header + command + pixels + duty_cycle`), repeat for all panels in the panel set, disable chip-select. Pre-formatted blocks eliminate per-frame parity calculation; the controller's job is to validate parity on SD read (defense in depth — see § Header Format above) and pass through.

For Modes 4, 5, and any synthesized panel block (all-on, all-off, error displays, ISP), the controller composes the block and recomputes parity before transmission.

## PC Host Responsibilities (per `maDisplayTools` v2 implementation)

The PC host (MATLAB / Python / web) generates pattern files:

1. **Arena configuration**: define panel layout, orientations, LED mapping. Canonical: `g6_arena_config()` in MATLAB or the `webDisplayTools` equivalent.
2. **Pattern generation**: create full-arena frames as 3D pixel arrays `(total_rows, total_cols, num_frames)` — e.g., `(40, 200, num_frames)` for a 2×10 arena (each panel is 20×20).
3. **Panel block formatting** (per panel, per frame):
   - Compute parity per G6 Panel Protocol v1.
   - Insert header byte (`0x01` or `0x81`) and command byte (`0x10` GS2 / `0x30` GS16).
   - Pack pixels per G6 panel format (row-major, MSB-first, bottom-left origin; flip MATLAB row → panel row via `row_from_bottom = 19 - row`).
   - Append duty_cycle value.
4. **Frame assembly**: prepend `"FR"` magic and frame index to panel blocks; append 2-byte CRC-16/CCITT trailer over `{FR_magic, frame_index, panel_blocks}` little-endian.
5. **Header CRC**: compute **CRC-8/AUTOSAR** (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § CRC-8 algorithm) over header bytes 0-16, store in byte 17.
6. **File writing**: 18-byte header (including byte-17 CRC) followed by all frames (each with trailing CRC-16).

Cross-reference: [`Generation 6/maDisplayTools/docs/patterns.md`](../../Generation%206/maDisplayTools/docs/patterns.md) for user-facing docs on where generated `.pat` files live and how to regenerate reference patterns.

---

## Panel Map (subsumed into pattern header in v2)

In v2 the pattern header carries `row_count`, `col_count`, and the 6-byte panel mask. Region and SPI-bus assignment are looked up by Arena ID from the compiled-in [`g6_arena_configs.h`](g6_arena_configs.h) table; the pattern header carries no region/SPI-bus info.

---

## Cross-references

- [Source Google Doc, "Pattern Format / Panel Map" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [Source Google Doc, "Panel Map proposal" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — merged into this file
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel block format references panel-protocol v1 header byte, command byte, parity rule, payload sizes
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side reading of pattern files; G6 controller doesn't exist yet
- [`g6_05-host-software.md`](g6_05-host-software.md) — host-side workflow
- [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md) — production `arena_10-10` topology (fills the region/SPI gap)
- [Generation 6/maDisplayTools/g6/g6_save_pattern.m](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m) — canonical v2 `.pat` writer
- [Generation 6/maDisplayTools/g6/g6_encode_panel.m](../../Generation%206/maDisplayTools/g6/g6_encode_panel.m) — panel-block encoder
- [Generation 6/maDisplayTools/g6/g6_encoding_reference.json](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — JSON test vectors validated by `maDisplayTools` and `webDisplayTools`
