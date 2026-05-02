# G6 — Architecture

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Introduction", lines 1–60) · Last reviewed: 2026-05-02 by mreiser
Status: **Draft** — system architecture and assumptions are stable; minor prose-tightening items in Open Questions.

This page captures the system-level architecture of the G6 modular LED display: the host / controller / panel split, the responsibilities each layer owns, and the small set of cross-cutting conventions (endianness, bit packing) that propagate into every other spec file.

## Current state

- **Architecture is stable enough to drive development.** Hardware is in production (Arena `v1.1.7`, Panels `v0p2r0` with `v0.3.0` in draft); panel firmware is being written in [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) (last push 2026-02-12); the G4-baseline controller is in [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim).
- The cross-cutting conventions in this file (little-endian, MSB-first pixel packing, common panel-message-format scaffolding across protocol versions) are referenced from every other file in this dev set.

## General Architecture

The **host** is the computer running MATLAB or Python based software. It talks to the **controller** (currently a Teensy 4.1 on the arena board) via Ethernet (TCP, port 62222 — see [`g6_03-controller.md`](g6_03-controller.md) § 1 Host Interface). The controller communicates to a set of **panels** via SPI, currently grouped in 2 SPI buses (concrete for the production `arena_10-10`; the panel map can specify other counts).

```
   ┌──────────────────────────┐
   │           Host           │  PC running MATLAB / Python
   │  (LED mapping, layout,   │
   │   pattern composition)   │
   └────────────┬─────────────┘
                │  Ethernet / TCP
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

**LED mapping is two-stage** (decision 2026-05-02):

- **Host** owns the *logical → schematic* mapping: handles per-panel rotation/flip and panel position in the arena, producing 20×20 subframes in the panel's own "schematic pixel" coordinate system.
- **Panel firmware** owns the *schematic → physical-pin* mapping: applies the PCB-layout-driven remap (e.g., `display.cpp::sch_to_pos_index()` in `g6_firmware_devel @ 6944894`, with the `NUM_COLOR = 4` quadrant scheme) to convert schematic-pixel index to actual COL/ROW drive pins.
- The G6 controller sees patterns only as sequences of 20×20 subframes, ordered by panel number already mapped by the host. Controller packs pixels and forwards them per the G6 panel protocol — it does **not** apply LED mapping.

(Note: the source spec mentioned "color-LED organization (until we decide to make the panels 'color-aware' in v4/5)" — current v4 and v5 do not specify color awareness; the parenthetical is dropped, captured in Open Q #1.)

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

## Open Questions / TBDs

1. **Color-LED organization** — original source spec referred to "color-aware in v4/v5", but neither v4 (predefined patterns + stretch) nor v5 (sketch) currently specify color support. Aspirational; revisit when color support is actually specced.
2. **Stateless-panel vs mode-flag question** (carried over from precursor) — v1's Oneshot-only model is consistent with the stateless approach, but v3's Triggered/Gated commands re-open the question. Defer to firmware investigation against `G6_Panels_Test_Firmware`.
3. **Architecture-prose tightening** (non-blocking) — minor items: (a) "controller never needs to know spatial layout" is overreach for Mode 4 closed-loop; (b) "Endianess" → "Endianness" typo on §; (c) common-message-format claim should be reworded once g6_01 master command summary has v1–v4 version-bits clearly tabled. Bundle for next pass.

## History & Reconciliation

**Design history of the v1 protocol scaffolding.** The 1-byte header with parity bit in MSB + 1-byte command + payload was selected over an earlier proposal from `<will@iorodeo.com>` that used `(uint16 length)(uint16 type)` framing. The earlier framing is captured in [`G6 message format proposal`](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) (~18 KB). Two carry-overs from that precursor:

- **Pattern data is row-major, MSB-first within each byte** — convention from precursor's "Pattern data payloads" section, normative in v1 (see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format).
- **Display modes (oneshot / triggered / gated / persistent)** — precursor sketched these as separate command types per pattern level; v1 starts with Oneshot only, with Triggered + Gated landing in v3 (Persistent reserved but deferred).

### Major decisions log

- **2026-05-01** — TCP-only host↔controller transport adopted (commit `46264ae`); replaces UDP from earlier draft.
- **2026-05-02** — v3 mode set finalized: Triggered + Gated + (Persistent deferred); Gated-Persistent dropped (commit `a334004` in `g6_01`).
- **2026-05-02** — Panel hardware reference for v0.2 + v0.3 captured in [`g6_02-led-mapping.md`](g6_02-led-mapping.md) (commits `a805e59` + `6450445`).
- **2026-05-02** — LED-mapping layering decided: two-stage model (host: logical→schematic; firmware: schematic→physical-pin). Resolves D5 from `g6_01` Live Divergences.

## Cross-references

- [Source Google Doc, "Introduction" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this file.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — alt framing, design questions cited above.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — header byte, command byte, parity rule, payload formats, master command summary.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Panel Map — panel mask layout + region/SPI-bus open question.
- [`g6_03-controller.md`](g6_03-controller.md) — Teensy controller responsibilities; reconciled against the G4.1 slim controller.
- [`Generation 6/Arena/docs/arena.md`](../../Generation%206/Arena/docs/arena.md) (in submodule, currently uninitialized locally) — built arena hardware, current revision `v1.1.7`.
