# G6 — Panel Hardware Reference (v0.2 + v0.3) and LED Mapping

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Panel LED Mappings", lines 1112–1571) — LED mapping section · Panel hardware deltas reconciled against three test-firmware planning docs (`G6_Panels_Test_Firmware/test_firmware/single_led/PANEL_V021_V031_HW_SUMMARY.md`, `LED_ORIENTATION_AND_RESISTOR_SUMMARY.md`, `G6_V03_SCHEMATIC_REVIEW.md`) — themselves built from KiCad source reviews of `iorodeo/LED-Display_G6_Hardware_Panel @ prod_v0p2r0` (head `89960365`) · v0.2 firmware-relevant pin layout cross-checked against [`g6_firmware_devel/panel/src/constants.cpp`](https://github.com/iorodeo/g6_firmware_devel) `@ 6944894` · Last reviewed: 2026-05-02 by mreiser
Status: **Specified for v0.2 + v0.3** — every firmware-relevant pin, peripheral, polarity, resistor value, and connector pinout captured. v0.1 LED designator mapping table extracted to [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) adjunct · v0.2 / v0.3 LED designator tables pending KiCad-source extraction (sources accessible via test firmware repo's PR review docs but not yet automated).

This file captures the firmware ↔ panel-hardware contract for the two in-house G6 panel revisions (v0.2 production, v0.3 parallel revision), plus the LED designator mapping that lets host software compute which physical LED corresponds to each logical pixel. The major firmware-relevant deltas between v0.2 and v0.3 are **pin/column wiring, SPI peripheral location, PSRAM CS pin, and PIO viability**; the BOMs are otherwise bit-identical.

## TL;DR — revision deltas in one paragraph

**v0.2.1** is a minimal-change update to the v0.1 Janelia layout: same pin assignments, but with (a) LED orientation flipped to **normal polarity** (col HIGH + row LOW = ON), (b) EINT properly routed to GP45 (no more bodge wire), (c) 33 Ω MISO series-termination added (R29), (d) current-limit resistor standardized to 160 Ω uniform across all 20 columns, (e) board shrunk to 45 × 45 mm. **Firmware written for v0.1 still works with only minor pin-constant + polarity updates.** **v0.3.1** is a full pin-map redesign on top of v0.2.1: XIP_CS1n moved from GP0 → GP47 (frees GP0 for COL_00), columns now GP0–GP19 contiguous, rows now GP20–GP39 contiguous (no SPI gap), SPI moved from SPI0 (GP32–35) to SPI1 (GP40–43), EINT still GP45. **Firmware needs substantial pin-constant updates** but the new layout enables both PIO0 columns and PIO1 rows to use clean `out pins, 20` — unlocks fully-autonomous PIO scanning. **BOMs are bit-identical between the two revisions** — same MCU, LEDs, current-limit resistor, drivers, connectors. Only pin assignments, LED orientation, and PCB routing differ.

## Revisions in scope

- **v0.1** — legacy reference; the 20×20 LED-designator mapping at the bottom of this file is from v0.1 and is used in the [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format worked example. **Not built today.** v0.1 had reversed LED polarity and 240 Ω current-limit resistors (giving 12.4 mA drive); v0.2 fixed both.
- **v0.2** — `panel_rp2354_20x20_v0p2`; **current production** (in-house, full systems). The `prod_v0p2r0` PR was merged 2026-04-29 in `iorodeo/LED-Display_G6_Hardware_Panel`. Pin layout cross-checked against `g6_firmware_devel @ 6944894`.
- **v0.3** — `panel_rp2354_20x20_v0p3`; parallel revision; in-house but **not enough boards yet for full systems**. KiCad rev `29bb98e` ("fix XIP_CS1n pind"). Schematic review passed 32/32 checks (per `G6_V03_SCHEMATIC_REVIEW.md`).

Firmware supports both v0.2 and v0.3 via **build-time `#define`** (decision 2026-05-02): separate firmware binaries, one per panel revision (e.g., `#ifdef G6_PANEL_V0P2` / `G6_PANEL_V0P3` selects pin tables, SPI peripheral, polarity). Simplest mechanism; matches reality (a given arena uses one panel version throughout). See § Firmware change matrix below for the per-version constants that need to flip.

## Mechanical

- **Board size:** 45 × 45 mm (square panel). Same in both v0.2 and v0.3.
- **Active LED area:** 20 × 20 LED matrix (400 LEDs).

## MCU and memory subsystem

| Aspect | v0.2 | v0.3 |
|---|---|---|
| MCU | **RP2354B** = RP2350B QFN-80 + stacked PSRAM (LCSC C39843328) | Same RP2354B |
| Crystal | 12 MHz **ABM8-272-T3** (LCSC C20625731), SMD 3.2 × 2.5 mm, with 2× 15 pF load caps (C1, C2) | Same |
| External PSRAM | **APS6404L-3SQR** 8 MB QSPI (LCSC C3040877), connected via QSPI with chip-select on **XIP_CS1n = GP0** | Same APS6404L-3SQR; **chip-select moved to XIP_CS1n = GP47** (one of only 4 pins supporting QMI CS1n funcsel 9 — others are GP0, GP8, GP19) |
| 1V1 rail | RP2354B internal switching regulator (3.3 µH inductor L1; VREG_AVDD/VIN/FB/LX/PGND topology) | Same |
| 3V3 rail | **AP2112K-3.3** LDO (LCSC C51118), SOT-23-5, powered from +5 V USB; 10 µF input + 10 µF output caps | Same |
| 5 V input | USB | Same |
| Decoupling | 52× 100 nF 0201, 18× 10 µF 0402 bulk, 4× 4.7 µF 0402 (for QSPI/PSRAM) | Same |

> **💡 Note — RP2354B clarification.** The RP2354B is the QFN-80 RP2350B with **on-package stacked PSRAM** in addition to the external APS6404L. Firmware can use either; the on-package stacked PSRAM is faster but smaller, while the external APS6404L is 8 MB. PSRAM index allocation strategy (which goes where) is a firmware design decision — TBD.

## Pin assignments

The load-bearing firmware contract. Pin assignments differ between v0.2 and v0.3 — this is the source of the SPI peripheral move and the PIO-viability delta.

### v0.2 (`panel_rp2354_20x20_v0p2`)

Pin layout cross-referenced from `g6_firmware_devel/panel/src/constants.cpp:7–22` and `PANEL_V021_V031_HW_SUMMARY.md`.

| Function | RP2354 GPIO | Pin # | Notes |
|---|---|---|---|
| QSPI XIP_CS1n (PSRAM) | GP0 | 78 | funcsel 9 (QMI CS1n) |
| COL drive (20 lines) | **GP1 – GP20** | 79–80, 1–8, 11–22 | Sequential ✓ (PIO0 base = GP1, `out pins, 20`) |
| ROW drive (11 lines, lower) | GP21 – GP31 | 23–34 | First half of ROW range |
| SPI MOSI (SPI0_RX) | GP32 | 40 | SPI0 hardware peripheral |
| SPI CS0 (SPI0_CSn) | GP33 | 42 | |
| SPI SCK (SPI0_SCK) | GP34 | 43 | Mode 3 (CPOL=1, CPHA=1), MSB-first, 30 MHz max |
| SPI MISO (SPI0_TX) | GP35 | 44 | **R29 = 33 Ω series-termination** to header |
| ROW drive (9 lines, upper) | GP36 – GP44 | 45–55 | Second half of ROW range — **gap from GP32–35 (SPI block)** ⚠ |
| EINT (external trigger) | **GP45** | 56 | External trigger input on inter-panel headers J3/J5 (added in v0.2; was bodge wire in v0.1) |
| Spare | GP46, GP47 | 57, 58 | NC, ADC6 capable |

**Combined ROW pin list (firmware constants):** `{21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 36, 37, 38, 39, 40, 41, 42, 43, 44}` — 20 pins, **split by SPI gap**.

### v0.3 (`panel_rp2354_20x20_v0p3`)

Pin layout from `panel_rp2354_20x20_v0.3.0.pdf` + `G6_V03_SCHEMATIC_REVIEW.md` (32/32 checks passed) + `PANEL_V021_V031_HW_SUMMARY.md`.

| Function | RP2354 GPIO | Pin # | Notes |
|---|---|---|---|
| COL drive (20 lines) | **GP0 – GP19** | 77–80, 1–8, 11–18 | Sequential ✓ (PIO0 base = GP0, `out pins, 20`) |
| ROW drive (20 lines) | **GP20 – GP39** | 21–29, 36–48 | Sequential ✓ (PIO1 with `GPIOBASE = 16`, base = GP20, `out pins, 20`) |
| SPI MOSI (SPI1_RX) | GP40 (ADC0) | 49 | SPI1 hardware peripheral |
| SPI CS0 (SPI1_CSn) | GP41 (ADC1) | 52 | |
| SPI SCK (SPI1_SCK) | GP42 (ADC2) | 53 | Mode 3 (CPOL=1, CPHA=1), MSB-first, 30 MHz max |
| SPI MISO (SPI1_TX) | GP43 (ADC3) | 54 | **R29 = 33 Ω series-termination** to header |
| Spare | GP44 (ADC4) | 55 | NC, ADC4 capable |
| EINT (external trigger) | **GP45** (ADC5) | 56 | External trigger input on inter-panel headers J3/J5 |
| Spare | GP46 (ADC6) | 57 | NC, ADC6 capable |
| QSPI XIP_CS1n (PSRAM) | **GP47** | 58 | funcsel 9 (QMI CS1n); moved from GP0 to free GP0 for COL_00 |

**SPI label convention** (both versions): MOSI/MISO are from the **arena-controller (master) perspective**. The panel is an SPI **slave** — `MOSI` is panel input (RX), `MISO` is panel output (TX).

## SPI peripheral mapping

| Version | SPI peripheral | GPIO range | RP2350 funcsel |
|---|---|---|---|
| v0.2 | **SPI0** (hardware) | GP32 – GP35 | funcsel 1 |
| v0.3 | **SPI1** (hardware) | GP40 – GP43 | funcsel 1 |

Firmware must select the correct SPI peripheral per board version. `iorodeo/g6_firmware_devel @ 6944894` currently uses SPI0 (v0.2 baseline).

## PIO viability — the major firmware-relevant delta

**v0.2:** 20 contiguous COL GPIOs (GP1–GP20) → PIO0 columns straightforward (`out pins, 20` from base GP1). ROW GPIOs split into two ranges (GP21–GP31 and GP36–GP44) by the SPI block on GP32–35 → **PIO1 cannot drive rows with a clean `out pins, 20`**; rows must use CPU `gpio_set_mask64` / `gpio_clr_mask64` (PIOSCAN architecture). Production firmware mode: PIOSCAN (PIO columns + CPU rows + `noInterrupts()` + multicore lockout) — the zero-jitter recipe from Phase 4 of `G6_Panels_Test_Firmware`.

**v0.3:** Both COL (GP0–GP19) and ROW (GP20–GP39) are fully contiguous; SPI relocated to SPI1 on GP40–43 (out of the way). **PIO1 with `GPIOBASE = 16` and base GP20** can drive rows with a clean `out pins, 20`. **Dual-PIO `PIOFULL` is straightforward** — validated end-to-end against v0.3.1 panels in `G6_Panels_Test_Firmware @ bb26a44` (see `single_led/PRODUCTION_ARCHITECTURE.md` § 5 PIOFULL). Enables fully-autonomous PIO scanning: CPU is free during scan bursts, no `noInterrupts()` needed; ~0.37 µs/row overhead vs ~0.61 µs/row in PIOSCAN; potentially supports 5- or 6-bit BCM within the same 15 µs scan window.

**Firmware implication:** to support both panel revisions, firmware needs (a) per-version pin-constant tables, (b) per-version SPI peripheral selection (SPI0 vs SPI1), (c) per-version scan architecture (PIOSCAN vs PIOFULL — or both PIOSCAN as a common baseline plus PIOFULL as a v0.3-only optimization), and (d) a board-id mechanism (Open Question #4).

## LED matrix and drivers

### LED part

- **Starsealand XL0402YGC** (LCSC C9900113976) — 0402 yellow-green LEDs, 570 nm dominant wavelength
- **Binning** (per prior order): brightness P08/P09, voltage VF/VG, wavelength YG11/YG12
- **Electrical limits:** I_F max 20 mA DC, I_FP 30 mA pulsed, V_F ≈ 1.95–2.30 V at operating current
- **Quantity:** 400 LEDs per panel (designators D1–D400)

### LED polarity — NORMAL (both v0.2 and v0.3)

- **Anode** → column (through current-limit resistor)
- **Cathode** → row (direct)
- **Drive logic: column HIGH + row LOW = LED ON**

This is **opposite to the v0.1 Janelia batch**, which was assembled with reversed LEDs (col LOW + row HIGH = ON). v0.2 restored the iorodeo convention. Firmware that was written for v0.1 needs to flip the column-pattern PIO word inversion (`~pattern` → `pattern`) and the row on/off sense (`gpio_set_mask64` ↔ `gpio_clr_mask64`).

The polarity choice matters under multi-LED load: UCC27517 gate drivers have asymmetric output impedance (0.55 Ω sinking vs 1.3 Ω sourcing); the row driver carries the summed current of all lit columns (up to 20×). Normal polarity has the row sinking through low impedance — keeping brightness uniformity under 6 % at 160 Ω vs 13 % for reversed polarity.

### Current-limit resistors (R9–R28)

- **20 resistors**, one per column input, all populated with the same LCSC part **C851657** (0201 package)
- **Symbolic naming** in schematic: R_T0 / R_T1 / R_T2 / R_T3 cycling across 4-LED groups (placeholder for future multi-color variants; today all 20 are the same physical part)
- **Value:** 160 Ω (per the v0.2.0 design roadmap optimization — gives ~18.5 mA drive at worst-case V_F vs 12.4 mA for v0.1's 240 Ω; +50 % brightness, safe at 40 °C). **Confirm physically on R9 before precision work** (Open Question #6).

### LED drivers (gate drivers between MCU and matrix)

- **40× UCC27517** single-channel low-side gate drivers (SOT-23-5, LCSC C99395)
- **Topology:** 20 column drivers (U3–U22) + 20 row drivers (U23–U42), each with 100 nF decoupling cap (C19–C58), plus shared 10 µF bulk caps (C59–C76) on the +5 V driver supply
- **Output drive:** 4 A peak, asymmetric impedance 0.55 Ω sinking / 1.3 Ω sourcing (relevant to polarity choice above)

## Signal-conditioning / pull-up resistors

- **R29 = 33 Ω 0201** — MISO series-termination (v0.2 GP35 / v0.3 GP43) — improves SPI signal integrity at 30 MHz; new in v0.2+, was absent in v0.1
- **R6 = 33 Ω 0201** — second 33 Ω resistor; specific net assignment TBD against KiCad
- **R7, R8 = 27 Ω 0201** — USB D+/D− impedance matching (placed close to RP2354)
- **R1, R4 = 10 kΩ 0201** — pull-ups (likely XIP_CS1n and CS0)
- **R2, R3, R5 = 1 kΩ 0201** — pull-ups for SW2 (RUN), SW1 (USB_BOOT) drives, and one TBD

## v3 EINT firmware contract

With the v3 mode set finalized in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) (Triggered + Gated, Persistent reserved-but-deferred), the panel firmware needs to handle GP45 EINT:

- **Triggered modes** (`0x12`, `0x32`, `0x52`): each rising edge on GP45 fires one display unit (a row, frame, or row-bit-plane — exact granularity is implementation choice). Recommended: PIO `wait pin` (since GP45 is in PIO1's range with `GPIOBASE = 16` on v0.3) or GPIO IRQ on rising edge for v0.2. Validated 865 ± 17 ns trigger-to-LED latency in `G6_Panels_Test_Firmware @ bb26a44`.
- **Gated modes** (`0x14`, `0x34`, `0x54`): while GP45 HIGH, panel internally refreshes the loaded pattern at its BCM rate; while LOW, display off. Recommended: GPIO level-watch + scan-loop gate.
- **EINT pin is GP45 on both v0.2 and v0.3** — the only firmware-visible pin shared identically across the two revisions. Same firmware handler works on both.

The arena-side wiring (Teensy D36 `TNY.EINT` → R25 33 Ω → fan-out → all 10 panel columns) and the J30 jumper (Teensy-mediated vs direct-from-J4-BNC) are documented in [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md) § v3 Triggered/Gated display relevance.

## Connectors

### USB (data + power)

- **J1**: JST-SH 4-pin (BM04B-SRSS-TB, LCSC C160390) — Stemma-QT/QWIIC-style
- **Pinout:** 1 = GND, 2 = D−, 3 = D+, 4 = +5 V (verify against datasheet — schematic shows D+/D−/GND/+5V order)
- **Adapter cable required:** USB-C-to-Stemma adapter (e.g., M5Stack `connector-grove-to-usb-c` + SparkFun Grove-to-JST-SH `15109` per schematic notes)
- **USB series resistors** R7 / R8 = 27 Ω, placed close to RP2354 for impedance matching

### Inter-panel headers (4× 1×5)

| Header | Position | Form | Pin 1 | Pin 2 | Pin 3 | Pin 4 | Pin 5 |
|---|---|---|---|---|---|---|---|
| **J2** | bottom | male right-angle | MISO | MOSI | SCK | GND | +5 V |
| **J3** | bottom | male right-angle | EINT | CS3 | CS2 | CS1 | +5 V |
| **J4** | top | female receptacle | MISO | MOSI | SCK | GND | +5 V |
| **J5** | top | female receptacle | EINT | NC ("X" in schematic) | CS2 | CS1 | +5 V |

- **Bottom (J2/J3) parts:** Harwin M20-8890545R, LCSC C46061678; Digikey 952-M20-8890545RCT-ND or 952-3266-ND
- **Top (J4/J5) parts:** Samtec SMH-105-02-X-S, LCSC C5142238

J4/J5 (top side) enable **panel daisy-chaining / vertical stacking**. The production `arena_10-10` does not use stacking; J4/J5 are unused on those panels.

> **⚠ Flag — CS routing per panel position.** Each panel's MCU sees a single `CS0` line, but the headers carry CS1/CS2/CS3. Selection mechanism (PCB jumper, 0-Ω resistor, slot-position routing in the header passthrough) is not yet captured — see Open Question #3.

## Programming / boot workflow

- **SW1 (USB_BOOT)** — drives QSPI_SS via R3 = 1 kΩ; pull QSPI_SS LOW on power-up to enter RP2350 BOOTSEL mode (USB mass-storage interface for flashing UF2 firmware)
- **SW2 (RUN)** — drives RUN via R2 = 1 kΩ; momentary press resets the MCU
- **Tactile switches:** TS-1088-AR02016 (LCSC C720477)
- Standard Pico/RP2350 development workflow: hold SW1 + tap SW2 → BOOTSEL mode → drag UF2 to mounted drive → release SW1 → MCU runs new firmware

## LED designator mapping (v0.1)

The 400-row v0.1 LED designator table is in [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) (CSV with header `row,col,led` + 400 data rows). v0.2 and v0.3 designator tables are pending KiCad-source extraction (Open Question #2).

### Grid layout (v0.1 — for visual orientation)

The 20×20 matrix below shows the LED designators **in physical PCB layout order** — the way you'd see them looking at the panel face-up. The "D" prefix from KiCAD has been dropped to save horizontal space.

```
  1  21 20 40 81  101 100 120 161 181 180 200 241 261 260 280 321 341 340 360
 41  61 60 80 121 141 140 160 201 221 220 240 281 301 300 320 361 381 380 400
  2  22 19 39 82  102 99  119 162 182 179 199 242 262 259 279 322 342 339 359
 42  62 59 79 122 142 139 159 202 222 219 239 282 302 299 319 362 382 379 399
  3  23 18 38 83  103 98  118 163 183 178 198 243 263 258 278 323 343 338 358
 43  63 58 78 123 143 138 158 203 223 218 238 283 303 298 318 363 383 378 398
  4  24 17 37 84  104 97  117 164 184 177 197 244 264 257 277 324 344 337 357
 44  64 57 77 124 144 137 157 204 224 217 237 284 304 297 317 364 384 377 397
  5  25 16 36 85  105 96  116 165 185 176 196 245 265 256 276 325 345 336 356
 45  65 56 76 125 145 136 156 205 225 216 236 285 305 296 316 365 385 376 396
  6  26 15 35 86  106 95  115 166 186 175 195 246 266 255 275 326 346 335 355
 46  66 55 75 126 146 135 155 206 226 215 235 286 306 295 315 366 386 375 395
  7  27 14 34 87  107 94  114 167 187 174 194 247 267 254 274 327 347 334 354
 47  67 54 74 127 147 134 154 207 227 214 234 287 307 294 314 367 387 374 394
  8  28 13 33 88  108 93  113 168 188 173 193 248 268 253 273 328 348 333 353
 48  68 53 73 128 148 133 153 208 228 213 233 288 308 293 313 368 388 373 393
  9  29 12 32 89  109 92  112 169 189 172 192 249 269 252 272 329 349 332 352
 49  69 52 72 129 149 132 152 209 229 212 232 289 309 292 312 369 389 372 392
 10  30 11 31 90  110 91  111 170 190 171 191 250 270 251 271 330 350 331 351
 50  70 51 71 130 150 131 151 210 230 211 231 290 310 291 311 370 390 371 391
```

**Visual orientation:** Row 0 is at the **bottom** of the panel (visually the **last** printed row, D50/D70/D51/…) and row 19 is at the **top** (visually the **first** printed row, D1/D21/D20/…). Host pixel coordinates are read **bottom-up**: `pixel[0,0]` = bottom-left = D50; `pixel[19,19]` = top-right = D360.

### Sample of the row/column mapping (first 5 rows for sanity check)

Authoritative full table: [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) (400 rows).

| ROW | COLUMN | LED | | ROW | COLUMN | LED |
| :-: | :-: | :-: |---| :-: | :-: | :-: |
| 0 | 0 | 50 | | 0 | 1 | 70 |
| 0 | 2 | 51 | | 0 | 3 | 71 |
| 0 | 4 | 130 | | 0 | 5 | 150 |
| 1 | 0 | 10 | | 1 | 1 | 30 |
| 19 | 18 | 340 | | 19 | 19 | 360 |

Worked example consumers: [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format uses `pixel[0,0] → D50`, `pixel[0,1] → D70`, `pixel[19,18] → D340`, `pixel[19,19] → D360` — all four cross-check against the CSV.

## Firmware change matrix (for porting between revisions)

Useful when moving firmware between panel revisions. Source: `PANEL_V021_V031_HW_SUMMARY.md` § Firmware change matrix.

| Change area | v0.1 → v0.2 | v0.1 → v0.3 | v0.2 → v0.3 |
|---|---|---|---|
| Column pin constants | Small shift if any | **Full rewrite**: COL_PIN[] = GP0–GP19 | Shift all columns down by 1 GPIO |
| Row pin constants | Small shift if any | **Full rewrite**: ROW_PIN[] = GP20–GP39 contiguous | Move to contiguous GP20–GP39 |
| LED polarity logic | **FLIP**: was col LOW + row HIGH, now col HIGH + row LOW | **FLIP** (same change) | No change (both NORMAL) |
| Column pattern PIO word | **Remove the `~pattern` inversion** | Remove `~pattern` | No change |
| Row on/off sense | Active LOW: `gpio_clr_mask64` for ON, `gpio_set_mask64` for OFF | Same swap | No change |
| All-off row state | All rows HIGH | All rows HIGH | No change |
| SPI peripheral | Still SPI0 on GP32–35 | **Switch to SPI1** on GP40–43 | **Switch SPI0 → SPI1** |
| MISO termination | Add R29 handling (firmware-transparent — series R only) | Same | No change |
| PIO0 column base | Match new pin constants (GP1) | **GP0 base** for `out pins, 20` | Shift base GP1 → GP0 |
| PIO1 row driving | Not usable (split pins) | **New capability**: `out pins, 20` from GP20, `GPIOBASE = 16` | Newly enabled on v0.3 |
| XIP_CS1n handling | Still GP0 | **Now GP47** | **Move GP0 → GP47** |
| EINT handler | GP45 (no bodge wire needed) | GP45 (same) | No change |
| Current-limit resistor | 240 Ω → 160 Ω (firmware-transparent) | Same | No change |

## Open Questions / TBDs

1. **KiCad submodule init for direct hardware audit.** The PR-review docs in `G6_Panels_Test_Firmware/test_firmware/single_led/` cover most firmware-relevant facts above; the `Generation 6/Panels` submodule (blocked on SSH host-key trust per handover) gives independent verification. Initialize when convenient; spot-check a few load-bearing claims (R6 net assignment, R1/R4 pull-up targets, J1 USB pinout).
2. **Per-revision LED designator tables for v0.2 and v0.3.** Need a KiCad-source extraction script. The v0.1 mapping is from the original Janelia v0.1 PCB; v0.2 and v0.3 may differ in physical placement (LED orientation flipped in v0.2 affects designator-to-position mapping). Once available, add `g6_02-led-mapping-v0p2.csv` and `g6_02-led-mapping-v0p3.csv` companions following the same `row,col,led` schema.
3. **CS-line routing per panel position.** Headers carry CS1/CS2/CS3 + EINT, but only one CS line reaches each panel's MCU as `CS0`. Selection mechanism (PCB jumper, 0-Ω resistor, slot-position routing in passthrough) not yet captured. Probably resolved in the arena's column-buffer board (which fans out CS lines) — cross-doc with [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md) § Chip-select topology.
4. ~~Board-id mechanism for firmware to detect v0.2 vs v0.3.~~ **Resolved 2026-05-02**: build-time `#define` (separate firmware binaries). See § Revisions in scope above.
5. ~~Layering vs `display.cpp::sch_to_pos_index`.~~ **Resolved 2026-05-02**: two-stage model. Host owns *logical → schematic* mapping (rotation, flip, panel position); panel firmware owns *schematic → physical-pin* mapping (`display.cpp::sch_to_pos_index()` with `NUM_COLOR = 4` quadrant scheme). LED designator tables in this file describe the schematic-coordinate ↔ LED-designator layer; firmware adds the schematic ↔ physical-pin layer on top. See `g6_01` § History decisions log for the full resolution.
6. **Confirm 160 Ω current-limit value physically.** PR-review doc says expected 160 Ω per prior optimization; recommend in-circuit measurement on R9 (or LCSC C851657 part lookup) before precision brightness work.
7. **R6 net assignment.** Schematic has a second 33 Ω 0201 (R6) — which signal it terminates is not yet captured.
8. **Maximum SPI clock rate.** Firmware default is 30 MHz (`g6_firmware_devel/panel/src/constants.cpp:15`); panel hardware likely supports higher with R29 termination, but not characterized. Worth measuring on a scope before pushing past 30 MHz.

## History & Reconciliation

- **2026-04-02** — Panel design roadmap drafted: v0.2.0 (4 minimal changes — EINT to GP45, MISO termination, normal polarity, 160 Ω resistors) + v0.3.0 (PIO pin rearrangement, SPI relocation, board shrink). Captured in `G6_Panels_Test_Firmware/test_firmware/single_led/LED_ORIENTATION_AND_RESISTOR_SUMMARY.md`.
- **2026-04-09** — v0.3.1 schematic review: 32/32 automated checks passed, including critical XIP_CS1n on GP47 (corrected from earlier draft on GP44). Captured in `G6_Panels_Test_Firmware/test_firmware/single_led/G6_V03_SCHEMATIC_REVIEW.md` and KiCad commit `29bb98e fix XIP_CS1n pind`.
- **2026-04-29** — v0.2 production PR `prod_v0p2r0` merged in `iorodeo/LED-Display_G6_Hardware_Panel` (head `89960365` "fix EINT note position").
- **2026-05-02** — v0.1 LED-designator inline table extracted to `g6_02-led-mapping-v0p1.csv`; this file scope-expanded from "Panel LED Mapping (v0.1)" to "Panel Hardware Reference (v0.2 + v0.3) + LED Mapping" (commit `a805e59`).
- **2026-05-02** — v3 Triggered/Gated panel-protocol mode set finalized (commit `a334004` in `g6_01`); EINT firmware contract added to this file.
- **2026-05-02** — v0.2 EINT (GP45), PSRAM CS (GP0), and SPI peripheral (SPI0) resolved by reconciling against `PANEL_V021_V031_HW_SUMMARY.md`; v0.3 MISO corrected from GP44 → GP43 (R29 termination is on the SPI1 MISO output, GP43, not GP44 spare); XIP_CS1n confirmed on GP47 (commit `6450445`).
- **2026-05-02** — **Board-id mechanism = build-time `#define`** (Open Q #4 resolved). Separate firmware binaries per panel revision; arena uses one panel version throughout (this commit).
- **2026-05-02** — **LED-mapping layering = two-stage** (Open Q #5 resolved, D5 in `g6_01` resolved). Host: logical → schematic; panel firmware: schematic → physical-pin via `sch_to_pos_index()`. Spec text updated in `g6_00`, `g6_01`, `g6_02` (this commit).

## Cross-references

- [Source Google Doc, "Panel LED Mappings" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — v0.1 LED mapping verbatim source.
- [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) — full 400-row v0.1 LED designator mapping (extracted from this file 2026-05-02).
- [`G6_Panels_Test_Firmware/test_firmware/single_led/PANEL_V021_V031_HW_SUMMARY.md`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — comprehensive v0.2.1 vs v0.3.1 hardware comparison (KiCad source review of `iorodeo/LED-Display_G6_Hardware_Panel @ prod_v0p2r0`).
- [`G6_Panels_Test_Firmware/test_firmware/single_led/LED_ORIENTATION_AND_RESISTOR_SUMMARY.md`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — LED polarity + 160 Ω resistor optimization rationale.
- [`G6_Panels_Test_Firmware/test_firmware/single_led/G6_V03_SCHEMATIC_REVIEW.md`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — v0.3.1 schematic review (32/32 checks passed).
- [`G6_Panels_Test_Firmware/test_firmware/single_led/PRODUCTION_ARCHITECTURE.md`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — PIOFULL validation on v0.3.1 panels (PIO viability evidence).
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) `panel/src/constants.cpp` — v0.2 pin layout source (`COL_PIN`, `ROW_PIN`, `SPI_*_PIN`).
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) `panel/src/display.cpp::sch_to_pos_index()` — schematic → physical pin remapping layer (Open Q #5).
- [`iorodeo/LED-Display_G6_Hardware_Panel`](https://github.com/iorodeo/LED-Display_G6_Hardware_Panel) PR `prod_v0p2r0` (head `89960365`) — v0.2 + v0.3 production design source.
- `panel_rp2354_20x20_v0.3.0.pdf` (in `G6_Panels_Test_Firmware/`) — v0.3 schematic PDF.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format — uses the v0.1 mapping for the four worked-example pixels (`pixel[0,0]` → D50, `pixel[0,1]` → D70, `pixel[19,18]` → D340, `pixel[19,19]` → D360).
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v3 Display Modes — defines Triggered + Gated semantics that this file's § v3 EINT firmware contract implements.
- [`g6_07-arena-firmware-interface.md`](g6_07-arena-firmware-interface.md) § v3 Triggered/Gated display relevance — arena-side EINT wiring (Teensy D36 → R25 → all panels' GP45).
- [`g6_00-architecture.md`](g6_00-architecture.md) § Host responsibilities — host owns LED mapping; this file is the data the host uses.
- `Generation 6/Panels/panel_rp2354_20x20_v0p2/` (in submodule, currently uninitialized) — current production panel KiCad source.
- `Generation 6/Panels/panel_rp2354_20x20_v0p3/` (in submodule, currently uninitialized) — parallel revision panel KiCad source.
- `Generation 6/Panels/docs/` (in submodule, currently uninitialized) — authoritative panel hardware docs (when submodule lands).
