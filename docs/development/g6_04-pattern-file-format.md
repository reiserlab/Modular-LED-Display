# G6 — Pattern File Format & Panel Map

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Pattern Format / Panel Map" lines 1865–2162 + "Panel Map proposal" lines 2169–2407, merged) · Last reviewed: 2026-05-01 by mreiser
Status: **§ Pattern File Format = Specified (v1, from spec)** · **§ Panel Map proposal = Specified (from spec)** · Reconciliation against `maDisplayTools` / `webDisplayTools` implementation pending in next commit

This file holds the on-disk file format for G6 pattern (`.pat`) files plus the Panel Map proposal. The two source tabs are merged into one dev doc because the user noted that the standalone panel-map structure has been folded into the pattern header in current implementation — patterns and panel layout live in one file, not two. Source content is preserved verbatim below; the v1 → v2 reconciliation lands in a follow-up commit.

## Current state

- **v1 pattern file format implementation:** to be reconciled against `Generation 6/maDisplayTools/g6/g6_save_pattern.m` and `Generation 6/webDisplayTools/` in a follow-up commit. The user has noted that the implementation is at "v2 patterns" — i.e., the on-disk format has evolved past the v1 spec captured here.
- **G6 controller firmware** that reads `.pat` files: not yet built (`iorodeo/g6_firmware_devel` is panel firmware, not controller firmware; the G4.1 slim controller reads G4 patterns, not G6).

# G6 Pattern File Format — v1 specification

## Overview

G6 pattern files (`.pat`) store LED display patterns for the G6 arena system. Files contain a fixed-length header followed by frame data with validation structures. The PC host generates pattern files with pre-computed parity and checksums. The controller reads frames from SD card and transmits panel blocks directly to panels via SPI.

**Key design principles:**

- Fixed-length header for deterministic parsing
- Ready-to-transmit panel blocks (no controller repacking)
- Multiple validation layers (**all optional in v1**)
- All multi-byte integers are **little-endian**

## Logical Structure

```
PAT file
 ├─ Header (17 bytes)
 └─ Frames[]
      ├─ Frame magic + index (4 bytes)
      └─ PanelSets[]
           └─ PanelBlocks[] (53 or 203 bytes each)
```

## Header Format (17 bytes)

| Bytes | Field | Type | Value/Range | Description |
| :-: | :-- | :-- | :-- | :-- |
| 0–3 | Magic | ASCII | `"G6PT"` | File type identifier (`0x47 0x36 0x50 0x54`) |
| 4 | Version | uint8 | 1 | Format version |
| 5 | Flags | uint8 | See below | Grayscale mode + reserved bits |
| 6–7 | Frame Count | uint16 LE | 0–65 535 | Number of frames in file |
| 8 | Row Count | uint8 | 1–255 | Panel rows in arena |
| 9 | Column count | uint8 | 1–255 | Panel columns in arena |
| 10 | Checksum | uint8 | 0–255 | XOR of all frame data bytes |
| 11–16 | Panel Mask | 6 bytes | — | Bitmask for up to 48 panels |

### Flags Byte (Byte 5)

| Bits | Field | Values | Description |
| :-: | :-- | :-- | :-- |
| 0–2 | `gs_code` | 1 = GS2 (1bpp), 2 = GS16 (4bpp), 3–7 = Reserved | Pixel encoding throughout file |
| 3–7 | Reserved | Must be 0 | Reserved for future use |

### Panel Mask (Bytes 11–16)

Compact bitmask indicating which panel positions are physically present:

- **Bit encoding**: `panel_id = row × col_count + col` (row-major, 0-based).
- **Byte/bit mapping**: `byte_index = panel_id // 8`, `bit_index = panel_id % 8` (LSB-first).
- **Bit value**: 1 = panel present, 0 = panel absent.
- **Maximum panels**: 48 (6 bytes × 8 bits).

**Validation:** Controller MUST verify:

1. `row_count × col_count ≤ 48`
2. Number of panels present in mask ≤ `row_count × col_count`

If either check fails, return a "pattern error" with failed-verification details to PC Host.

### Checksum (Byte 10)

- **Algorithm**: byte-wise XOR
- **Computation**: `checksum = byte[0] ^ byte[1] ^ byte[2] ^ … ^ byte[n]`
- **Scope**: All frame data (from first frame's `"FR"` magic through last panel's stretch byte)
- **Result**: single byte (0–255)
- **Usage**: optional validation in v1; enables future error detection

## Frame Format

### Frame Structure

Each frame begins with validation magic, followed by panel blocks in panel set order:

```
Frame:
  [Magic: "FR" (0x46 0x52): 2 bytes]
  [Frame Index: uint16 LE: 2 bytes]
  [Panel blocks for all panels in panel set order]
```

**Frame overhead**: 4 bytes per frame.

### Panel Set Ordering

Panels are grouped into **panel sets** for efficient SPI transmission. Each panel set contains panels with the same row and column offset within their region.

**Example (2×10 arena, 2 regions)**:

- Panel set 0: `{0, 5}` (row 0, col 0 in each region)
- Panel set 1: `{1, 6}` (row 0, col 1 in each region)
- Panel set 2: `{2, 7}` (row 0, col 2 in each region)
- …
- Panel set 10: `{10, 15}` (row 1, col 0 in each region)

**Pattern data order**: `0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 15, 11, 16, …`

**Rationale**: Enables controller to enable chip-select (by row) and transmit to all regions in parallel.

## Panel Block Format

Panel blocks are **pre-formatted for SPI transmission** following G6 Panel Protocol v1. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) for complete details.

### Block Structure Summary

```
[Header byte: 1 byte]         ← Protocol v1 (0x01 or 0x81 with parity)
[Command byte: 1 byte]        ← 0x10 (GS2) or 0x30 (GS16)
[Pixel data: 50 or 200 bytes] ← Row-major, MSB-first packing
[Stretch: 1 byte]             ← Brightness/timing (0–255)
```

### Block Sizes

- **GS2**: 53 bytes total
- **GS16**: 203 bytes total

**Key points:**

- Header byte includes parity bit (bit 7) and protocol version (bits 0–6).
- PC host pre-computes parity when generating pattern file.
- Controller transmits blocks directly to panels without modification.
- Controller may optionally validate parity in v1.

## File Size Calculation

### Formula

```
file_size = 17 + (num_frames × frame_size)
```

Where:

```
frame_size = 4 + (num_panels × block_size)
num_panels = row_count × col_count
block_size = 53 (GS2) or 203 (GS16)
```

### Examples

**2×10 arena (20 panels), 100 frames, GS2**:

- Frame: `4 + (20 × 53) = 1,064 bytes`
- Total: `17 + (100 × 1,064) = 106,417 bytes` (~104 KB)

**2×10 arena (20 panels), 100 frames, GS16**:

- Frame: `4 + (20 × 203) = 4,064 bytes`
- Total: `17 + (100 × 4,064) = 406,417 bytes` (~397 KB)

**3×12 arena (36 panels), 1000 frames, GS16**:

- Frame: `4 + (36 × 203) = 7,312 bytes`
- Total: `17 + (1000 × 7,312) = 7,312,017 bytes` (~6.97 MB)

## Validation Layers

Four independent validation mechanisms (all **optional** in v1):

1. **Pattern magic** (bytes 0–3): `"G6PT"` identifies file type.
2. **Checksum** (byte 10): XOR of all frame data detects corruption.
3. **Frame magic** (per frame): `"FR"` + index validates frame boundaries.
4. **Panel parity** (per block): header byte bit 7 detects transmission errors.

**v1 implementation note**: validation structures are present in the format, but enforcement is optional.

## Controller Operation

### Reading Pattern Files

1. Read header (17 bytes).
2. Validate magic `"G6PT"` and version = 1.
3. Extract `frame_count`, `row_count`, `col_count`, `gs_code`, `panel_mask`.
4. Verify `row_count × col_count ≤ 48`.
5. (Optional) Compute and verify checksum over frame data.
6. For each frame:
   - Read frame magic `"FR"` and `frame_index` (4 bytes).
   - (Optional) Verify `frame_index` matches the expected value.
   - Read all panel blocks sequentially.
   - For each panel block:
     - (Optional) Validate parity in header byte.
     - Transmit entire block (53 or 203 bytes) directly to panel via SPI.

### Transmission

Controller transmits panel blocks **without modification**:

- Enable chip-select for panel row.
- Clock out entire panel block (`header + command + pixels + stretch`).
- Repeat for all panels in panel set.
- Disable chip-select.

**Rationale**: pre-formatted blocks eliminate controller overhead for parity calculation and message assembly.

## PC Host Responsibilities

The PC host (MATLAB / Python) generates pattern files:

1. **Arena configuration**: define panel layout, orientations, LED mapping.
2. **Pattern generation**: create full-arena frames (`row_count × col_count` panels).
3. **Panel block formatting**:
   - Compute parity for each panel block per G6 Panel Protocol v1.
   - Insert header byte (`0x01` or `0x81`) and command byte.
   - Pack pixels per G6 panel format (see Panel Protocol spec).
   - Append stretch value.
4. **Frame assembly**: prepend `"FR"` magic and frame index to panel blocks.
5. **Checksum**: compute XOR over all frame data, store in header byte 10.
6. **File writing**: write 17-byte header followed by all frames.

## Change Summary from Earlier Proposals

1. **Fixed 17-byte header** (removed variable-length `header_len` field and reserved bytes)
2. **Flags simplified** (only `gs_code` used; stretch and CRC flags removed)
3. **Single-byte XOR checksum** (simple, adequate for SD card validation)
4. **Frame magic mandatory** (validation at frame boundaries)
5. **Panel block magic removed** (blocks are SPI-ready, no extra overhead)
6. **Pre-computed parity** (PC host calculates, controller optionally validates)
7. **48-panel maximum** (fixed 6-byte mask, validation required)
8. **Pattern data always complete** (includes all panels regardless of mask; controller uses mask to determine transmission targets)

---

# Panel Map proposal

This proposal defines a **minimal, host-defined panel map** that describes the logical arena layout while remaining compatible with the G4 wiring model, and supporting efficient pattern playback from SD card PAT files.

The panel map is the **single source of truth** for arena geometry. The controller derives the number of panels, rows, and columns from the panel map and **must not configure these parameters independently** elsewhere in the firmware.

Panels are arranged in a regular 2D grid and indexed **row-major with 0-based row and column indices**. A panel's **ID is implicit** and determined by its (row, column) location. Panels are assigned to **regions (SPI buses)** based on column ranges, assuming columns are evenly divided across regions (e.g., with 10 columns and 2 regions: cols 0–4 → region 0, 5–9 → region 1). G6 arena follows the G4 convention for chip-selects (by row).

Pattern data is stored on the SD card in **panel-set order**. A panel set is the **matched group across regions**: panels that share the same `panel_row` and the same within-region column offset. For each panel set, pattern blocks are ordered by increasing `panel_id`.

For a 2×10 arena split into two regions, panel set 0 consists of panels `{0, 5}`, and panel set 1 consists of `{1, 6}`. Pattern data on disk is stored in the order:

```
panel_set 0: panel 0, panel 5
panel_set 1: panel 1, panel 6
…
```

This ordering allows the controller to read pattern data sequentially from the SD card and transmit it efficiently by iterating over panel sets, enabling each chip-select in turn and sending data across all regions in parallel.

## Panel Map Data Structure (Minimal)

Each panel map entry consists of **three 8-bit fields**:

1. **`region`** (uint8)
   - SPI index (0–255 possible; 0/1 for Teensy controller).
   - `region = 255` reserved for "unused / skip" (do not send data to this slot).

2. **`panel_row`** (uint8)
   - Row index of the panel in the arena grid.
   - Row 0 is the bottom row.
   - The controller derives the chip-select (panel set) from this value.

3. **`panel_col`** (uint8)
   - Column index of the panel in the arena grid.
   - Column 0 is the leftmost column.

Panel IDs are **not stored**. They are **implicitly defined** by `(panel_row, panel_col)`:

- `panel_id = panel_row × num_cols + panel_col` (row-major, 0-based)

**Assumptions:**

- All indexing is 0-based: rows, columns, regions, and `panel_id`.
- Panels form a regular grid.
- The panel map is static (**read-only**) and loaded once from the SD card.
- Regions are evenly divided by the number of columns (for the 10-column arena planned first, columns 0–4 are in region 0, columns 5–9 in region 1).

## Worked Example for 2 × 10 G6 Arena

### Geometry and regions

- `num_rows = 2`, `num_cols = 10`
- Row 0 = bottom, Row 1 = top
- 2 regions, `cols_per_region = 5`
- Columns 0–4 → region 0
- Columns 5–9 → region 1

### Implicit Panel IDs (row-major, 0-based)

```
                c0 c1 c2 c3 c4 c5 c6 c7 c8 c9
Row 1 (top):    10 11 12 13 14 15 16 17 18 19
Row 0 (bottom):  0  1  2  3  4  5  6  7  8  9
```

### Panel Map Entries (summary table)

Each entry is stored as 3 bytes: `[region, panel_row, panel_col]`.

| panel_id (implicit) | region | panel_row | panel_col | bytes |
| :-: | :-: | :-: | :-: | :-: |
| 0 | 0 | 0 | 0 | `[0,0,0]` |
| 1 | 0 | 0 | 1 | `[0,0,1]` |
| 2 | 0 | 0 | 2 | `[0,0,2]` |
| 3 | 0 | 0 | 3 | `[0,0,3]` |
| 4 | 0 | 0 | 4 | `[0,0,4]` |
| 5 | 1 | 0 | 5 | `[1,0,5]` |
| 6 | 1 | 0 | 6 | `[1,0,6]` |
| 7 | 1 | 0 | 7 | `[1,0,7]` |
| 8 | 1 | 0 | 8 | `[1,0,8]` |
| 9 | 1 | 0 | 9 | `[1,0,9]` |
| 10 | 0 | 1 | 0 | `[0,1,0]` |
| 11 | 0 | 1 | 1 | `[0,1,1]` |
| 12 | 0 | 1 | 2 | `[0,1,2]` |
| 13 | 0 | 1 | 3 | `[0,1,3]` |
| 14 | 0 | 1 | 4 | `[0,1,4]` |
| 15 | 1 | 1 | 5 | `[1,1,5]` |
| 16 | 1 | 1 | 6 | `[1,1,6]` |
| 17 | 1 | 1 | 7 | `[1,1,7]` |
| 18 | 1 | 1 | 8 | `[1,1,8]` |
| 19 | 1 | 1 | 9 | `[1,1,9]` |

The corresponding PanelMap table, stored on the SD card, would be:

```
0  0  0
0  0  1
0  0  2
0  0  3
0  0  4
1  0  5
1  0  6
1  0  7
1  0  8
1  0  9
0  1  0
0  1  1
0  1  2
0  1  3
0  1  4
1  1  5
1  1  6
1  1  7
1  1  8
1  1  9
```

For the highly relevant example of 2 missing columns (e.g., a flight/walking arena, no need to stimulate behind the fly):

| panel_id (implicit) | region | panel_row | panel_col | bytes |
| :-: | :-: | :-: | :-: | :-: |
| 0 | 255 | 0 | 0 | `[255,0,0]` |
| 1 | 0 | 0 | 1 | `[0,0,1]` |
| 2 | 0 | 0 | 2 | `[0,0,2]` |
| 3 | 0 | 0 | 3 | `[0,0,3]` |
| 4 | 0 | 0 | 4 | `[0,0,4]` |
| 5 | 1 | 0 | 5 | `[1,0,5]` |
| 6 | 1 | 0 | 6 | `[1,0,6]` |
| 7 | 1 | 0 | 7 | `[1,0,7]` |
| 8 | 1 | 0 | 8 | `[1,0,8]` |
| 9 | 255 | 0 | 9 | `[255,0,9]` |
| 10 | 255 | 1 | 0 | `[255,1,0]` |
| 11 | 0 | 1 | 1 | `[0,1,1]` |
| 12 | 0 | 1 | 2 | `[0,1,2]` |
| 13 | 0 | 1 | 3 | `[0,1,3]` |
| 14 | 0 | 1 | 4 | `[0,1,4]` |
| 15 | 1 | 1 | 5 | `[1,1,5]` |
| 16 | 1 | 1 | 6 | `[1,1,6]` |
| 17 | 1 | 1 | 7 | `[1,1,7]` |
| 18 | 1 | 1 | 8 | `[1,1,8]` |
| 19 | 255 | 1 | 9 | `[255,1,9]` |

### Panel Sets and Pattern Ordering

A **panel set** is defined by `panel_row`:

- **Row 0 panel sets**: `{0, 5}`, `{1, 6}`, `{2, 7}`, `{3, 8}`, `{4, 9}`
- **Row 1 panel sets**: `{10, 15}`, `{11, 16}`, `{12, 17}`, `{13, 18}`, `{14, 19}`

**Pattern data in the PAT file is stored in panel-set order**, for example:

```
0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 15, 11, 16, 12, 17, 13, 18, 14, 19
```

During playback, the controller reads pattern blocks sequentially from the SD card, iterates over panel sets (chip-selects), and sends data across both regions in parallel.

### Panel Map Verification (Optional)

To verify that the panel map is interpreted correctly, with streaming (mode 5) implemented, the host can make and send a test pattern (showing `panel_id` on each panel) without any specialized controller command.

### Alternative Implementation

The source Google Doc anticipated subsumption: *"Now that you have specified everything so well, this entire table can be boiled down to 5 bytes: row_count, col_count, and a 3-byte bit mask. Will consider putting these bytes in a pattern header rather than storing them in a separate file. `2, 10, 0x7F, 0x9F, 0xE0`"*

```
panel_id:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
present?:  0  1  1  1  1  1  1  1  1  0  0  1  1  1  1  1  1  1  1  0
```

> **⚠ Flag — implementation has subsumed the standalone panel-map file into the pattern header.** Per the user, current `maDisplayTools` implementation generates `.pat` files with the panel mask embedded in the header (the "v2 patterns" file format). The standalone panel-map file described above is no longer written. Reconciliation with the v2 implementation will land in a follow-up commit.

## Open Questions / TBDs

1. **Reconcile against `maDisplayTools` v2 pattern implementation** — the actual on-disk format has evolved past the v1 spec. Reconciliation will surface header-layout changes, panel-ordering differences, and any new header fields. Lands in the next commit.
2. **Reconcile against `webDisplayTools`** — the JS-side encoder must round-trip with the MATLAB encoder; a JSON test-vector reference (`g6_encoding_reference.json`) lives in `maDisplayTools`. Cite as canonical.
3. **G6 controller firmware does not exist yet.** All Controller Operation steps above are aspirational. The G4.1 slim controller reads G4 patterns, not G6. G6 controller scoping happens in [`g6_03-controller.md`](g6_03-controller.md).
4. **Panel-set ordering.** Spec describes panel-set-interleaved ordering for parallel SPI transmission. Reconciliation will check whether the current implementation actually writes panel-set order.
5. **Two checksum algorithms in the protocol family.** Pattern file uses XOR; panel-confirmation message uses additive sum (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message). Both intentional; worth documenting once reconciliation lands.

## Cross-references

- [Source Google Doc, "Pattern Format / Panel Map" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for the v1 file-format spec.
- [Source Google Doc, "Panel Map proposal" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for the panel-map proposal (now merged into this file).
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel block format references panel protocol v1 header byte, command byte, parity rule, payload sizes.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping; the worked example uses the same pixel encoding as this file's panel block.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side reading of pattern files (gated on G4.1 slim review).
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side workflow for generating pattern files.
