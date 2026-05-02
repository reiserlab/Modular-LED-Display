# G6 — Pattern File Format & Panel Map

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Pattern Format / Panel Map" lines 1865–2162 + "Panel Map proposal" lines 2169–2407, merged) · Last reviewed: 2026-05-02 by mreiser
Status: **v2 is canonical** — 18-byte header, written by [`maDisplayTools/g6/g6_save_pattern.m`](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m), round-trip-validated against `webDisplayTools` via [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json). The standalone Panel Map proposal from the source Google Doc has been merged in — panel layout lives entirely in the pattern header in v2.

## Current state

- Files **written** today by `maDisplayTools` and `webDisplayTools` use the v2 18-byte header and have a shared bit-level test vector set in [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json).
- Files **read** today: nothing — there's no consumer until a G6 controller firmware ships.
- The G4.1 slim controller ([`PatternHeader.h`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim/blob/main/src/PatternHeader.h)) has its own 8-byte `PatternHeader` union — that reads G4 patterns, **not** G6 `.pat` files. Documented here so the controller doc work doesn't accidentally treat it as the G6 reader.

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
| 6–7 | Frame Count | uint16 LE | 1–65,535 | Number of frames in file |
| 8 | Row Count | uint8 | 1–255 | Panel rows in arena |
| 9 | Column Count | uint8 | 1–255 | **Full** grid columns in arena (subset installed via panel mask) |
| 10 | `gs_val` | uint8 | 1 = GS2, 2 = GS16 | Pixel encoding throughout file |
| 11–16 | Panel Mask | 6 bytes | bitmask | Which panel positions are physically present (up to 48 panels) |
| 17 | Checksum | uint8 | 0–255 | XOR of all frame data bytes |

### Panel Mask (Bytes 11–16)

Compact bitmask indicating which panel positions are physically present:

- **Bit encoding**: `panel_id = row × col_count + col` (row-major, 0-based).
- **Byte/bit mapping**: `byte_index = panel_id // 8`, `bit_index = panel_id % 8` (LSB-first).
- **Bit value**: 1 = panel present, 0 = panel absent.
- **Maximum panels**: 48 (6 bytes × 8 bits).

**Validation:** Controller MUST verify (a) `row_count × col_count ≤ 48`, and (b) the count of bits set in the mask is ≤ `row_count × col_count`. If either check fails, return a "pattern error" to the host.

### Checksum (Byte 17)

- **Algorithm**: byte-wise XOR
- **Computation**: `checksum = byte[0] ^ byte[1] ^ … ^ byte[n]`
- **Scope**: All frame data (from first frame's `"FR"` magic through last panel's stretch byte)
- **Result**: single byte (0–255)
- **Usage**: optional validation in v1 panel protocol; enables future error detection

**💡 Note — two checksum algorithms in the protocol family.** Pattern file uses **XOR**; panel-confirmation message uses **additive sum mod 256** (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message). Both intentional, both confirmed against firmware — listed here so readers don't conflate them.

## Frame Format

Each frame begins with a 4-byte validation header, followed by all panel blocks for that frame in row-major panel order:

```
Frame:
  [Magic: "FR" (0x46 0x52): 2 bytes]
  [Frame Index: uint16 LE: 2 bytes]
  [Panel blocks for all panels, row-major order: panels 0, 1, 2, …, num_panels-1]
```

**Frame overhead:** 4 bytes per frame.

### Panel ordering

Panels are written in **simple row-major order**: `0, 1, 2, …, num_panels-1`. The G6 controller reads panel blocks sequentially and dispatches them to the appropriate SPI bus per panel ID; parallel-region transmission, if needed, is the controller's job (re-batching CS lines), not the file format's. The earlier panel-set-interleaved proposal from the source spec is dropped as needlessly complex.

## Panel Block Format

Panel blocks are **pre-formatted for SPI transmission** following G6 Panel Protocol v1. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) for complete details.

```
[Header byte: 1 byte]         ← Protocol v1 (0x01 or 0x81 with parity)
[Command byte: 1 byte]        ← 0x10 (GS2) or 0x30 (GS16)
[Pixel data: 50 (GS2) or 200 (GS16) bytes]   ← Row-major, MSB-first packing, origin at bottom-left
[Stretch: 1 byte]             ← Brightness/timing (0–255)
```

### Block sizes

- **GS2**: 53 bytes total (1 header + 1 command + 50 pattern + 1 stretch)
- **GS16**: 203 bytes total (1 header + 1 command + 200 pattern + 1 stretch)

The header byte includes parity bit (bit 7) and protocol version (bits 0–6). PC host pre-computes parity when generating pattern file; controller transmits blocks directly to panels without modification, optionally validating parity.

### Pixel Data Layout

Pixel data is row-major, MSB-first, with origin at the bottom-left of the panel. Canonical reference: [`g6_encoding_reference.json`](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — round-trip test vectors that webDisplayTools and maDisplayTools both validate against.

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
frame_size = 4 + (num_panels × block_size)
num_panels = row_count × col_count        # full grid; subset selected via panel mask
block_size = 53 (GS2) or 203 (GS16)
```

### Worked examples

| Arena | Frames | Mode | Frame size | File size |
|---|---:|---|---:|---:|
| 2×10 (20 panels) | 100 | GS2 | 1,064 B | **106,418 B** (~104 KB) |
| 2×10 (20 panels) | 100 | GS16 | 4,064 B | **406,418 B** (~397 KB) |
| 3×12 (36 panels) | 1,000 | GS16 | 7,312 B | **7,312,018 B** (~6.97 MB) |

## Validation Layers

Four independent validation mechanisms (all **optional** in v1 — present in the format, enforcement is implementation-dependent):

1. **Pattern magic** (bytes 0–3): `"G6PT"` identifies file type.
2. **Checksum** (byte 17): XOR of all frame data detects corruption.
3. **Frame magic** (per frame): `"FR"` + index validates frame boundaries.
4. **Panel parity** (per block): header byte bit 7 detects transmission errors.

(Maintenance note: the in-memory `pattern.version` field in `g6_save_pattern.m` is unused by the binary writer and should be removed in a future maDisplayTools cleanup commit.)

## Controller Operation (aspirational; no G6 controller firmware exists yet)

This section describes how a G6 controller will read pattern files when one is built. The G4.1 slim controller (`floesche/LED-Display_G4.1_ArenaController_Slim`) reads G4 patterns, not G6 `.pat` files. The controller-spec work continues in [`g6_03-controller.md`](g6_03-controller.md).

### Reading pattern files

1. Read 18-byte header.
2. Validate magic `"G6PT"` and version (= 2 in v2).
3. Extract `frame_count`, `row_count`, `col_count`, `gs_val`, `panel_mask`, Arena ID, Observer ID.
4. Verify `row_count × col_count ≤ 48`.
5. (Optional) Compute and verify checksum over frame data.
6. For each frame:
   - Read frame magic `"FR"` and `frame_index` (4 bytes).
   - (Optional) Verify `frame_index` matches the expected sequence value.
   - Read all panel blocks sequentially.
   - For each panel block: (optional) validate parity in header byte, then transmit entire block (53 or 203 bytes) directly to the panel via SPI.

### Transmission

Controller transmits panel blocks **without modification**: enable chip-select for the panel, clock out the entire panel block (`header + command + pixels + stretch`), repeat for all panels in the panel set, disable chip-select. **Pre-formatted blocks eliminate controller overhead** for parity calculation and message assembly.

## PC Host Responsibilities (per `maDisplayTools` v2 implementation)

The PC host (MATLAB / Python / web) generates pattern files:

1. **Arena configuration**: define panel layout, orientations, LED mapping. Canonical: `g6_arena_config()` in MATLAB or the `webDisplayTools` equivalent.
2. **Pattern generation**: create full-arena frames as 3D pixel arrays `(total_rows, total_cols, num_frames)` — e.g., `(40, 200, num_frames)` for a 2×10 arena (each panel is 20×20).
3. **Panel block formatting** (per panel, per frame):
   - Compute parity per G6 Panel Protocol v1.
   - Insert header byte (`0x01` or `0x81`) and command byte (`0x10` GS2 / `0x30` GS16).
   - Pack pixels per G6 panel format (row-major, MSB-first, bottom-left origin; flip MATLAB row → panel row via `row_from_bottom = 19 - row`).
   - Append stretch value.
4. **Frame assembly**: prepend `"FR"` magic and frame index to panel blocks.
5. **Checksum**: compute XOR over all frame data, store in header byte 17.
6. **File writing**: 18-byte header followed by all frames.

Cross-reference: [`Generation 6/maDisplayTools/docs/patterns.md`](../../Generation%206/maDisplayTools/docs/patterns.md) for user-facing docs on where generated `.pat` files live and how to regenerate reference patterns.

---

## Panel Map (subsumed into pattern header in v2)

The original Google Doc had a separate "Panel Map proposal" tab defining a standalone host-supplied panel map file with three-byte entries `[region, panel_row, panel_col]` per panel. **In v2 implementation, that file is gone** — the pattern header carries `row_count`, `col_count`, and the 6-byte panel mask, which together capture everything except region/SPI-bus assignment. The source doc itself anticipated this consolidation: *"Now that you have specified everything so well, this entire table can be boiled down to 5 bytes: row_count, col_count, and a 3-byte bit mask. Will consider putting these bytes in a pattern header rather than storing them in a separate file."* — exactly what v2 does (with a 6-byte mask supporting up to 48 panels).

For the production [`arena_10-10`](g6_07-arena-firmware-interface.md) hardware, the implicit rule "columns 0–4 → region 0, 5–9 → region 1" works today — region/SPI assignment is hardware-determined, not pattern-file-determined. **For future arenas with different region/bus layouts, the canonical source for region info is still TBD.**

> **⚠ Flag — region/SPI info source for non-`arena_10-10` arenas.** Three candidate sources: (a) computed from `col_count` + a fixed regions-per-arena setting (works only if the rule generalizes — fragile for asymmetric arenas); (b) sidecar arena-config file alongside `.pat` files (more flexible, more files); (c) embed per-panel region in a future header rev (would push past 18 bytes). User direction (2026-05-02): keep this flag live and investigate whether the existing `maDisplayTools` arena-config files already capture this for the host side, and whether the controller actually needs region info beyond what's compiled into firmware. Resolve before a non-arena_10-10 G6 arena is built.

---

## Open Questions / TBDs

1. **Region / SPI-bus information for non-`arena_10-10` arenas.** See flag in § Panel Map above — investigate whether `maDisplayTools` arena-config files already cover this on the host side, and whether the controller actually needs region info beyond compiled-in firmware constants.
2. **`num_frames` allowed values.** Spec implies 0–65,535; implementation rejects 0. Confirm 0 is invalid (or update implementation to accept it).
3. **Arena ID + Observer ID semantics.** Spec out: 6-bit ranges, what they mean to the controller, defaults. Without firmware that reads them, they're metadata only today (defaults 0/0 in impl).
4. **No G6 controller firmware exists.** All Controller Operation steps above are aspirational; G4.1 slim is a G4 baseline only. G6 controller scoping happens in [`g6_03-controller.md`](g6_03-controller.md).
5. **Lift `g6_encoding_reference.json` into the spec as the normative pixel-encoding reference.** Currently a maDisplayTools internal artifact; should be cited as canonical.

## Cross-references

- [Source Google Doc, "Pattern Format / Panel Map" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [Source Google Doc, "Panel Map proposal" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — merged into this file
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — Panel block format references panel-protocol v1 header byte, command byte, parity rule, payload sizes
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — pixel ↔ LED designator mapping
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side reading of pattern files; G6 controller doesn't exist yet
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side workflow
- [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md) — production `arena_10-10` topology (fills the region/SPI gap)
- [Generation 6/maDisplayTools/g6/g6_save_pattern.m](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m) — canonical v2 `.pat` writer
- [Generation 6/maDisplayTools/g6/g6_encode_panel.m](../../Generation%206/maDisplayTools/g6/g6_encode_panel.m) — panel-block encoder
- [Generation 6/maDisplayTools/g6/g6_encoding_reference.json](../../Generation%206/maDisplayTools/g6/g6_encoding_reference.json) — JSON test vectors validated by `maDisplayTools` and `webDisplayTools`
