# G6 — Arena Firmware Interface

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "G6 arena design (v1/v2)", lines 2484–2523), reconciled against the actual designed arena hardware ([`reiserlab/LED-Display_G6_Hardware_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) @ `a9ab466e`; first production run = `v1.1.7`, ordered 2026-04-28; design at `arena_10-10/arena_10-10_v1/production/v1p1r7/`) · Last reviewed: 2026-05-02 by mreiser
Status: **Thin firmware-interface reference.** Per the prior plan's "Arena Design Tab Decision", the source-tab content is informational/historical and **superseded by the actual built arena hardware**. Rather than migrate the source tab as-is, this file pulls only the firmware-relevant facts the controller doc ([`g6_03-controller.md`](g6_03-controller.md)) and the v3 trigger work need. **Authoritative documentation lives in the `Generation 6/Arena` submodule (`docs/arena.md`); do not duplicate hardware details here.**

## Authoritative source

- **Production arena hardware:** [`reiserlab/LED-Display_G6_Hardware_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) (in this clone as the `Generation 6/Arena` submodule, currently uninitialized — pinned at `a9ab466e`, blocked on SSH host-key trust). Repository contents read via `gh api` for this dev doc:
  - `README.md` — top-level summary; declares v1.1.7 as the first large production run (ordered 2026-04-28)
  - `docs/arena.md` — current arena-overview doc (rev history, what's in the design, recommended build); currently still recommends v1p1r6 for new builds — **slightly behind reality at v1.1.7**
  - `arena_10-10/arena_10-10_v1/production/v1p1r7/` — actually-ordered revision design files (also v1p1, v1p1r2, …, v1p1r6 archived)
  - `arena_10-10/arena_10-10_v1/assets/arena_10_of_10_v1r1.pdf` — schematic PDF (firmware-relevant pin assignments live here; not extracted into this dev doc)

- **Test arena (historical, dev-only, not used):** [`reiserlab/LED-Display_G6_Hardware_Test_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Test_Arena) (in this clone as the `Generation 6/Hardware` submodule). Per its own `docs/test-arena.md`: "intended as a development platform for arena firmware, but it was never actually used … this test arena should not be the default starting point". Captured here only because the dev-set README's status table lists it as a sibling of the production arena; firmware work targets the production arena, not the test arena.

> **⚠ Flag — pin assignments are not extracted into this dev doc.** Specific Teensy GPIO numbers for each CS line, AO/AI/DO line, and EINT input are in `arena_10_of_10_v1r1.pdf` and the `analog.kicad_sch` / `teensy.kicad_sch` / `panels.kicad_sch` schematic sheets. Pin-level extraction is required before the G6 controller firmware can be written; either add a per-pin table to this file by reading the KiCad netlist, or treat the schematic PDF as the authoritative wiring reference and link to it from `g6_03-controller.md`.

> **⚠ Flag — `docs/arena.md` lags the README.** The production Arena `README.md` declares v1.1.7 as the production run; `docs/arena.md` still recommends v1p1r6. The KiCad project root `arena_10_of_10_v1r1.kicad_pro` keeps a `_v1r1` filename even at later revisions. Reconcile (probably by updating `docs/arena.md`) or note the version mapping convention here.

---

## Firmware-relevant facts

### Controller hardware

- **Teensy 4.1** with **Ethernet** (RJ45 magjack); the schematic uses the `teensy:Teensy4.1_Ethernet_Only` footprint.
- **Teensy is not part of the arena BOM** — buy separately, plug into the on-board Teensy headers.
- Ethernet is the host link (TCP-on-port-62222 framing per [`g6_03-controller.md`](g6_03-controller.md)).

### SPI region-to-bus mapping

The 10-10 arena has **two SPI buses**, each driving five panel columns:

| SPI bus | Panel columns served (hardware silk) | Equivalent (0-indexed, spec wording) |
|---|---|---|
| **B0** | P1, P2, P3, P4, P5 | columns 0–4 → region 0 |
| **B1** | P6, P7, P8, P9, P10 | columns 5–9 → region 1 |

This matches the source spec exactly (the spec uses 0-indexed columns, the hardware silk uses 1-indexed P-numbers — same mapping). Each panel column has dedicated chip-select routing (10 CS lines total).

External-interrupt routing is also present per panel column — see "Experiment I/O" below for the EINT line that's exposed to firmware.

### Experiment I/O

Per `docs/arena.md` § Experiment I/O (which paraphrases `analog.kicad_sch`):

| Line | Type | Range | Count | Source spec asked for | As-built |
|---|---|---|---|---|---|
| AO | Analog output | 0–5 V | 1 | "at least one ... 0-5V, sufficient current to drive external hardware" | ✓ matches |
| AI | Analog input | ±10 V | **2** | "at least one ... -5V to +5V" | ✓ exceeds spec on count and range |
| DI/DO | Digital I/O | 0–5 V | 1 | "at least one digital output line ... 5V ideal" | ✓ implemented as bidirectional |
| EINT | External interrupt | digital | 1 | not in source tab | ✓ added by hardware design |

**I/O power supply:** [Recom RB-0515D](https://octopart.com/part/recom-power/RB-0515D) DC-DC isolated module powers the I/O sub-circuit. **Not in BOM** — solder by hand after arena receipt. Firmware does not need to manage this part; flagged here so bring-up procedures know it's a manual step.

### Connector form-factor

The source spec asked for "right-angle, PCB-mounted BNC connectors for these I/O lines". The as-built connector type is **not stated in `docs/arena.md`** — verify against `arena_10_of_10_v1r1.pdf` or production photos before writing host-side cabling/breakout assumptions.

### Power and on/off

- Two DC barrel-jack connectors:
  - **J25** — main power input from supply
  - **J26** — distributes power to a separate top board (top-board design not yet published in G6 hardware repo)
- **Power switch** — added in `v1p1r2` per `docs/arena.md` revision history. Provides Teensy power-cycle without unplugging USB/barrel-jack. Source spec requested this; ✓ implemented.

### Mode 4 / closed-loop relevance

The source spec calls out the AI line specifically for "flight arena experiments (for mode 4 closed loop), so could be pushed to later version". Reconciled status:

- The slim G4.1 controller has `gain_` stored but never read (`CommandProcessor.cpp:233-248`); closed loop runs on an internal counter, not a real analog input.
- The G6 arena exposes **two ±10 V analog inputs** that the controller firmware can read.
- Mapping decision: does Mode 4 read a single AI line (and which one), or both? Single is the spec-implied default; two would let host-supplied gain react to two independent voltages (e.g., x and y axes for a 2-axis joystick or a fly-on-ball setup). Defer to the controller doc.

> **⚠ Flag — closed-loop wiring contract is unspecified.** Source spec is silent on which of the two AI lines drives Mode 4; whether AI is sampled at the `analog_closed_loop_frequency_hz=200` rate (slim default) or differently for G6; whether the gain field in `trial-params` scales the AI reading, integrates it, or is unused. Resolve in [`g6_03-controller.md`](g6_03-controller.md) Open Question #8.

### v3 gated/persistent display relevance

The arena exposes **one EINT line** that the firmware can use as a v3 trigger source. Cross-references:

- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v3 documents the panel-side gated/persistent/triggered modes and flags two open issues (trigger edge polarity, sync-vs-async gating semantics) — those decisions interact with how this EINT line is driven on the arena side.
- The slim G4.1 controller has no input pins beyond CS lines; v3 trigger wiring is **net-new for G6** and depends on this arena EINT line.

> **⚠ Flag — EINT availability vs trigger panel-side.** The source spec for v3 talks about a trigger line *to the panels* (gating their display mode). The arena's EINT can be wired either as (a) a host-driven input the controller reads to clock its own state machine, or (b) a controller-driven output to the panels' trigger pins. Both interpretations are consistent with current schematics; pick before the controller doc commits to a specific wiring.

### v2 PSRAM / Mode 1 (TSI DO/AO) relevance

The source spec for Mode 1 TSI files defines a 5-byte record `[FrameIndex16, DO, AO_lo, AO_hi]` with both DO and AO output lines' pin assignments noted as "depending on arena design". Reconciled:

- The arena exposes **1 AO** (0-5V) and **1 DO** (0-5V).
- The TSI record's DO byte (1 byte) → encodes a single digital output state; arena has 1 DO line → straightforward mapping.
- The TSI record's AO field (16 bits) → encodes a single analog output sample; arena has 1 AO line → single-channel.
- **The source spec floated "2 AO lines might be interesting, depending on arena design".** As-built has 1 AO. If a future TSI variant wants 2-channel AO, the arena would need a re-spin (or repurpose one of the AI lines as bidirectional, which the schematic does not currently support).

---

## Open Questions / TBDs

1. **Per-pin Teensy GPIO assignments** for: 10 CS lines, AO line, 2× AI lines, DI/DO line, EINT line. Required before any G6 controller firmware can be written. Extract from `arena_10_of_10_v1r1.pdf` or the KiCad netlist.
2. **Connector form-factor on I/O lines.** Source spec requested right-angle PCB-mounted BNC; as-built type not confirmed from available docs. Verify.
3. **`docs/arena.md` lags reality at v1.1.7.** Either update the submodule's docs or note the version-mapping convention here.
4. **Mode 4 AI line selection** — which of the two AI lines, sampling rate, gain semantics. Cross-doc with `g6_03` Open Question #8.
5. **EINT direction for v3 gating** — input to controller or output to panels? Picks the v3 trigger wiring contract.
6. **Top-board design (J26 use).** Not yet published. If a future controller doc surfaces a need, this is the place.
7. **Multi-arena variant** (8-of-10 columns / "288° stimulated / 72° gap behind", per source spec). Production Arena `arena_10-10` is the only published variant; the 8-of-10 case is handled today via the panel mask in the v2 pattern header (see [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md)) without requiring a different PCB.
8. **2-channel AO future.** If the spec ever firms up two AO lines for TSI-driven experiments, an arena re-spin is required.

---

## Cross-references

- [Source Google Doc, "G6 arena design (v1/v2)" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [`Generation 6/Arena/docs/arena.md`](../../Generation%206/Arena/docs/arena.md) — authoritative arena hardware reference (in submodule, currently uninitialized in this clone)
- [reiserlab/LED-Display_G6_Hardware_Arena](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) — production arena submodule remote (used to populate this doc via `gh api`)
- [reiserlab/LED-Display_G6_Hardware_Test_Arena](https://github.com/reiserlab/LED-Display_G6_Hardware_Test_Arena) — historical/never-used dev test arena
- [`g6_00-architecture.md`](g6_00-architecture.md) — host/controller/panel split; the arena hosts the controller
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — panel protocol; v3 trigger semantics interact with the EINT line on this arena
- [`g6_03-controller.md`](g6_03-controller.md) — controller doc; arena facts here resolve open questions about CS-line topology, AI source for Mode 4, EINT for v3 gating
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side concerns; arena geometry must be supplied from host since controller is geometry-ignorant
