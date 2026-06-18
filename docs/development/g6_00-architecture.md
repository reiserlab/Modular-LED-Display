# G6 — Architecture

Source: G6 panels protocol v1 proposal ([Google Doc `17crYq4s...`](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#), tab "Introduction").
Status: **Draft** — system architecture and assumptions are stable; minor prose-tightening items in Open Questions.

This page captures the system-level architecture of the G6 modular LED display: the host / controller / panel split, the responsibilities each layer owns, and the small set of cross-cutting conventions (endianness, bit packing) that propagate into every other spec file.

## Current state

- **Architecture is stable enough to drive development.** Hardware is in production (Arena `v1.1.7`, Panels `v0p2r0` with `v0.3.0` in draft); panel firmware is being written in [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel); the G4-baseline controller is in [`floesche/LED-Display_G4.1_ArenaController_Slim`](https://github.com/floesche/LED-Display_G4.1_ArenaController_Slim).
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

The Teensy 4.1 + 2-SPI-bus configuration is concrete for the current production arena (`arena_10-10` v1.1.7 — see [`g6_06-arena-firmware-interface.md`](g6_06-arena-firmware-interface.md)). The architecture description stays loose to allow other counts in future hardware; per-arena topology lives in `g6_06`, not in this overview.

## General assumptions

### Host responsibilities

**LED mapping is two-stage:**

- **Host** owns the *logical → schematic* mapping: handles per-panel rotation/flip and panel position in the arena, producing 20×20 subframes in the panel's own "schematic pixel" coordinate system.
- **Panel firmware** owns the *schematic → physical-pin* mapping: applies the PCB-layout-driven remap (e.g., `display.cpp::sch_to_pos_index()` in `g6_firmware_devel @ 6944894`, with the `NUM_COLOR = 4` quadrant scheme) to convert schematic-pixel index to actual COL/ROW drive pins.
- The G6 controller sees patterns only as sequences of 20×20 subframes, ordered by panel number already mapped by the host. Controller packs pixels and forwards them per the G6 panel protocol — it does **not** apply LED mapping.

**Host owns arena / panel layout**

- The PC host also defines how multiple panels are arranged in space (arena layout).
- The controller does not need to know **spatial** layout (which panel is top-left, panel orientation, etc.) — it just treats panels as indices `0..N-1` and dispatches each block to the appropriate SPI bus per panel ID.
- The controller does maintain **temporal** position via frame indices (e.g., Mode 4 closed-loop integrates an analog input into a frame index, walking the frame sequence). Layout still belongs to the host; sequencing belongs to the controller.

### Controller responsibilities

The controller receives commands from the host, potentially reads patterns from the internal storage (SD), sends panel-specific commands via SPI, and receives their response.

The mapping between panel ID and physical hardware is done through a **panelMap** structure (basically the arena-specific configuration).

The controller looks up the panel map by Arena ID (from the pattern header) in the compiled-in [`g6_arena_configs.h`](g6_arena_configs.h) table — single source of truth shared with `maDisplayTools`. The table specifies, per panel, which SPI bus and chip-select line to use.

Panel message format is common to all protocol versions and is as specified in the other tabs of this document, e.g. for [Panel Protocol v1](g6_01-panel-protocol.md):

- version bits are `0b0000001`, giving possible header values:
  - `0x01` (`0b00000001`) — when parity bit = 0
  - `0x81` (`0b10000001`) — when parity bit = 1

More precisely: the **scaffolding is common** (`[header byte][command byte][payload…]` shape, parity-bit-in-MSB convention) and the **version field in the header byte selects which command set applies** (v1 = `0b0000001` live-SPI display, v2 = `0b0000010` PSRAM-backed display, v3 = `0b0000011` diagnostics + predefined patterns + future feature classes). See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) for the per-version command tables.

### Panel responsibilities

The panel receives commands via SPI and returns confirmations according to the [Panel protocol](g6_01-panel-protocol.md).

### Endianness and Bit Packing

- Little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

## Open Questions / TBDs

1. **Color-LED organization** — original source spec referred to "color-aware in v4/v5"; under the post-restructure V1/V2/V3 themes (live SPI / PSRAM / everything-else), color support is part of v3 § Future feature classes. Aspirational; revisit when color support is actually specced.
2. **Stateless-panel vs mode-flag question.** v1's controller-driven one-shot model (Oneshot, Triggered, Gated all one-shot per command; Persistent the special case) is consistent with the stateless approach. The Triggered/Gated open questions (exact pattern-consumption semantics — see g6_01-panel-protocol.md § `0x12` / `0x13`) need design review before v1 firmware ships those commands.

## Cross-references

- [Source Google Doc, "Introduction" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this file.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — alt framing, design questions cited above.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — header byte, command byte, parity rule, payload formats, master command summary.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) § Panel Map — panel mask layout + region/SPI-bus open question.
- [`g6_03-controller.md`](g6_03-controller.md) — Teensy controller responsibilities; reconciled against the G4.1 slim controller.
- [`Generation 6/Arena/docs/arena.md`](../../Generation%206/Arena/docs/arena.md) (in submodule) — built arena hardware, current revision `v1.1.7`.
