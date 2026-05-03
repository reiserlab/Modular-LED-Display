# G6 — Arena Firmware Interface

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "G6 arena design (v1/v2)", lines 2484–2523), reconciled against the actual designed arena hardware ([`reiserlab/LED-Display_G6_Hardware_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena); first production run = `v1.1.7`, ordered 2026-04-28; design at `arena_10-10/arena_10-10_v1/production/v1p1r7/`; pin assignments extracted from KiCad sources at `0a8ec33c`) · Last reviewed: 2026-05-02 by mreiser
Status: **Thin firmware-interface reference with extracted pin assignments.** Per the prior plan's "Arena Design Tab Decision", the source-tab content is informational/historical and **superseded by the actual built arena hardware**. Rather than migrate the source tab as-is, this file pulls only the firmware-relevant facts the controller doc ([`g6_03-controller.md`](g6_03-controller.md)) and the v3 trigger work need, plus a per-peripheral Teensy 4.1 pin table extracted from the KiCad schematics. **Authoritative documentation lives in the `Generation 6/Arena` submodule (`docs/arena.md`); do not duplicate hardware details here.**

## Authoritative source

- **Production arena hardware:** [`reiserlab/LED-Display_G6_Hardware_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) (in this clone as the `Generation 6/Arena` submodule, currently uninitialized — pinned at `a9ab466e`, blocked on SSH host-key trust). Repository contents read via `gh api`:
  - `README.md` — top-level summary; declares v1.1.7 as the first large production run (ordered 2026-04-28)
  - `docs/arena.md` — current arena-overview doc (rev history, what's in the design, recommended build); currently still recommends v1p1r6 for new builds — **slightly behind reality at v1.1.7**
  - `arena_10-10/arena_10-10_v1/production/v1p1r7/` — actually-ordered revision design files, including `netlist.ipc` (IPC-D-356A), `bom.csv`, `positions.csv`, `designators.csv`, and the manufacturing zip
  - `arena_10-10/arena_10-10_v1/{teensy,analog,panels,panel_column,power,fan_out,column_buffer,miso_enable}.kicad_sch` — editable KiCad sub-sheets (S-expression format) read at SHA `0a8ec33c` (the v1.1.7 bump commit) for the pin table below
  - `arena_10-10/arena_10-10_v1/assets/arena_10_of_10_v1r1.pdf` — schematic PDF rendered from the same sources

- **Test arena (historical, dev-only, not used):** [`reiserlab/LED-Display_G6_Hardware_Test_Arena`](https://github.com/reiserlab/LED-Display_G6_Hardware_Test_Arena) (in this clone as the `Generation 6/Hardware` submodule). Per its own `docs/test-arena.md`: "intended as a development platform for arena firmware, but it was never actually used … this test arena should not be the default starting point". Captured here only because the dev-set README's status table lists it as a sibling of the production arena; firmware work targets the production arena, not the test arena.

**💡 Note — version-mapping in the Arena submodule:** the production Arena `README.md` declares v1.1.7 as the current production run, but `docs/arena.md` still recommends v1p1r6 and the KiCad project root keeps a `_v1r1` filename across revisions. Out-of-band action item for the upstream Arena repo to reconcile; not a spec question for this dev set.

---

## Pin assignments

Extracted from the KiCad sources at SHA `0a8ec33c` (last commit touching `arena_10-10/arena_10-10_v1/`, 2026-04-28 — v1.1.7 production bump). Methodology: parsed the `Teensy4.1_Ethernet_Only` symbol from `teensy.kicad_sch` for the 54 footprint pins, then BFS-traced each pin's wires + series resistors + bus entries to the nearest local-name label, then cross-referenced labels with the per-peripheral sheets (`panels.kicad_sch`, `analog.kicad_sch`, `power.kicad_sch`) and validated against the production `netlist.ipc`. **Two pin-number conventions matter:** the `Teensy pin` column uses the footprint pin number (1–48 around the perimeter, 60–65 for the magjack vias); the `GPIO label` column uses the canonical Teensy 4.1 silk-screen pin name (e.g. `D13`).

| Peripheral group | Function | Teensy pin | GPIO label | Net name | Notes |
|---|---|---|---|---|---|
| **SPI bus B0 (P1–P5)** | MOSI | 13 | D11 | `TNY.MOSI_B0` | |
| | MISO | 14 | D12 | `TNY.MISO_B0` | |
| | SCK | 35 | **D13** | `TNY.SCK_B0` | ⚠ Shares pin with Teensy on-board LED — see flag below |
| **SPI bus B1 (P6–P10)** | MOSI | 18 | D26 | `TNY.MOSI_B1` | |
| | MISO | 3 | D1 | `TNY.MISO_B1` | |
| | SCK | 19 | D27 | `TNY.SCK_B1` | |
| **Panel CS lines (20 distinct Teensy GPIOs, 4 per panel column, shared across buses)** | P1 (B0) / P6 (B1) — CS0..CS3 | 2, 4, 5, 6 | D0, D2, D3, D4 | `TNY.CS_00..CS_03` | Same pins gate column 1 on B0 *and* column 6 on B1; bus separation prevents collision |
| | P2 (B0) / P7 (B1) — CS0..CS3 | 7, 8, 9, 10 | D5, D6, D7, D8 | `TNY.CS_04..CS_07` | |
| | P3 (B0) / P8 (B1) — CS0..CS3 | 11, 12, 16, 17 | D9, D10, D24, D25 | `TNY.CS_08..CS_11` | |
| | P4 (B0) / P9 (B1) — CS0..CS3 | 20, 21, 22, 23 | D28, D29, D30, D31 | `TNY.CS_12..CS_15` | |
| | P5 (B0) / P10 (B1) — CS0..CS3 | 24, 45, 44, 43 | D32, D23, D22, D21 | `TNY.CS_16..CS_19` | |
| **Panel external interrupt** | EINT to all 10 columns | 28 | D36 | `TNY.EINT` | Driven via R25 (33 Ω series) to fan-out distributing `PAN.EINT_P1..P10` for all 10 panel columns. **Configurable jumper J30** can short this net to BNC J4 directly — see "EINT routing jumper" below. |
| **EINT routing jumper** | J30 selects panel-trigger source | — | — | (J30 / R216) | When **shorted**: BNC J4 signal goes **direct to panels** (bypasses Teensy) via R216 (1 kΩ series). When **open**: Teensy-mediated only — firmware must read D35 input and drive D36 output to forward. Position not firmware-detectable. |
| **Experiment I/O — Analog Output** | AOUT 0–5 V | — (I2C-driven) | — | DAC out → BNC J27 | **No direct Teensy pin.** Generated by an MCP4725 12-bit I²C DAC; firmware writes via I²C on pins 40/41 (D18/D19). Update rate bounded by I²C clock (Wire1 at 400 kHz → ~6 kSa/s) |
| **Experiment I/O — Analog Inputs** | AIN0 (±10 V) | 36 | D14 / A0 | `AIN.A0` | ±10 V on BNC J28 → OPA2277 scales to 0–3.3 V before reaching Teensy ADC |
| | AIN1 (±10 V) | 37 | D15 / A1 | `AIN.A1` | ±10 V on BNC J29 → same OPA2277 scaling chain |
| **Experiment I/O — Digital In/Out** | DIO 0–5 V (bidirectional) | 27 | D35 | `D35_0_3V3` ↔ `D35_5V` | BNC J4. Bidirectional 5 V via SN74LVC1T45 level translator (U3); direction follows Teensy `pinMode`. **Doubles as an external panel-trigger BNC** when jumper J30 is shorted (see EINT row above); the BNC silk label may understate this dual role |
| **Experiment I/O — External Interrupt** | EINT 0–5 V (bidirectional) | 29 | D37 | `D29_0_3V3` ↔ `D29_5V` | BNC J3 "External Interrupt". Bidirectional 5 V via SN74LVC1T45 (U2). Distinct from the panel-internal `TNY.EINT` above |
| **I²C bus** | SDA | 40 | D18 | `I2C.SDA` | Pulled up to 3V3. Sole peripheral on bus is the MCP4725 DAC for AOUT |
| | SCL | 41 | D19 | `I2C.SCL` | |
| **Ethernet** | TX+ | 63 | — | `ETH_T+` | Teensy 4.1 Ethernet magjack via Cetus RJ45 |
| | TX- | 62 | — | `ETH_T-` | |
| | RX+ | 60 | — | `ETH_R+` | |
| | RX- | 65 | — | `ETH_R-` | |
| | LED | 61 | — | `ETH_LED` | Activity LED |
| **Power** | VIN (+5 V) | 48 | — | `VIN` | Powered from board 5 V rail |
| | GND | 1, 34, 47, 64 | — | `GND` | |
| | +3.3 V out | 15, 46 | — | `+3.3V` | Teensy regulator output |
| | Power switch state | — | — | — | **No firmware visibility.** SW1 (SPDT) gates 5 V from J25/J26 barrel jacks into `SW_5V`; that net is local to `power.kicad_sch` and never reaches a Teensy GPIO |
| **Unused / future** | spare / NC | 26, 30, 31, 32, 33, 38, 39, 42 | D34, D38–D41, D16, D17, D20 | `Net-(U1-NN_..)` or `no_connect` | Available for future hardware revisions; firmware should not assert these |

### Operational gotchas firmware MUST know

These three are spec-relevant — they change how firmware MUST be written. (Lower-priority background facts, including AOUT/AI implementation details, level-translator notes, and unused-pin enumeration, are in § History & Reconciliation at the bottom.)

1. **EINT routing jumper J30 selects between Teensy-mediated and direct-to-panels external trigger.** When shorted, BNC J4 drives `TNY.EINT` directly through R216 (1 kΩ series) — Teensy can sense the line on D35 but is bypassed for the actual panel trigger; firmware-emitted D36 (`TNY.EINT`) still has effect via R25 33Ω, but the J4 BNC dominates if both are driven. When open, the Teensy is solely in the loop: firmware reads D35 (input), processes (timing reshape, gating decisions), and drives D36 (output) to the panels. **The jumper position is not firmware-detectable** — it must be a deployment-time config, documented and physically verified per arena. Note: BNC J3 silk-labeled "External Interrupt" is a *different* path (Teensy D37, level-translated, no jumper bypass) — the actual panel-trigger BNC is J4 despite its "0-5V Digital In/Out" silk label.
2. **20 distinct Teensy CS pins, not 10** (despite "10-panel arena"). Each Teensy CS pin gates one panel column on bus B0 *and* one panel column on bus B1 simultaneously — the bus separation prevents collisions. Firmware can therefore address P1 and P6 in parallel by writing to both buses concurrently with the same CS asserted. There are **4 CS lines per panel column** (CS0–CS3), presumably fanned out to 4 sub-panels per column on the column-buffer board (see `column_buffer.kicad_sch`, `fan_out_by_2x.kicad_sch`, `fan_out_by_5x.kicad_sch`).
3. **SCK_B0 is on D13** — the same pin as the Teensy on-board LED (`LED_BUILTIN`). Asserting LED for board status will visibly flicker SCK during SPI traffic; conversely, `digitalWrite(LED_BUILTIN, ...)` while bus B0 is active will glitch the SPI clock. **Firmware must not use `LED_BUILTIN` as a generic status indicator** — pick a different GPIO or the `ETH_LED` net.

---

## Firmware-relevant facts

### Controller hardware

- **Teensy 4.1** with **Ethernet** (RJ45 magjack); the schematic uses the `teensy:Teensy4.1_Ethernet_Only` footprint.
- **Teensy is not part of the arena BOM** — buy separately, plug into the on-board Teensy headers.
- Ethernet is the host link (TCP-on-port-62222 framing per [`g6_03-controller.md`](g6_03-controller.md)).

### SPI region-to-bus mapping

The 10-10 arena has **two SPI buses**, each driving five panel columns:

| SPI bus | Panel columns served (hardware silk) | Equivalent (0-indexed, spec wording) | Teensy SPI peripheral |
|---|---|---|---|
| **B0** | P1, P2, P3, P4, P5 | columns 0–4 → region 0 | Teensy `SPI` (MOSI=D11, MISO=D12, SCK=D13) |
| **B1** | P6, P7, P8, P9, P10 | columns 5–9 → region 1 | Teensy `SPI1` (MOSI=D26, MISO=D1, SCK=D27) |

This matches the source spec exactly (the spec uses 0-indexed columns, the hardware silk uses 1-indexed P-numbers — same mapping).

**Chip-select topology:** **20 distinct Teensy GPIOs** carry the CS lines (4 per panel column × 5 columns per bus, with the same Teensy pin gating the corresponding columns on B0 and B1 — see Pin assignments above). The slim G4.1 baseline uses a 30-pin CS matrix for a 5×6 arena; G6 needs a 4-CS-per-column × 10-column matrix instead. This is in the **Modify** section of [`g6_03-controller.md`](g6_03-controller.md)'s reconciliation.

The 4 CS lines per column are delivered to the 4 panels in that column via the **panel-internal J3↔J5 connector pin shift** mechanism (each panel hardwires `J3 pin 1 → MCU CS0`; J3 pins 2/3/4 carrying CS1/CS2/CS3 wire to J5 pins 1/2/3 — shifted up by one — so the daisy-chain rotates the CS line each panel up the stack). Full spec in [`g6_02-led-mapping.md`](g6_02-led-mapping.md) § Connectors. This means the arena's 4 column-buffer CS outputs each go to a single physical panel slot; no per-panel jumper is needed.

**💡 Firmware advisory — D13 / `LED_BUILTIN` conflict on SPI bus B0 SCK:** firmware must NOT use `digitalWrite(LED_BUILTIN, ...)` for status — it will glitch the SCK on bus B0. Use `ETH_LED` (Teensy pin 61) or one of the spare GPIOs as a status indicator instead.

External-interrupt routing is also present per panel column (panel-internal `PAN.EINT_P1..P10`, all driven by **Teensy pin 28 / `D36` / `TNY.EINT`**, via R25 33 Ω series — see Pin assignments table at top of file for the canonical reference; commit `5d3c496` corrected an earlier `D33` typo). This is the panel-side interrupt, distinct from the experimenter EINT BNC.

### Experiment I/O

The arena exposes the firmware-controllable lines below. **AOUT is via an MCP4725 I²C DAC, not a direct Teensy DAC pin** — Teensy 4.1 has no DAC. **AI lines are scaled via OPA2277** (±10 V external → 0–3.3 V at the Teensy ADC). **DIO and EINT are bidirectional 5 V via SN74LVC1T45 level translators**.

| Line | Type | Range | Count | Source spec asked for | As-built |
|---|---|---|---|---|---|
| AOUT | Analog output (MCP4725 I²C DAC) | 0–5 V | 1 | "at least one ... 0-5V, sufficient current to drive external hardware" | ✓ matches; via I²C DAC, not direct GPIO |
| AIN0/AIN1 | Analog input (OPA2277-scaled) | ±10 V external → 0–3.3 V to Teensy | **2** | "at least one ... -5V to +5V" | ✓ exceeds spec on count and range |
| DIO | Digital I/O (bidirectional, level-translated) | 0–5 V | 1 | "at least one digital output line ... 5V ideal" | ✓ implemented as bidirectional |
| EINT | External interrupt (bidirectional, level-translated) | 0–5 V | 1 | not in source tab | ✓ added by hardware design |

**I/O power supply:** [Recom RB-0515D](https://octopart.com/part/recom-power/RB-0515D) DC-DC isolated module powers the I/O sub-circuit. **Not in BOM** — solder by hand after arena receipt. Firmware does not need to manage this part; flagged here so bring-up procedures know it's a manual step.

### Connector form-factor

Source spec asked for "right-angle, PCB-mounted BNC connectors for these I/O lines". Confirmed by the schematic:

| BNC | Function | Refdes |
|---|---|---|
| J3 | External Interrupt (0–5 V bidirectional) | EINT |
| J4 | Digital I/O (0–5 V bidirectional) | DIO |
| J27 | Analog Output (0–5 V) | AOUT |
| J28 | Analog Input 0 (±10 V) | AIN0 |
| J29 | Analog Input 1 (±10 V) | AIN1 |

Verify mechanical orientation (right-angle vs straight) against the rendered PDF (`arena_10_of_10_v1r1.pdf`) before committing host-side cabling assumptions, but the spec request for BNC is met.

### Power and on/off

- Two DC barrel-jack connectors:
  - **J25** — main power input from supply
  - **J26** — distributes power to a separate top board (top-board design not yet published in G6 hardware repo)
- **Power switch (SW1, SPDT)** — added in `v1p1r2` per `docs/arena.md` revision history. Provides Teensy power-cycle without unplugging USB/barrel-jack. ✓ Source spec implemented.
- **The switch is invisible to firmware.** The SPDT only gates the 5 V supply rail; the switched net (`SW_5V`) is local to `power.kicad_sch` and has no path to a Teensy GPIO. Firmware cannot detect "user pressed off" beyond losing VIN.

### Mode 4 / closed-loop relevance

The source spec calls out the AI line specifically for "flight arena experiments (for mode 4 closed loop), so could be pushed to later version". Reconciled status:

- The slim G4.1 controller had `gain_` stored but never read; closed loop ran on an internal counter, not a real analog input.
- **Mode 4 wiring resolved 2026-05-02:** controller samples **AIN0** (Teensy D14, BNC J28, ±10 V via OPA2277 → 0–3.3 V at ADC) at **500 Hz**; computes `fps = AI_voltage × 100 × gain / 10` where `gain` from `trial-params` is a signed-int 10× scaling factor (typical `-20` = -2.0 fps/V matches G3 flight-arena behavior). AIN1 (D15, J29) unused for Mode 4 — available for experimenter use. Full spec in [`g6_03-controller.md`](g6_03-controller.md) § 6 Mode Behavior on G6.

### v3 Triggered/Gated display relevance

The arena exposes three EINT-related signals — and one configurable jumper (**J30**) that determines whether the external trigger reaches the panels directly or is mediated by the Teensy:

| Signal | Teensy pin / silk | Connection | Role |
|---|---|---|---|
| BNC **J3** ("External Interrupt" silk) | pin 29 / D37 | Bidirectional 5 V via SN74LVC1T45 (U2) | Teensy-only path. **No panel bypass.** General-purpose interrupt the controller can monitor or assert. |
| BNC **J4** ("0-5V Digital In/Out" silk) | pin 27 / D35 | Bidirectional 5 V via SN74LVC1T45 (U3) | Doubles as the panel-trigger source via jumper J30. The "DIO" silk label understates this. |
| Panel-internal `TNY.EINT` | pin 28 / D36 | Driven via R25 (33 Ω) into the EINT fan-out for all 10 panel columns | Controller-driven path to fire (Triggered) or window-gate (Gated) the panels' display in v3 operation. |
| **Jumper J30** (selector) | — | Connects `D35_0_3V3` (J4 input at 3.3 V) to `TNY.EINT` via R216 (1 kΩ) | **Shorted = direct path**: J4 BNC drives panels with no Teensy in the loop. **Open = Teensy-mediated**: firmware reads D35 input and explicitly drives D36 output to forward. |

For v3 trigger work this means **two distinct deployment modes** are physically supported:

- **Direct trigger (J30 shorted)** — lowest-latency external triggering/gating. Useful when the experiment-side trigger waveform is already correctly shaped for v3 Triggered or Gated mode (edge polarity, pulse width, window timing). The Teensy can still observe the signal on D35, but firmware participation is optional.
- **Teensy-mediated trigger (J30 open)** — highest flexibility. Firmware can perform timing reshape, debouncing, edge-polarity inversion, gating-window enforcement, sync-to-BCM-cycle alignment, or skip entirely (firmware decides whether to forward). Required if the experiment-side trigger doesn't directly match the panel-protocol v3 expectations.

Cross-references:

- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v3 documents the panel-side Triggered (per-edge single-shot, `0x12`/`0x32`/`0x52`) and Gated (window gating, `0x14`/`0x34`/`0x54`) modes plus two open issues (trigger edge polarity, sync-vs-async gating semantics) — both decisions are easier to manage in **J30-open** mode where firmware can reshape the trigger.
- The slim G4.1 controller has no input pins beyond CS lines; v3 trigger wiring is **net-new for G6** and depends on these arena EINT lines.

**J30 default = OPEN** (decision 2026-05-02). Shipped arenas leave J30 open by default → Teensy-mediated EINT path is the canonical v3 wiring. Direct-trigger mode (J30 shorted) is a deliberate per-experiment opt-in documented in arena bring-up notes. Firmware cannot detect the position, so the assumed-open default must be verified physically per arena.

### v2 PSRAM / Mode 1 (TSI DO/AO) relevance

The source spec for Mode 1 TSI files defines a 5-byte record `[FrameIndex16, DO, AO_lo, AO_hi]` with both DO and AO output lines' pin assignments noted as "depending on arena design". Reconciled:

- The arena exposes **1 AO** (MCP4725 over I²C, 0–5 V, BNC J27) and **1 DO** (Teensy D35, level-translated to 5 V, BNC J4 — bidirectional, configured as output for Mode 1). **Caveat:** if jumper J30 is shorted, every Mode 1 DO toggle on D35 also retriggers the panel EINT bus via R216. To use D35 as an experimenter DO output without disturbing v3 gating, J30 must be left open. Firmware cannot detect this conflict.
- The TSI record's DO byte (1 byte) → encodes a single digital output state; arena has 1 DO line → straightforward mapping.
- The TSI record's AO field (16 bits) → encodes a single analog output sample; arena has 1 AO line → single-channel; firmware writes the upper 12 bits to MCP4725 (DAC is 12-bit, low 4 bits of AO field are ignored or rounded).
- **The source spec floated "2 AO lines might be interesting, depending on arena design".** As-built has 1 AO — adding a second would require an arena re-spin (or repurposing one of the AI lines, which the OPA2277 chain doesn't currently support).

---

## History & Reconciliation

### Lower-priority background facts (read once, internalize)

These items were captured during the KiCad reconciliation pass at SHA `0a8ec33c` but are not load-bearing for spec correctness — they're worth knowing once but don't need to live near the top of the file.

- **AOUT is an MCP4725 I²C DAC, not a direct Teensy DAC pin.** Teensy 4.1 has no built-in DAC; firmware needs an I²C library plus the MCP4725 address (default 0x60/0x62). This affects update rate (≪ direct DAC) and adds a one-tick I²C latency to TSI Mode 1 AO updates.
- **AI lines are scaled via OPA2277 op-amp.** ±10 V external (BNC J28/J29) → 0–3.3 V at the Teensy ADC pin. There is also an on-board precision **REF102AU 10 V reference** (U84) used by the scaling chain — drift in this part biases AI calibration.
- **DIO and EINT are bidirectional 5 V via SN74LVC1T45 level translators.** Firmware sets direction via `pinMode`; the level translator's DIR pin is wired to follow the Teensy GPIO direction signal. Verify the DIR control net before assuming this is automatic.
- **The on/off switch is invisible to firmware.** SW1 only gates the 5 V supply rail; if firmware needs to know "user pressed off", it can't — the Teensy will simply lose VIN. Use external watchdog / brown-out behavior instead.
- **Multiple SN74HCS08 / column-buffer chips exist** between the Teensy CS lines and the actual panel CS pins — firmware should be aware that the propagation delay (~5–10 ns each) accumulates, but won't matter at the 5 MHz SPI rate the slim G4.1 controller uses.
- **Pins 30–33 and 38, 39, 42 are explicit `no_connect` markers in the schematic.** Pins 26, 28 (D34, D36) are auto-named, also floating. All these are spare GPIO available for hardware revisions.

### Major decisions log

- **2026-04-29** — Production arena `arena_10-10` v1.1.7 ordered (commit `a696782` in this dev set; upstream `0a8ec33c` in `reiserlab/LED-Display_G6_Hardware_Arena`).
- **2026-05-01** — Per-peripheral Teensy 4.1 pin assignment table extracted from KiCad (commit `a696782`).
- **2026-05-02** — Corrected `TNY.EINT` pin from D33 to **D36** (commit `5d3c496`).
- **2026-05-02** — Arena jumper J30 default = OPEN (Teensy-mediated EINT trigger) (commit `78be9ca`).
- **2026-05-02** — v3 Triggered/Gated mode rename propagated through this file (commit `5c8ee7a`; tracks the v3 mode-set finalization in `g6_01`).
- **2026-05-02** — Mode 4 wiring resolved: AIN0, 500 Hz, signed-int gain (this commit). Cross-doc with `g6_03` § Mode 4 + History.
- **2026-05-02** — Multi-arena variant (8-of-10) confirmed handled today via the v2 pattern-header panel mask; no arena re-spin needed (this commit).
- **2026-05-02** — BNC J3 role specified as general-purpose Teensy interrupt for experimenter use (commit `2771849`).
- **2026-05-02** — gh-api KiCad + netlist trace (Open Qs #4, #5): MCP4725 schematic uses generic part symbol (`xxx-xCH`); BOM lookup → LCSC C144198 = MCP4725A0T-E/CH = base I²C address `0x60` (A0-pin wiring TBD from schematic). SN74LVC1T45 DIR nets resolved via `production/v1p1r7/netlist.ipc`: U2 (J3 EINT) DIR → Teensy U1 pin 36 (alt-name "CS"); U3 (J4 DIO) DIR → Teensy U1 pin 34 (alt-name "RX8"). Firmware-controlled DIR (not auto-direction). (commits `9a87336` + `34260bd` + this commit).

---

## Open Questions / TBDs

1. ~~Mode 4 AI line selection.~~ **Resolved 2026-05-02**: AIN0, 500 Hz, gain as signed-int 10× scaling (1V → 100 base counts × gain/10 = signed fps). See [`g6_03-controller.md`](g6_03-controller.md) § 6 Mode 4.
2. **BNC J3 ("External Interrupt") role** — with J4 identified as the actual panel-trigger BNC (via J30), J3 serves as a general-purpose Teensy interrupt for experimenter use (e.g. session-start signal, behavior event marker). Detailed use cases to be specced when needed.
3. **`docs/arena.md` lags reality at v1.1.7.** Either update the submodule's docs or note the version-mapping convention here. Out-of-band item for the upstream arena repo.
4. **MCP4725 I²C address — base address `0x60`** (BOM-confirmed 2026-05-02 from `arena_10-10_v1/production/v1p1r7/bom.csv`: U85 = LCSC **C144198** = `MCP4725A0T-E/CH`, factory address bits A2:A0 = `000`). Effective I²C 7-bit address is `0x60` (A0 pin tied LOW) or `0x61` (A0 pin tied HIGH); A0-pin wiring not yet traced from the SOT-23-6 footprint, but most G6 deployments will see **`0x60`** (default, A0 → GND). Verify A0 wiring in `analog.kicad_sch` U85 footnote before final firmware ship.
5. **SN74LVC1T45 DIR control nets** for DIO (J4) and EINT (J3) — **resolved 2026-05-02 via netlist**: each translator's DIR pin connects to a **dedicated Teensy GPIO** (NOT auto-direction-from-pinMode, NOT tied to VCC/GND). U2 (J3 EINT translator) DIR → Teensy U1 footprint pin **36** (alternate-name "CS" in netlist auto-naming); U3 (J4 DIO translator) DIR → Teensy U1 footprint pin **34** (alternate-name "RX8"). **Firmware must explicitly drive these GPIOs** to set direction (HIGH = A→B = output mode; LOW = B→A = input mode) — direction does NOT follow `pinMode` of the data-pin GPIO. **Cross-check the Teensy 4.1 footprint-pin → silk-D-name mapping** before final firmware ship; pins 34 and 36 should be added to the Pin assignments table at the top of this file.
6. **Top-board design (J26 use).** Not yet published. If a future controller doc surfaces a need (extra DO, more DIO, additional analog), this is the place.
7. **2-channel AO future.** If the spec ever firms up two AO lines for TSI-driven experiments, an arena re-spin is required.

---

## Cross-references

- [Source Google Doc, "G6 arena design (v1/v2)" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#)
- [`Generation 6/Arena/docs/arena.md`](../../Generation%206/Arena/docs/arena.md) — authoritative arena hardware reference (in submodule, currently uninitialized in this clone)
- [reiserlab/LED-Display_G6_Hardware_Arena](https://github.com/reiserlab/LED-Display_G6_Hardware_Arena) — production arena submodule remote (used to populate this doc via `gh api`)
- [reiserlab/LED-Display_G6_Hardware_Test_Arena](https://github.com/reiserlab/LED-Display_G6_Hardware_Test_Arena) — historical/never-used dev test arena
- [`g6_00-architecture.md`](g6_00-architecture.md) — host/controller/panel split; the arena hosts the controller
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) — panel protocol; v3 trigger semantics interact with the EINT lines on this arena
- [`g6_03-controller.md`](g6_03-controller.md) — controller doc; arena facts here resolve open questions about CS-line topology, AI source for Mode 4, EINT for v3 gating
- [`g6_06-host-software.md`](g6_06-host-software.md) — host-side concerns; arena geometry must be supplied from host since controller is geometry-ignorant
