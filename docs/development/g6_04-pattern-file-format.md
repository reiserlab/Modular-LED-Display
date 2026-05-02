# G6 — Pattern File Format & Panel Map

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Pattern Format / Panel Map" lines 1865–2162 + "Panel Map proposal" lines 2169–2407, merged) · Last reviewed: 2026-05-01 by mreiser
Status: **§ Pattern File Format (spec v1) = Migrated; SUPERSEDED in implementation by v2 in `maDisplayTools` (18-byte header instead of 17)** · **§ Panel Map proposal = Migrated as historical; now subsumed into the pattern header in v2 implementation** · 1 major spec ↔ implementation divergence on panel ordering, plus several smaller header-byte-layout changes

This file holds the on-disk file format for G6 pattern (`.pat`) files plus the Panel Map proposal. The user merged the two source tabs because in current implementation the standalone panel-map structure has been folded into the pattern header — patterns and panel layout live in one file, not two.

## Current state — three implementations triangulated

| Implementation | What it is | Header size | Status |
|---|---|---|---|
| **Spec v1** (this file's source) | Google Doc "Pattern Format" tab, 17-byte header | 17 bytes | **Superseded.** Migrated below for historical traceability and because it describes the design intent (validation layers, panel-set ordering rationale, etc.). |
| **maDisplayTools v2** ([Generation 6/maDisplayTools/g6/g6_save_pattern.m](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | The MATLAB tool that **actually generates** `.pat` files in production today. Header version field set to `2`. | **18 bytes** | **Canonical for files written today.** Matched by [Generation 6/webDisplayTools/](../../Generation%206/webDisplayTools/) per the `g6_encoding_reference.json` round-trip test set. |
| G4.1 slim controller ([LED-Display_G4.1_ArenaController_Slim/src/PatternHeader.h](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim/blob/main/src/PatternHeader.h)) | A different `PatternHeader` (8-byte `union` with `frame_count_x/y`, `grayscale_value`, `panel_count_per_frame_row/col`) | 8 bytes | **Not relevant to G6.** This is the G4 baseline controller; it reads G4 patterns, not G6 `.pat` files. Documented here so the controller doc work doesn't accidentally treat it as the G6 reader. |

There is **no G6 controller firmware** that reads G6 `.pat` files yet. So:
- Files **written** today: by `maDisplayTools` (and `webDisplayTools` for the web-side tools), in v2 format.
- Files **read** today: nothing — there's no consumer until a G6 controller firmware ships.

That asymmetry means "the implementation" is the writer side, and the reconciliation here compares the **spec writer requirements** against **maDisplayTools' actual binary output**. The v2 format is what we'll need to consolidate into a single canonical spec when this section is finalized.

### Reconciliation: maDisplayTools v2 vs spec v1 (run 2026-05-01)

**Confirmations (spec v1 matches v2 implementation):**

| Spec v1 claim | v2 implementation | Verdict |
|---|---|---|
| Magic = ASCII "G6PT" at bytes 0–3 (`0x47 0x36 0x50 0x54`) | `header(1:4) = uint8('G6PT');` ([g6_save_pattern.m:264](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | ✓ |
| Frame count = `uint16` little-endian | `header(7) = uint8(mod(num_frames,256)); header(8) = uint8(floor(num_frames/256));` ([:273–274](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) — i.e., LE byte split | ✓ |
| Row count + Column count, each `uint8` | `header(9) = row_count; header(10) = col_count;` ([:275–276](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | ✓ (positions shifted, see divergences) |
| Panel mask, 6 bytes, `panel_id = row × col_count + col`, `byte_index = panel_id // 8`, `bit_index = panel_id % 8` (LSB-first), bit 1 = present | `create_panel_mask()` at [:204–218](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m) sets bits per the same formula | ✓ |
| Frame magic = ASCII "FR" + `uint16 LE` frame index (4 bytes total) | `frame_header(1:2) = uint8('FR'); frame_header(3) = mod(idx,256); frame_header(4) = floor(idx/256);` ([:294–296](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | ✓ |
| Panel block = `[header byte][command byte][pixel data][stretch]`, sizes 53 (GS2) / 203 (GS16), pre-formatted for SPI per Panel Protocol v1 | `g6_encode_panel.m` produces `1×53` (GS2) or `1×203` (GS16) panel blocks per the same layout; pixel data row-major MSB-first packed by `encode_gs2` / `encode_gs16` | ✓ |
| Pixel data row-major, MSB-first packing, origin at bottom-left | Confirmed by `g6_encoding_reference.json` test vectors and `g6_encode_panel.m` (`row_from_bottom = 19 - row`) | ✓ |
| Checksum = byte-wise XOR of all frame data | `for i = 1:length(all_frames) checksum = bitxor(checksum, all_frames(i)); end` ([:328–331](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | ✓ on algorithm |
| All multi-byte integers little-endian | Confirmed | ✓ |
| 48-panel maximum (6-byte mask × 8 bits) | `panel_mask = zeros(1, 6, 'uint8')` enforces 6 bytes | ✓ |

**Spec ↔ implementation divergences (need a decision):**

| # | Topic | Spec v1 | v2 implementation | Action |
|---|---|---|---|---|
| **D1** | **Header size** | 17 bytes | **18 bytes** | Adopt 18 bytes as canonical. Update spec wording, file-size formulas, and worked examples. |
| **D2** | **Byte 4 (Version)** | "Version `uint8` value `1`" | Upper 4 bits of byte 4 = Version (= `2`); lower 4 bits = upper 4 bits of Arena ID | Adopt v2 layout. Document the `[VVVV][AAAA]` packing and the new Version = 2. |
| **D3** | **Byte 5 (was "Flags") replaced** | `Flags` byte: bits 0–2 = `gs_code` (1=GS2, 2=GS16), bits 3–7 reserved | Byte 5 = `[AA][OOOOOO]`: Arena ID lower 2 bits + Observer ID (6 bits) | Adopt v2 layout. The spec's flags byte is gone; `gs_val` moved to byte 10 (see D5). |
| **D4** | **`gs_val` location** | Byte 5 bits 0–2 (within Flags) | **Byte 10 as a standalone `uint8`** with values `1`=GS2, `2`=GS16 | Adopt byte 10 location. |
| **D5** | **Checksum location** | Byte 10 | **Byte 17 (last byte of header)** | Adopt byte 17. The `make_pattern_binary` function writes a placeholder `0` then back-patches the final XOR. |
| **D6** | **Panel mask location** | Bytes 11–16 | **Bytes 11–16** (unchanged numerically — happens to fall in the same byte range because the new fields above are tightly packed) | ✓ Same. |
| **D7** | **Frame Count range** | `0–65,535` | Implementation asserts `num_frames > 0 && num_frames <= 65535` — i.e., **excludes 0** | Decide whether 0 frames is allowed. Implementation says no; spec implies yes. |
| **D8** | **Arena ID + Observer ID fields** | Not in spec | New 6-bit fields each, packed into bytes 4–5 | Spec these fields (range, semantics, defaults). Implementation defaults both to 0 if not provided. |
| **D9** | **Panel ordering on disk** | Panel-**set** order with region interleaving (e.g., 2×10 arena: `0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 15, 11, 16, …`) | **Simple row-major ordering** (`for panel_row, for col_idx`): panels written `0, 1, 2, …, 9, 10, 11, …, 19` ([:300–322](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) | **Major divergence.** Either (a) the spec's panel-set rationale is no longer valid (controller would re-order on read; or panel-set parallelism is now done a different way), or (b) the implementation needs to switch to panel-set order, or (c) the controller (not yet built) is expected to read row-major and reorder before SPI transmission. Decide. |
| **D10** | **`col_count` field semantics** | "Panel columns in arena" | `col_count` = **full grid columns** even for partial arenas (e.g., 2-of-10 columns installed → `col_count = 10`, not `8`); the panel mask records which are present | Adopt impl semantics: `col_count` is always the full grid; panel mask carves out the subset. Document explicitly. |
| **D11** | **Format version field** | Spec says version = `1` | Implementation writes version = `2` (this is what makes the format "v2") | Note the format version increments from 1 (spec) to 2 (impl). |

**Implementation extensions not in spec (informational):**

- **Arena ID** (6 bits, 0–63): identifies the physical arena. Default `0`. Stored across bytes 4–5 (4 upper bits + 2 lower bits).
- **Observer ID** (6 bits, 0–63): identifies the observer / experiment subject. Default `0`. Stored in lower 6 bits of byte 5.
- **Pixel data origin = bottom-left** (per `g6_encoding_reference.json`'s `"origin":"bottom-left"`). MATLAB convention has row 1 = top, so the encoder flips with `row_from_bottom = 19 - row` ([g6_encode_panel.m:18–20](../../Generation%206/maDisplayTools/g6/g6_encode_panel.m)). The spec's worked v1 LED-mapping example (`pixel[0,0]` = D50 = bottom-left) matches.
- **`g6_encoding_reference.json`** ([Generation 6/maDisplayTools/g6/g6_encoding_reference.json](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json)) — canonical JSON of test vectors used by `webDisplayTools` to round-trip-validate the JS pixel encoder against the MATLAB encoder. Should be lifted into the spec as the normative bit-level reference.
- **`columns_installed`** field on the arena config: lets the user mark a subset of columns as physically installed; the panel mask is derived from this. Used for partial arenas (e.g., flight rig with 8 of 10 columns).

---

## Overview (spec v1, kept for design intent)

G6 pattern files (`.pat`) store LED display patterns for the G6 arena system. Files contain a fixed-length header followed by frame data with validation structures. The PC host generates pattern files with pre-computed parity and checksums. The controller reads frames from SD card and transmits panel blocks directly to panels via SPI.

**Key design principles:**

- Fixed-length header for deterministic parsing
- Ready-to-transmit panel blocks (no controller repacking)
- Multiple validation layers (**all optional in v1**)
- All multi-byte integers are **little-endian**

## Logical Structure

```
PAT file
 ├─ Header (17 bytes — spec v1; 18 bytes — v2 implementation)
 └─ Frames[]
      ├─ Frame magic + index (4 bytes)
      └─ PanelSets[]
           └─ PanelBlocks[] (53 or 203 bytes each)
```

## Header Format

### v2 (current implementation, `maDisplayTools/g6/g6_save_pattern.m`)

| Bytes (0-indexed) | Field | Type | Value/Range | Description |
| :-: | :-- | :-- | :-- | :-- |
| 0–3 | Magic | ASCII | `"G6PT"` | File type identifier (`0x47 0x36 0x50 0x54`) |
| 4 | `[VVVV][AAAA]` | uint8 | V=2, A=arena_id high 4 bits | Bits 7–4 = format version (= 2 in implementation today); bits 3–0 = upper 4 bits of 6-bit Arena ID |
| 5 | `[AA][OOOOOO]` | uint8 | A=arena_id low 2 bits, O=observer_id 6 bits | Bits 7–6 = lower 2 bits of Arena ID; bits 5–0 = Observer ID (0–63) |
| 6–7 | Frame Count | uint16 LE | 1–65 535 | Number of frames in file (implementation rejects 0) |
| 8 | Row Count | uint8 | 1–255 | Panel rows in arena |
| 9 | Column Count | uint8 | 1–255 | **Full** grid columns in arena (subset installed via panel mask) |
| 10 | `gs_val` | uint8 | 1 = GS2, 2 = GS16 | Pixel encoding throughout file |
| 11–16 | Panel Mask | 6 bytes | bitmask | Which panel positions are physically present (up to 48 panels) |
| 17 | Checksum | uint8 | 0–255 | XOR of all frame data bytes |

### v1 (spec, historical)

The original Google Doc spec described a 17-byte header with a different byte-5 layout (a `Flags` byte holding only `gs_code`) and the checksum at byte 10:

| Bytes | Field | Type | Value/Range | Description |
| :-: | :-- | :-- | :-- | :-- |
| 0–3 | Magic | ASCII | `"G6PT"` | File type identifier (`0x47 0x36 0x50 0x54`) |
| 4 | Version | uint8 | 1 | Format version |
| 5 | Flags | uint8 | bits 0–2 = `gs_code` (1=GS2, 2=GS16), bits 3–7 reserved | Grayscale mode + reserved bits |
| 6–7 | Frame Count | uint16 LE | 0–65 535 | Number of frames in file |
| 8 | Row Count | uint8 | 1–255 | Panel rows in arena |
| 9 | Column count | uint8 | 1–255 | Panel columns in arena |
| 10 | Checksum | uint8 | 0–255 | XOR of all frame data bytes |
| 11–16 | Panel Mask | 6 bytes | — | Bitmask for up to 48 panels |

> **⚠ Flag — v1 (17-byte) header is superseded.** All actually-written `.pat` files today follow the v2 18-byte layout above. The v1 layout is preserved here for traceability against the source Google Doc and to surface the diff (D1–D11). When the spec is consolidated, drop the v1 header table and keep only v2 as normative; cross-reference the divergence list as the change record.

### Panel Mask (Bytes 11–16) — common to v1 and v2

Compact bitmask indicating which panel positions are physically present:

- **Bit encoding**: `panel_id = row × col_count + col` (row-major, 0-based).
- **Byte/bit mapping**: `byte_index = panel_id // 8`, `bit_index = panel_id % 8` (LSB-first).
- **Bit value**: 1 = panel present, 0 = panel absent.
- **Maximum panels**: 48 (6 bytes × 8 bits).

**Validation:** Controller MUST verify:

1. `row_count × col_count ≤ 48`
2. Number of panels present in mask ≤ `row_count × col_count`

If either check fails, return a "pattern error" with failed-verification details to PC Host.

> **⚠ Flag — `col_count` semantics drift.** In v2 implementation, `col_count` is the **full grid** (e.g., 10 for a 2×10 arena even when only 8 columns are installed); the panel mask carves out which are actually populated. The spec didn't make this explicit. Reword the spec line to: "`col_count` = full grid column count; partial arenas are described by zeroing the corresponding bits in the panel mask, not by reducing `col_count`."

### Checksum

- **Algorithm**: byte-wise XOR
- **Computation**: `checksum = byte[0] ^ byte[1] ^ … ^ byte[n]`
- **Scope**: All frame data (from first frame's `"FR"` magic through last panel's stretch byte)
- **Result**: single byte (0–255)
- **Usage**: optional validation in v1; enables future error detection
- **Storage location**: byte 17 (v2) — was byte 10 in spec v1

> **⚠ Flag — Two checksum algorithms in the protocol family.** Pattern file uses **XOR**; panel-confirmation message uses **additive sum mod 256** (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message). Both confirmed against firmware. Worth noting in any consolidated specification.

## Frame Format

### Frame Structure

Each frame begins with validation magic, followed by panel blocks in panel-set order (per spec) or row-major order (per impl — see D9):

```
Frame:
  [Magic: "FR" (0x46 0x52): 2 bytes]
  [Frame Index: uint16 LE: 2 bytes]
  [Panel blocks for all panels in panel-set order (spec) / row-major order (impl)]
```

**Frame overhead**: 4 bytes per frame.

### Panel Set Ordering (spec v1)

> **⚠ Flag — major divergence between spec and implementation. See D9 in the reconciliation table.**

Panels are grouped into **panel sets** for efficient SPI transmission. Each panel set contains panels with the same row and column offset within their region.

**Example (2×10 arena, 2 regions)** — *spec ordering*:

- Panel set 0: `{0, 5}` (row 0, col 0 in each region)
- Panel set 1: `{1, 6}` (row 0, col 1 in each region)
- Panel set 2: `{2, 7}` (row 0, col 2 in each region)
- …
- Panel set 10: `{10, 15}` (row 1, col 0 in each region)

**Pattern data order (spec)**: `0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 15, 11, 16, 12, 17, 13, 18, 14, 19`

**Rationale**: enables controller to enable chip-select (by row) and transmit to all regions in parallel.

**Pattern data order (v2 implementation)**: `0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19` (simple row-major).

> **⚠ Flag — Panel-set ordering decision.** Three options for resolution:
>
> 1. **Reorder in implementation**: change `g6_save_pattern.m` to write panel-set-interleaved order. Preserves the spec's parallel-SPI rationale. Cheap to do.
> 2. **Reorder in controller (not yet written)**: file stays row-major; G6 controller firmware reads sequentially and reorders into per-CS-batch panel sets before SPI transmission. More controller-side overhead but matches what the implementation already writes.
> 3. **Drop the panel-set rationale**: if controller doesn't actually need parallel-SPI region transmission (e.g., the regions are small enough that sequential per-region transmission is fine), then row-major is simpler and the spec's interleaving is unnecessary.
>
> Decide before any G6 controller firmware reads `.pat` files. The G4.1 slim controller doesn't help here — it reads G4 patterns, not G6.

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

- **GS2**: 53 bytes total (1-byte header + 1-byte command + 50-byte pattern + 1-byte stretch)
- **GS16**: 203 bytes total (1-byte header + 1-byte command + 200-byte pattern + 1-byte stretch)

**Key points:**

- Header byte includes parity bit (bit 7) and protocol version (bits 0–6).
- PC host pre-computes parity when generating pattern file.
- Controller transmits blocks directly to panels without modification.
- Controller may optionally validate parity in v1.

### Pixel Data Layout

Pixel data is row-major, MSB-first, with origin at the bottom-left of the panel. Canonical reference: [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — round-trip test vectors that webDisplayTools and maDisplayTools both validate against.

```
pixel_num   = row_from_bottom × 20 + col          # 0..399
byte_index  = pixel_num // 8                       # GS2
bit_in_byte = 7 - (pixel_num % 8)                  # GS2, MSB-first
pixel_value = (byte >> bit_in_byte) & 1            # GS2

byte_index  = pixel_num // 2                       # GS16
upper_nibble = pixel even (high nibble first)
lower_nibble = pixel odd
```

This matches [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format and the worked example (`pixel[0,0]` = D50, `pixel[0,1]` = D70, `pixel[19,18]` = D340, `pixel[19,19]` = D360).

## File Size Calculation

### v2 formula (current implementation)

```
file_size = 18 + (num_frames × frame_size)
frame_size = 4 + (num_panels × block_size)
num_panels = row_count × col_count        # full grid; subset selected via panel mask
block_size = 53 (GS2) or 203 (GS16)
```

### v2 worked examples

**2×10 arena (20 panels), 100 frames, GS2**:

- Frame: `4 + (20 × 53) = 1,064 bytes`
- Total: `18 + (100 × 1,064) = 106,418 bytes` (~104 KB)

**2×10 arena (20 panels), 100 frames, GS16**:

- Frame: `4 + (20 × 203) = 4,064 bytes`
- Total: `18 + (100 × 4,064) = 406,418 bytes` (~397 KB)

**3×12 arena (36 panels), 1000 frames, GS16**:

- Frame: `4 + (36 × 203) = 7,312 bytes`
- Total: `18 + (1,000 × 7,312) = 7,312,018 bytes` (~6.97 MB)

### v1 (spec) examples for reference

The original spec used a 17-byte header. The same three examples evaluated to **106,417 / 406,417 / 7,312,017 bytes** — each one byte less than v2. Update wherever these v1 figures are referenced (pattern-file-format docs, host-software examples, etc.).

> **⚠ Flag — File-size discrepancy of 1 byte across spec vs. implementation.** The 1-byte difference is the extra header byte for Arena ID + Observer ID. Verify SD-card storage planning, pattern-library file size calculations, and any disk-quota assumptions are recomputed against v2.

## Validation Layers

Four independent validation mechanisms (all **optional** in v1):

1. **Pattern magic** (bytes 0–3): `"G6PT"` identifies file type.
2. **Checksum** (byte 17 in v2 / byte 10 in spec): XOR of all frame data detects corruption.
3. **Frame magic** (per frame): `"FR"` + index validates frame boundaries.
4. **Panel parity** (per block): header byte bit 7 detects transmission errors.

**v1 implementation note**: validation structures are present in the format, but enforcement is optional.

> **⚠ Flag — `pattern.version = 1` in `g6_save_pattern.m` despite v2 file format.** The implementation sets the in-memory `pattern.version = 1` ([:131](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)) while writing the on-disk version field as `2` ([:268](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m)). The in-memory `pattern.version` is unused by the binary writer. Cosmetic, but confusing. Either remove the unused field or set it to 2.

## Controller Operation (spec; no G6 controller firmware exists yet)

### Reading Pattern Files

1. Read header (17 bytes / 18 bytes for v2).
2. Validate magic `"G6PT"` and version (`= 1` per spec; `= 2` per implementation today).
3. Extract `frame_count`, `row_count`, `col_count`, `gs_val`, `panel_mask` (and Arena/Observer ID in v2).
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

> **⚠ Flag — No G6 controller firmware exists yet.** The `iorodeo/g6_firmware_devel` repo is **panel firmware**, not controller firmware. The G4.1 slim controller (`floesche/LED-Display_G4.1_ArenaController_Slim`) reads G4 patterns, not G6 `.pat` files. The Controller Operation section above remains aspirational until a G6 controller firmware ships. The controller doc (`g6_03-controller.md`) will revisit this after the G4.1-slim baseline is inventoried.

## PC Host Responsibilities (per `maDisplayTools` v2 implementation)

The PC host (MATLAB / Python / web) generates pattern files:

1. **Arena configuration**: define panel layout, orientations, LED mapping. The arena config is canonical — `g6_arena_config()` in MATLAB or the equivalent in `webDisplayTools`.
2. **Pattern generation**: create full-arena frames (`row_count × col_count` panels). Pixel arrays are 3D: `(total_rows, total_cols, num_frames)`, e.g., `(40, 200, num_frames)` for a 2×10 arena (each panel is 20×20).
3. **Panel block formatting** (per panel, per frame):
   - Compute parity for each panel block per G6 Panel Protocol v1.
   - Insert header byte (`0x01` or `0x81`) and command byte (`0x10` GS2 / `0x30` GS16).
   - Pack pixels per G6 panel format (row-major, MSB-first, bottom-left origin; flip MATLAB row ↔ panel row via `row_from_bottom = 19 - row`).
   - Append stretch value.
4. **Frame assembly**: prepend `"FR"` magic and frame index to panel blocks.
5. **Checksum**: compute XOR over all frame data, store in header byte 17 (v2).
6. **File writing**: write 18-byte header followed by all frames.

Cross-reference with [`Generation 6/maDisplayTools/docs/patterns.md`](../../Generation%206/maDisplayTools/docs/patterns.md) for the user-facing description of where generated `.pat` files live and how to regenerate reference patterns.

## Change Summary from Earlier Proposals (spec, kept verbatim)

The spec recorded these changes from earlier file-format proposals:

1. **Fixed 17-byte header** (removed variable-length `header_len` field and reserved bytes) — _now 18 bytes in v2._
2. **Flags simplified** (only `gs_code` used; stretch and CRC flags removed) — _Flags byte itself was eliminated in v2; `gs_val` moved to byte 10._
3. **Single-byte XOR checksum** (simple, adequate for SD card validation) — _retained; moved to byte 17._
4. **Frame magic mandatory** (validation at frame boundaries) — _retained._
5. **Panel block magic removed** (blocks are SPI-ready, no extra overhead) — _retained._
6. **Pre-computed parity** (PC host calculates, controller optionally validates) — _retained._
7. **48-panel maximum** (fixed 6-byte mask, validation required) — _retained._
8. **Pattern data always complete** (includes all panels regardless of mask; controller uses mask to determine transmission targets) — _retained, with v2 clarification that `col_count` always = full grid._

> **⚠ Flag — Update the change-summary list when the spec is consolidated.** The list above is verbatim from the source. The v2 changes (header → 18 bytes, Arena/Observer IDs, Flags-byte removal, gs_val relocation, checksum relocation, panel-ordering question) all need to be added.

---

## Panel Map proposal — historical (subsumed into pattern header in v2)

> **⚠ Flag — file-merge note.** The standalone Panel Map proposal in the source Google Doc has been merged into this file. In v2 implementation, the panel map data (row count, column count, panel mask) lives entirely inside the pattern file header — no separate panel-map file is written. The proposal text is preserved below for historical reference and because the worked-examples and the missing-columns variant remain useful for documentation.

This proposal defines a **minimal, host-defined panel map** that describes the logical arena layout while remaining compatible with the G4 wiring model, and supporting efficient pattern playback from SD card PAT files.

The panel map is the **single source of truth** for arena geometry. The controller derives the number of panels, rows, and columns from the panel map and **must not configure these parameters independently** elsewhere in the firmware.

Panels are arranged in a regular 2D grid and indexed **row-major with 0-based row and column indices**. A panel's **ID is implicit** and determined by its (row, column) location. Panels are assigned to **regions (SPI buses)** based on column ranges, assuming columns are evenly divided across regions (e.g., with 10 columns and 2 regions: cols 0–4 → region 0, 5–9 → region 1). G6 arena follows the G4 convention for chip-selects (by row).

Pattern data is stored on the SD card in **panel-set order** (per spec; see D9 above for divergence). A panel set is the **matched group across regions**: panels that share the same `panel_row` and the same within-region column offset. For each panel set, pattern blocks are ordered by increasing `panel_id`.

For a 2×10 arena split into two regions, panel set 0 consists of panels `{0, 5}`, and panel set 1 consists of `{1, 6}`. Pattern data on disk would be stored in the order:

```
panel_set 0: panel 0, panel 5
panel_set 1: panel 1, panel 6
…
```

This ordering allows the controller to read pattern data sequentially from the SD card and transmit it efficiently by iterating over panel sets, enabling each chip-select in turn and sending data across all regions in parallel.

### Panel Map Data Structure (Minimal)

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

### Worked Example for 2 × 10 G6 Arena

**Geometry and regions:**

- `num_rows = 2`, `num_cols = 10`
- Row 0 = bottom, Row 1 = top
- 2 regions, `cols_per_region = 5`
- Columns 0–4 → region 0
- Columns 5–9 → region 1

**Implicit Panel IDs (row-major, 0-based):**

```
                c0 c1 c2 c3 c4 c5 c6 c7 c8 c9
Row 1 (top):    10 11 12 13 14 15 16 17 18 19
Row 0 (bottom):  0  1  2  3  4  5  6  7  8  9
```

**Panel Map Entries (summary table):**

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

### Worked Example: 2 × 10 with 2 missing columns

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

### Panel Sets and Pattern Ordering (spec)

A **panel set** is defined by `panel_row`:

- **Row 0 panel sets**: `{0, 5}`, `{1, 6}`, `{2, 7}`, `{3, 8}`, `{4, 9}`
- **Row 1 panel sets**: `{10, 15}`, `{11, 16}`, `{12, 17}`, `{13, 18}`, `{14, 19}`

**Pattern data in the PAT file is stored in panel-set order**, for example:

```
0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 15, 11, 16, 12, 17, 13, 18, 14, 19
```

During playback, the controller reads pattern blocks sequentially from the SD card, iterates over panel sets (chip-selects), and sends data across both regions in parallel.

> **⚠ Flag — implementation diverges. See D9.** v2 implementation writes simple row-major (`0, 1, 2, …, 9, 10, …, 19`), not panel-set-interleaved.

### Panel Map Verification (Optional)

To verify that the panel map is interpreted correctly, with streaming (mode 5) implemented, the host can make and send a test pattern (showing `panel_id` on each panel) without any specialized controller command.

### Alternative Implementation — adopted in v2

The source Google Doc itself anticipated the eventual subsumption: *"Now that you have specified everything so well, this entire table can be boiled down to 5 bytes: row_count, col_count, and a 3-byte bit mask. Will consider putting these bytes in a pattern header rather than storing them in a separate file. `2, 10, 0x7F, 0x9F, 0xE0`"*

```
panel_id:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
present?:  0  1  1  1  1  1  1  1  1  0  0  1  1  1  1  1  1  1  1  0
```

This is exactly what v2 does — except with a 6-byte panel mask (up to 48 panels) and `row_count` / `col_count` bytes embedded in the pattern header. The standalone panel-map file is not needed.

> **⚠ Flag — Region / SPI-bus information is NOT in the v2 pattern header.** The v1 panel-map proposal stored `region` per panel (the 3-byte `[region, panel_row, panel_col]` rows). v2 keeps only the **panel mask** (which panels are present) — it does **not** record SPI bus / region per panel. That information has to come from elsewhere — likely from the arena config or computed by the controller assuming "evenly divided by columns". Decide where region info is canonical: (a) computed from `col_count` + a fixed regions-per-arena setting, (b) carried in a sidecar arena-config file, (c) added to the v2 header (would push it past 18 bytes). Until decided, the controller doc and host-software doc need to know how regions are conveyed.

---

## Open Questions / TBDs

1. **D9 — Panel ordering on disk: panel-set vs row-major.** Three options (reorder in implementation, reorder in controller, or drop the panel-set rationale entirely). Decide before any G6 controller firmware reads `.pat` files.
2. **D1 / D11 — File format version field.** Spec says version = 1 (17-byte header); implementation says version = 2 (18-byte header). Adopt v2 as canonical; decide whether to retain v1 readability (parsers detect version and dispatch).
3. **D8 — Arena ID + Observer ID semantics.** Spec out: 6-bit ranges, defaults (0/0 in impl), what they mean to the controller (does the controller use them? for filtering/routing?). Without firmware that reads them, they're metadata only.
4. **D7 — `num_frames` allowed values.** Spec says 0–65,535; implementation rejects 0. Confirm 0 is invalid (or update implementation to accept it).
5. **D10 — `col_count` semantics.** Implementation uses `col_count` = full grid; spec didn't say. Adopt impl semantics and rewrite spec wording.
6. **Region / SPI-bus information missing from v2 header.** The standalone panel-map proposal stored region per panel; v2 header dropped it. Where does the controller get region info from? Decide canonical source.
7. **Two checksum algorithms in the protocol family.** Pattern file uses XOR; panel-confirmation message uses additive sum. Both are intentional but worth documenting.
8. **No G6 controller firmware exists.** All Controller Operation steps above are aspirational. The G4.1 slim controller is a G4 baseline only. G6 controller scoping happens in [`g6_03-controller.md`](g6_03-controller.md).
9. **`pattern.version = 1` mismatch.** In-memory field is 1 but on-disk version is 2. Cosmetic; clean up.
10. **Lift `g6_encoding_reference.json` into the spec as the normative pixel-encoding reference.** It's currently a maDisplayTools internal artifact; should be cited as canonical.
11. **Update the "Change Summary from Earlier Proposals" list** when the spec is consolidated, to record the v1 → v2 changes (header size, Flags byte removal, Arena/Observer IDs, gs_val relocation, checksum relocation).

## Cross-references

- [Source Google Doc, "Pattern Format / Panel Map" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for the v1 file-format spec.
- [Source Google Doc, "Panel Map proposal" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for the panel-map proposal (now merged into this file).
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel block format references panel protocol v1 header byte, command byte, parity rule, payload sizes.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping; the worked example uses the same pixel encoding as this file's v2 panel block.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side reading of pattern files; G6 controller doesn't exist yet.
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side workflow for generating pattern files (maDisplayTools).
- [Generation 6/maDisplayTools/g6/g6_save_pattern.m](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m) — canonical implementation of v2 .pat file writer.
- [Generation 6/maDisplayTools/g6/g6_encode_panel.m](../../Generation%206/maDisplayTools/g6/g6_encode_panel.m) — panel-block encoder.
- [Generation 6/maDisplayTools/g6/g6_encoding_reference.json](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — JSON test vectors validated by both `maDisplayTools` and `webDisplayTools`.
- [Generation 6/maDisplayTools/docs/patterns.md](../../Generation%206/maDisplayTools/docs/patterns.md) — user-facing docs on where `.pat` files live.
