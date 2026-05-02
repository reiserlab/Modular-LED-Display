# G6 — Panel Hardware Reference (v0.2 + v0.3) and LED Mapping

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Panel LED Mappings", lines 1112–1571) — LED mapping section · v0.3 hardware extracted from `panel_rp2354_20x20_v0.3.0.pdf` in [`G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) · v0.2 hardware-relevant pin layout from [`g6_firmware_devel/panel/src/constants.cpp`](https://github.com/iorodeo/g6_firmware_devel) `@ 6944894` · Last reviewed: 2026-05-02 by mreiser
Status: **Specified for v0.2 + v0.3** (firmware-relevant pin/PIO/peripheral deltas captured) · v0.1 LED designator mapping table extracted to [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) adjunct · v0.2 / v0.3 LED designator tables pending KiCad source access (Panels submodule blocked on SSH host-key trust per handover).

This file captures the firmware ↔ panel-hardware contract for the two in-house G6 panel revisions (v0.2 production, v0.3 parallel revision), plus the LED designator mapping that lets host software compute which physical LED corresponds to each logical pixel. The major firmware-relevant delta between v0.2 and v0.3 is **pin/column wiring + PIO viability**: v0.3 has fully contiguous COL and ROW GPIO ranges suitable for dual-PIO drive; v0.2 has a SPI block that splits the ROW range and forces CPU-driven row scan (or a more complex PIO mapping).

## Revisions in scope

- **v0.1** — legacy reference; the 20×20 LED-designator mapping at the bottom of this file is from v0.1 and is used in the [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format worked example. **Not built today.**
- **v0.2** — `panel_rp2354_20x20_v0p2`; **current production**; in-house. The `prod_v0p2r0` PR was merged 2026-04-29 in `reiserlab/LED-Display_G6_Hardware_Panel`. Firmware-relevant pin layout below is recovered from `g6_firmware_devel @ 6944894` (`panel/src/constants.cpp`); full PCB confirmation pending KiCad submodule init.
- **v0.3** — `panel_rp2354_20x20_v0p3`; parallel revision; in-house but **not enough boards yet for full systems**. Hardware below is captured from `panel_rp2354_20x20_v0.3.0.pdf` (KiCad PDF dated 2026-04-09, included in the `G6_Panels_Test_Firmware` repo for reference).

Firmware will need to support both v0.2 and v0.3 — a board-id mechanism (build-time `#define`, runtime detection via spare GPIO, or magic bytes on PSRAM) is TBD. See Open Question #4 below.

## MCU and memory subsystem

| Aspect | v0.2 | v0.3 |
|---|---|---|
| MCU | Raspberry Pi RP2354B QFN-80 (per filename convention `panel_rp2354_*`; confirm against KiCad) | **Raspberry Pi RP2354B QFN-80** (confirmed; `panel_mcu.kicad_sch`) |
| Crystal | 12 MHz (assumed; confirm against KiCad) | **12 MHz ABM8-272-T3** (with 15 pF C1/C2 + R5 series) |
| Secondary PSRAM | APS6404L-3SQR 8 MB QSPI (assumed; confirm against KiCad) | **APS6404L-3SQR** 8 MB QSPI on `XIP_CS1n` (R29 = 33 Ω series); QSPI lines `QSPI_SD0..3` + `QSPI_SCLK` shared with primary flash interface |
| 1V1 rail | RP2354B internal switching regulator (3.3 µH inductor, VREG_AVDD/VIN/FB/LX/PGND) | RP2354B internal switching regulator (3.3 µH inductor; same topology) |
| 3V3 rail | AP2112K-3.3 LDO (assumed; confirm against KiCad) | **AP2112K-3.3TRG1** LDO (LCSC PN C51118; Digikey AP2112K-3.3TRG1DICT-ND); 10 µF input + 10 µF output caps |
| 5 V input | USB | USB |

## Pin assignments

The load-bearing firmware contract. Pin assignments differ between v0.2 and v0.3 — this is the source of the PIO-viability delta below.

### v0.2 (recovered from `g6_firmware_devel/panel/src/constants.cpp:7–22`)

| Function | RP2354 pin | Notes |
|---|---|---|
| SPI SCK | 34 | Mode 3 (CPOL=1, CPHA=1), MSB-first, 30 MHz |
| SPI MOSI | 32 | |
| SPI MISO | 35 | |
| SPI CS | 33 | |
| COL drive (20 lines) | **1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20** | Sequential ✓ (PIO-clean for COL state machine) |
| ROW drive (20 lines) | **21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 36, 37, 38, 39, 40, 41, 42, 43, 44** | **Split** (gap 32–35 reserved for SPI) ⚠ |
| EINT (external trigger), USB_BOOT, RUN, XIP_CS1n (PSRAM) | TBD | Not declared in firmware constants; recover from KiCad once submodule accessible |

### v0.3 (from `panel_rp2354_20x20_v0.3.0.pdf` p.2)

| Function | RP2354 GPIO | Pin # | Notes |
|---|---|---|---|
| SPI MOSI | GPIO40 (ADC0) | 49 | |
| SPI CS0 | GPIO41 (ADC1) | 52 | |
| SPI SCK | GPIO42 (ADC2) | 53 | |
| QSPI XIP_CS1n (PSRAM) | GPIO43 (ADC3) | 56 | R29 = 33 Ω series to APS6404L `XIP_CS1n` |
| SPI MISO | GPIO44 (ADC4) | 55 | |
| EINT (external trigger) | GPIO45 (ADC5) | 56 | |
| Spare | GPIO46 (ADC6), GPIO47 (ADC7) | — | Unused; available for board-id, telemetry, etc. |
| COL drive (20 lines) | **GPIO0–GPIO19** | 77, 78, 79, 80, 1–8, 11–18 | Sequential ✓ (PIO-clean) |
| ROW drive (20 lines) | **GPIO20–GPIO39** | 21–29, 36, 38, 39, 40, 41, 43, 45, 46, 47, 48 | Sequential ✓ (PIO-clean) |
| USB DP / DM | GPIO66 / GPIO67 (USB_DP / USB_DM) | 67 / 68 | R7 / R8 = 27 Ω series, placed close to RP2354 |
| USB_BOOT switch | drives QSPI_SS via R3 = 1 kΩ | — | SW1 momentary push; pulls QSPI_SS LOW on boot |
| RUN switch | drives RUN via R2 = 1 kΩ | 35 | SW2 momentary push; resets MCU |

## PIO viability — the major firmware-relevant delta

**v0.2:** 20 contiguous COL GPIOs (1–20) → COL drive can use one PIO state machine for parallel column output. ROW GPIOs split into two ranges (21–31 and 36–44) by the SPI block on 32–35 → **dual-PIO `PIOFULL` (PIO0 cols, PIO1 rows) requires non-contiguous ROW mapping or splitting the ROW state machine**. CPU-driven row scan (BCMBURST architecture, validated in `G6_Panels_Test_Firmware`) works fine; PIO row scan needs careful work.

**v0.3:** Both COL (GPIO0–GPIO19) and ROW (GPIO20–GPIO39) are fully contiguous, with SPI relocated to GPIO40–45 (out of the way). **Dual-PIO `PIOFULL` is straightforward** — validated end-to-end against v0.3.1 panels in `G6_Panels_Test_Firmware @ bb26a44` (see `single_led/PRODUCTION_ARCHITECTURE.md` § 5 PIOFULL).

**Firmware implication:** `iorodeo/g6_firmware_devel` (today targets v1 protocol on v0.2-style panels) uses CPU row scan. To run the same firmware on v0.3 hardware, pin assignments need to flip and the row driver may optionally upgrade to PIO. To support both panel revisions in a single firmware binary, a board-id mechanism is TBD (Open Question #4).

## LED drivers and matrix

- **40× UCC27517** single-channel low-side gate drivers per panel — 20 column drivers (U3–U22) + 20 row drivers (U23–U42), each fed by 100 nF decoupling cap (C19–C58), shared 10 µF bulk caps (C59–C76) on +5 V. (v0.3 confirmed; v0.2 same chip per BOM expectation — flag for KiCad confirmation.)
- **20×20 LED matrix** = 400 LEDs (designators D1–D400). Series resistors **R9–R28** at the column inputs (5 unique resistor values cycling `R_T0`/`R_T1`/`R_T2`/`R_T3` across 4-LED groups).
- **LED part:** yellow-green per `XL0402YGC.PDF` and "Photoelectric parameters … BIN at 5mA.pdf" datasheets in `G6_Panels_Test_Firmware/`.

## Connectors

### USB (data + power)

**JST-SH 4-pin** Stemma-QT/QWIIC-style (`Conn_01x04`, J1). Pinout: 1=GND, 2=D+, 3=D−, 4=+5 V. Needs USB-to-Stemma adapter cable (M5Stack `connector-grove-to-usb-c` + SparkFun Grove-to-JST-SH `15109` per schematic notes). USB series resistors **R7 / R8 = 27 Ω**, placed close to RP2354 (callout in panel_mcu sheet).

### SPI / EINT inter-panel headers (4× 1×5)

| Header | Position | Pin 1 | Pin 2 | Pin 3 | Pin 4 | Pin 5 |
|---|---|---|---|---|---|---|
| **J2** | bottom (`Conn_01x05`) | MISO | MOSI | SCK | GND | +5 V |
| **J3** | bottom (`Conn_01x05`) | EINT | CS3 | CS2 | CS1 | +5 V |
| **J4** | top (`Conn_01x05`, mirror of J2) | MISO | MOSI | SCK | GND | +5 V |
| **J5** | top (`Conn_01x05`) | EINT | NC ("X" in schematic) | CS2 | CS1 | +5 V |

**Header parts** (per schematic procurement notes):

- v0.2 / latest: JLCPCB/LCSC PN C7298801; Digikey 952-M20-8890545RCT-ND or 952-3266-ND
- v0.1.3 (legacy): LCSC C5142238 (HX-PZZ254-1×5P-WT), C46061678
- Female receptacle (top side): Digikey S5HH-105-02-T-S, Manufacturer SMH-105-02-T-S; LCSC C5142238 (X6511FRS-05-CB5D30) for v0.1.3

**CS routing — open question:** v0.3 schematic shows three CS lines (CS1/CS2/CS3) plus EINT pass through the headers, but only one CS reaches the MCU as `CS0` per the top-level sheet. The selection mechanism (PCB jumper? 0-Ω resistor? slot position?) is not visible in the per-page schematic sheets readable here — needs full hierarchical schematic review or annotated KiCad project. See Open Question #3.

## 3V3 power supply (panel_usb_power sheet)

- **Regulator:** AP2112K-3.3TRG1 LDO (U43)
- **Caps:** C67 = 10 µF input, C68 = 10 µF output

## LED designator mapping (v0.1)

The 400-row v0.1 LED designator table is now in [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) (CSV with header `row,col,led` + 400 data rows). v0.2 and v0.3 designator tables are pending KiCad source access (Open Question #2).

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

## Open Questions / TBDs

1. **KiCad confirmation pass for v0.2 hardware.** Several v0.2 hardware-row entries above (MCU revision letter, PSRAM exact part, LED driver part, header form factor, EINT/USB_BOOT/RUN/XIP_CS1n pin numbers) are inferred from the v0.3 schematic + `panel_rp2354_20x20_v0p2` filename convention. Confirm against KiCad once `Generation 6/Panels` submodule is initialized (blocked on SSH host-key trust per handover).
2. **Per-revision LED designator tables for v0.2 and v0.3.** Need a KiCad-source extraction script. Once available, add `g6_02-led-mapping-v0p2.csv` and `g6_02-led-mapping-v0p3.csv` companions following the same `row,col,led` schema. Layering vs `display.cpp::sch_to_pos_index()` — confirm the two mapping layers are independent.
3. **CS-line routing per panel position.** v0.3 schematic shows CS1/CS2/CS3 + EINT pass through the inter-panel headers, but only one CS line reaches the MCU as `CS0` per the top-level sheet. The selection mechanism (PCB jumper, 0-Ω resistor, slot-position routing) is not visible in the per-page schematic sheets — needs full hierarchical schematic review.
4. **Board-id mechanism for firmware to detect v0.2 vs v0.3.** Build-time `#define` (separate firmware binaries)? Runtime ID via spare GPIO (e.g. v0.3's GPIO46 / GPIO47)? Magic bytes on PSRAM populated at factory? Decide before unified firmware ships.
5. **Layering vs `display.cpp::sch_to_pos_index`.** This file describes (logical pixel, row, col) ↔ LED-designator. Panel firmware additionally applies schematic-to-physical-pin remapping (`display.cpp::sch_to_pos_index()` in `iorodeo/g6_firmware_devel`, lines 91–114, with `NUM_COLOR = 4` quadrant scheme). Confirm the two layers are independent and document which mapping each layer is responsible for. Cross-references the same flag (D5) in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md).

## History & Reconciliation

Earlier versions of this file (pre-2026-05-02) were titled "G6 — Panel LED Mapping (v0.1 hardware)" and carried the 400-row v0.1 LED designator table inline. Per user direction 2026-05-02, scope expanded to "Panel Hardware Reference (v0.2 + v0.3)" capturing the firmware ↔ panel-hardware contract for both in-house revisions. The 400-row v0.1 table was extracted to `g6_02-led-mapping-v0p1.csv` (commit message documents the extraction). v0.2 hardware data is recovered from `g6_firmware_devel @ 6944894` until `Generation 6/Panels` submodule is initialized; v0.3 hardware data is from `panel_rp2354_20x20_v0.3.0.pdf` in `G6_Panels_Test_Firmware`.

## Cross-references

- [Source Google Doc, "Panel LED Mappings" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — v0.1 LED mapping verbatim source.
- [`g6_02-led-mapping-v0p1.csv`](g6_02-led-mapping-v0p1.csv) — full 400-row v0.1 LED designator mapping (extracted from this file 2026-05-02).
- `panel_rp2354_20x20_v0.3.0.pdf` (in `G6_Panels_Test_Firmware/`) — v0.3 schematic source.
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) `panel/src/constants.cpp` — v0.2 pin layout source (`COL_PIN`, `ROW_PIN`, `SPI_*_PIN`).
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) `panel/src/display.cpp::sch_to_pos_index()` — schematic → physical pin remapping layer (Open Q #5).
- [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) `single_led/PRODUCTION_ARCHITECTURE.md` — PIOFULL validation on v0.3.1 panels (PIO viability evidence).
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format — uses the v0.1 mapping for the four worked-example pixels (`pixel[0,0]` → D50, `pixel[0,1]` → D70, `pixel[19,18]` → D340, `pixel[19,19]` → D360).
- [`g6_00-architecture.md`](g6_00-architecture.md) § Host responsibilities — host owns LED mapping; this file is the data the host uses.
- `Generation 6/Panels/panel_rp2354_20x20_v0p2/` (in submodule, currently uninitialized) — current production panel.
- `Generation 6/Panels/panel_rp2354_20x20_v0p3/` (in submodule, currently uninitialized) — parallel revision panel.
- `Generation 6/Panels/docs/` (in submodule, currently uninitialized) — authoritative panel hardware docs (when submodule lands).
