# G6 — Architecture

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Introduction", lines 1–60) · Last reviewed: 2026-05-01 by mreiser
Status: **Draft** — system architecture and assumptions are stable; a few inline flags note inconsistencies and missing details to resolve in the next pass.

This page captures the system-level architecture of the G6 modular LED display: the host / controller / panel split, the responsibilities each layer owns, and the small set of cross-cutting conventions (endianness, bit packing) that propagate into every other spec file.

## Current state

- **Architecture is stable enough to drive development.** Hardware is in production (Arena `v1.1.7`, Panels `v0p2r0` with `v0.3.0` in draft); panel firmware is being written in [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) (last push 2026-02-12); the G4-baseline controller is in [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim).
- The cross-cutting conventions in this file (little-endian, MSB-first pixel packing, common panel-message-format scaffolding across protocol versions) are referenced from every other file in this dev set.

## General Architecture

The **host** is the computer running MATLAB or Python based software. It talks to the **controller** (currently a Teensy 4.1 on the arena board) via ethernet and UDP. The controller communicates to a set of **panels** via SPI, currently grouped in 2 SPI buses.

```
   ┌──────────────────────────┐
   │           Host           │  PC running MATLAB / Python
   │  (LED mapping, layout,   │
   │   pattern composition)   │
   └────────────┬─────────────┘
                │  Ethernet / UDP
                ▼
   ┌──────────────────────────┐
   │        Controller        │  Teensy 4.1 on the arena board
   │  (PanelMap, frame slice, │
   │   SPI framing + parity)  │
   └────────────┬─────────────┘
                │  SPI  (currently 2 buses, by region; CS by row)
        ┌───────┼───────┬───────────┐
        ▼       ▼       ▼           ▼
     ┌─────┐ ┌─────┐ ┌─────┐ ... ┌─────┐
     │Panel│ │Panel│ │Panel│     │Panel│   20×20 LED tiles
     └─────┘ └─────┘ └─────┘     └─────┘
```

The Teensy 4.1 + 2-SPI-bus configuration is concrete for the current production arena (`arena_10-10` v1.1.7 — see [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md)). The architecture description stays loose to allow other counts in future hardware; per-arena topology lives in `g6_07`, not in this overview.

## General assumptions

### Host responsibilities

**Host owns LED mapping (pixel → physical LED)**

- The PC host is responsible for per-panel LED mapping, including:
  - corrections for rotated / flipped panels.
  - color-LED organization (until we decide to make the panels 'color-aware' in v4/5).
- The G6 controller sees patterns only as sequences of 20×20 subframes, ordered by panel number already mapped by the host. Controller then packs pixels and forwards them to the appropriate panel according to the G6 panel protocol.

(The "color-aware in v4/5" parenthetical from the source is a stale hand-wave — current [v4](g6_01-panel-protocol.md) (predefined patterns + stretch) and v5 (sketch) do not specify color awareness. Treat as aspirational; revisit when color support is actually specced.)

**Host owns arena / panel layout**

- The PC host also defines how multiple panels are arranged in space (arena layout).
- The controller does not need to know **spatial** layout (which panel is top-left, panel orientation, etc.) — it just treats panels as indices `0..N-1` and dispatches each block to the appropriate SPI bus per panel ID.
- The controller does maintain **temporal** position via frame indices (e.g., Mode 4 closed-loop integrates an analog input into a frame index, walking the frame sequence). Layout still belongs to the host; sequencing belongs to the controller.

### Controller responsibilities

The controller receives commands from the host, potentially reads patterns from the internal storage (SD), sends panel-specific commands via SPI, and receives their response.

The mapping between panel ID and physical hardware is done through a **panelMap** structure (basically the arena-specific configuration).

The controller stores a [PanelMap data structure](g6_04-pattern-file-format.md#panel-map-subsumed-into-pattern-header-in-v2) that specifies which panel IDs are assigned to which SPI bus and the chip-select information, as needed.

Panel message format is common to all protocol versions and is as specified in the other tabs of this document, e.g. for [Panel Protocol v1](g6_01-panel-protocol.md):

- version bits are `0b0000001`, giving possible header values:
  - `0x01` (`0b00000001`) — when parity bit = 0
  - `0x81` (`0b10000001`) — when parity bit = 1

More precisely: the **scaffolding is common** (`[header byte][command byte][payload…]` shape, parity-bit-in-MSB convention) and the **version field in the header byte selects which command set applies** (v1 = `0b0000001`, v2 = `0b0000010`, v3 = `0b0000011`, v4 = `0b0000100`). See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) for the per-version command tables.

### Panel responsibilities

The panel receives commands via SPI and returns confirmations according to the [Panel protocol](g6_01-panel-protocol.md).

### Endianness and Bit Packing

- Little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

## Design history

The v1 protocol scaffolding (1-byte header with parity bit in MSB + 1-byte command + payload) was selected over an earlier proposal from will@iorodeo.com that used a `(uint16 length)(uint16 type)` framing. The earlier framing is captured in [`G6 message format proposal`](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) (~18 KB). Two carry-overs from that precursor:

- **Pattern data is row-major, MSB-first within each byte** — this convention originated in the precursor's "Pattern data payloads" section and is normative in v1 (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format).
- **Display modes (oneshot / persistent / trigger)** — the precursor sketched these as separate command types per pattern level (e.g., "2-level grayscale (oneshot)", "2-level grayscale (trigger)", "2-level grayscale (persistent)"); v1 starts with oneshot only and the trigger/persistent variants land in v3.

> **⚠ Flag — open question carried over from precursor:** "stateless panel with mode-per-command" vs. "panel mode-flag set by separate command". The precursor explicitly asked this question. v1's oneshot-only model is consistent with the stateless approach, but v3's gated/persistent commands re-open the question (see [`g6_01-panel-protocol.md` § v3 Open Questions](g6_01-panel-protocol.md)).

## Open Questions / TBDs

1. **`color-aware in v4/5` forward reference** — the v4/v5 sections do not currently specify color support. Decide whether to (a) keep the parenthetical and add concrete color-spec content to v4/v5, (b) move it to a dedicated future-version stub, or (c) drop it from the host-responsibilities text.
2. **"Currently 2 SPI buses" coupling** — the architecture text reads as if 2 buses is normative. The actual normative source is the [Panel Map](g6_04-pattern-file-format.md#panel-map-subsumed-into-pattern-header-in-v2) (`region` field, `0..255` possible). Decide whether to replace the prose claim with "the panel map specifies the bus count" or to retain the present-tense observation as informational.
3. **"Controller never needs to know spatial layout" overreach** — see flag in § Host responsibilities. Decide on the precise wording so Mode 4 (Closed Loop Velocity) doesn't get accidentally restricted by the architecture-doc claim.
4. **Common-message-format claim** — see flag in § Controller responsibilities. Reword once `g6_01-panel-protocol.md` § master command summary has the v1–v4 version-bits clearly tabled.
5. **"Endianess" typo** — fix on the next pass; not blocking.
6. **Stateless-panel vs. mode-flag question (carried over from precursor)** — defer to the v3 reconciliation (in [`g6_01-panel-protocol.md` § v3](g6_01-panel-protocol.md)) when we cross-check what `G6_Panels_Test_Firmware` actually implements.

## Cross-references

- [Source Google Doc, "Introduction" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this file.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — alt framing, design questions cited above.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — header byte, command byte, parity rule, payload formats, master command summary.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Panel Map — panel mask layout + region/SPI-bus open question.
- [`g6_03-controller.md`](g6_03-controller.md) — Teensy controller responsibilities; reconciled against the G4.1 slim controller.
- [`Generation 6/Arena/docs/arena.md`](../../Generation%206/Arena/docs/arena.md) (in submodule, currently uninitialized locally) — built arena hardware, current revision `v1.1.7`.
