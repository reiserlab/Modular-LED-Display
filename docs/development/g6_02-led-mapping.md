# G6 — Panel LED Mapping (v0.1 hardware)

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tab "Panel LED Mappings", lines 1112–1571) · Last reviewed: 2026-05-01 by mreiser
Status: **Specified for panel v0.1 hardware** — current production hardware is `panel_rp2354_20x20_v0p2` with `v0.3.0` in draft. The 400-row mapping below is the v0.1 PCB layout extracted from the KiCAD production files; per-revision tables for v0.2 / v0.3 are not yet captured here.

This file records the physical LED mapping for one G6 panel — the (row, column) ↔ LED-designator translation that lets host software compute which physical LED corresponds to each logical pixel. The table is the authoritative source for the worked pixel-mapping example in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Pixel Data Format → Example pixel ↔ LED mapping.

> **⚠ Flag — pinned to panel v0.1; production is v0.2 / v0.3:** the 20×20 grid and the 400-row mapping below were extracted from the **panel v0.1** PCB production files. Current production hardware is `panel_rp2354_20x20_v0p2` (per `_data/repos.yml` and the `prod_v0p2r0` PR merged 2026-04-29 in `reiserlab/LED-Display_G6_Hardware_Panel`); a `v0.3.0` panel is in draft (commits `89960365` "fix EINT note position", `429357b1` "cleanup", `62c876d7` "fix XIP_CS1n pind", `02b1acd6` "shrink to 45x45", all 2026-04-09). **Action:** decide whether this file (a) carries one canonical per-revision table per panel revision, with a header row indicating which is current, or (b) is replaced by per-revision tables for v0.2 and v0.3 and the v0.1 mapping is dropped. Until decided, treat the v0.1 mapping as historical.

> **⚠ Flag — production-file extraction not reproducible from this doc:** the source says "extracted from the PCB production files. In the KiCAD PCB, the LEDs are named 'D1' to 'D400'." Concretely, *which* KiCAD file, *which* commit/SHA, and *which* extraction script produced the table is not captured. **Action:** before this doc becomes implementation-driving, link to the specific KiCAD source path (in the `Generation 6/Panels/` submodule) and check in (or document) the extraction script so the table can be regenerated for v0.2 and v0.3.

## Current state

- The v0.1 mapping is canonical for any worked example that references panel v0.1 hardware.
- v0.2 / v0.3 mappings are not yet captured. The panel firmware in [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) implements a *schematic-to-physical* mapping in `panel/src/display.cpp` (`sch_to_pos_index()` at lines 91–114) — that is a different mapping layer from the (logical pixel, row, col) ↔ LED-designator one described here. See [`g6_00-architecture.md`](g6_00-architecture.md) § Host responsibilities and [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Reconciliation D5 for the layering question.

## Grid Layout

The 20×20 matrix below shows the LED designators **in physical PCB layout order** — the way you'd see them looking at the panel face-up. The "D" prefix from KiCAD has been dropped to save horizontal space; "1" here means "D1" in KiCAD, etc.

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

> **⚠ Flag — visual orientation not stated in the source:** the spec says "we want pixel[0,0] to start at the bottom-left corner and pixel[19,19] to end at the top-right" (in the v1 worked example). That implies the grid above is shown with row 0 at the **top** of the printed matrix and row 19 at the **bottom**, but read from the *bottom* up by the host's pixel coordinate system. Document this explicitly. Confirming examples: the bottom-left LED in the grid is D50 (bottom-row, leftmost col), and the table below maps `(row=0, col=0) → 50` ✓.

## Row/Column Mapping Table

Authoritative 400-row lookup: each row gives the LED designator for one logical pixel position. Row indexing is row-major from the bottom-left (`(0, 0)` = bottom-left = D50, `(19, 19)` = top-right = D360).

| ROW | COLUMN | LED |
| :-: | :-: | :-: |
| 0 | 0 | 50 |
| 0 | 1 | 70 |
| 0 | 2 | 51 |
| 0 | 3 | 71 |
| 0 | 4 | 130 |
| 0 | 5 | 150 |
| 0 | 6 | 131 |
| 0 | 7 | 151 |
| 0 | 8 | 210 |
| 0 | 9 | 230 |
| 0 | 10 | 211 |
| 0 | 11 | 231 |
| 0 | 12 | 290 |
| 0 | 13 | 310 |
| 0 | 14 | 291 |
| 0 | 15 | 311 |
| 0 | 16 | 370 |
| 0 | 17 | 390 |
| 0 | 18 | 371 |
| 0 | 19 | 391 |
| 1 | 0 | 10 |
| 1 | 1 | 30 |
| 1 | 2 | 11 |
| 1 | 3 | 31 |
| 1 | 4 | 90 |
| 1 | 5 | 110 |
| 1 | 6 | 91 |
| 1 | 7 | 111 |
| 1 | 8 | 170 |
| 1 | 9 | 190 |
| 1 | 10 | 171 |
| 1 | 11 | 191 |
| 1 | 12 | 250 |
| 1 | 13 | 270 |
| 1 | 14 | 251 |
| 1 | 15 | 271 |
| 1 | 16 | 330 |
| 1 | 17 | 350 |
| 1 | 18 | 331 |
| 1 | 19 | 351 |
| 2 | 0 | 49 |
| 2 | 1 | 69 |
| 2 | 2 | 52 |
| 2 | 3 | 72 |
| 2 | 4 | 129 |
| 2 | 5 | 149 |
| 2 | 6 | 132 |
| 2 | 7 | 152 |
| 2 | 8 | 209 |
| 2 | 9 | 229 |
| 2 | 10 | 212 |
| 2 | 11 | 232 |
| 2 | 12 | 289 |
| 2 | 13 | 309 |
| 2 | 14 | 292 |
| 2 | 15 | 312 |
| 2 | 16 | 369 |
| 2 | 17 | 389 |
| 2 | 18 | 372 |
| 2 | 19 | 392 |
| 3 | 0 | 9 |
| 3 | 1 | 29 |
| 3 | 2 | 12 |
| 3 | 3 | 32 |
| 3 | 4 | 89 |
| 3 | 5 | 109 |
| 3 | 6 | 92 |
| 3 | 7 | 112 |
| 3 | 8 | 169 |
| 3 | 9 | 189 |
| 3 | 10 | 172 |
| 3 | 11 | 192 |
| 3 | 12 | 249 |
| 3 | 13 | 269 |
| 3 | 14 | 252 |
| 3 | 15 | 272 |
| 3 | 16 | 329 |
| 3 | 17 | 349 |
| 3 | 18 | 332 |
| 3 | 19 | 352 |
| 4 | 0 | 48 |
| 4 | 1 | 68 |
| 4 | 2 | 53 |
| 4 | 3 | 73 |
| 4 | 4 | 128 |
| 4 | 5 | 148 |
| 4 | 6 | 133 |
| 4 | 7 | 153 |
| 4 | 8 | 208 |
| 4 | 9 | 228 |
| 4 | 10 | 213 |
| 4 | 11 | 233 |
| 4 | 12 | 288 |
| 4 | 13 | 308 |
| 4 | 14 | 293 |
| 4 | 15 | 313 |
| 4 | 16 | 368 |
| 4 | 17 | 388 |
| 4 | 18 | 373 |
| 4 | 19 | 393 |
| 5 | 0 | 8 |
| 5 | 1 | 28 |
| 5 | 2 | 13 |
| 5 | 3 | 33 |
| 5 | 4 | 88 |
| 5 | 5 | 108 |
| 5 | 6 | 93 |
| 5 | 7 | 113 |
| 5 | 8 | 168 |
| 5 | 9 | 188 |
| 5 | 10 | 173 |
| 5 | 11 | 193 |
| 5 | 12 | 248 |
| 5 | 13 | 268 |
| 5 | 14 | 253 |
| 5 | 15 | 273 |
| 5 | 16 | 328 |
| 5 | 17 | 348 |
| 5 | 18 | 333 |
| 5 | 19 | 353 |
| 6 | 0 | 47 |
| 6 | 1 | 67 |
| 6 | 2 | 54 |
| 6 | 3 | 74 |
| 6 | 4 | 127 |
| 6 | 5 | 147 |
| 6 | 6 | 134 |
| 6 | 7 | 154 |
| 6 | 8 | 207 |
| 6 | 9 | 227 |
| 6 | 10 | 214 |
| 6 | 11 | 234 |
| 6 | 12 | 287 |
| 6 | 13 | 307 |
| 6 | 14 | 294 |
| 6 | 15 | 314 |
| 6 | 16 | 367 |
| 6 | 17 | 387 |
| 6 | 18 | 374 |
| 6 | 19 | 394 |
| 7 | 0 | 7 |
| 7 | 1 | 27 |
| 7 | 2 | 14 |
| 7 | 3 | 34 |
| 7 | 4 | 87 |
| 7 | 5 | 107 |
| 7 | 6 | 94 |
| 7 | 7 | 114 |
| 7 | 8 | 167 |
| 7 | 9 | 187 |
| 7 | 10 | 174 |
| 7 | 11 | 194 |
| 7 | 12 | 247 |
| 7 | 13 | 267 |
| 7 | 14 | 254 |
| 7 | 15 | 274 |
| 7 | 16 | 327 |
| 7 | 17 | 347 |
| 7 | 18 | 334 |
| 7 | 19 | 354 |
| 8 | 0 | 46 |
| 8 | 1 | 66 |
| 8 | 2 | 55 |
| 8 | 3 | 75 |
| 8 | 4 | 126 |
| 8 | 5 | 146 |
| 8 | 6 | 135 |
| 8 | 7 | 155 |
| 8 | 8 | 206 |
| 8 | 9 | 226 |
| 8 | 10 | 215 |
| 8 | 11 | 235 |
| 8 | 12 | 286 |
| 8 | 13 | 306 |
| 8 | 14 | 295 |
| 8 | 15 | 315 |
| 8 | 16 | 366 |
| 8 | 17 | 386 |
| 8 | 18 | 375 |
| 8 | 19 | 395 |
| 9 | 0 | 6 |
| 9 | 1 | 26 |
| 9 | 2 | 15 |
| 9 | 3 | 35 |
| 9 | 4 | 86 |
| 9 | 5 | 106 |
| 9 | 6 | 95 |
| 9 | 7 | 115 |
| 9 | 8 | 166 |
| 9 | 9 | 186 |
| 9 | 10 | 175 |
| 9 | 11 | 195 |
| 9 | 12 | 246 |
| 9 | 13 | 266 |
| 9 | 14 | 255 |
| 9 | 15 | 275 |
| 9 | 16 | 326 |
| 9 | 17 | 346 |
| 9 | 18 | 335 |
| 9 | 19 | 355 |
| 10 | 0 | 45 |
| 10 | 1 | 65 |
| 10 | 2 | 56 |
| 10 | 3 | 76 |
| 10 | 4 | 125 |
| 10 | 5 | 145 |
| 10 | 6 | 136 |
| 10 | 7 | 156 |
| 10 | 8 | 205 |
| 10 | 9 | 225 |
| 10 | 10 | 216 |
| 10 | 11 | 236 |
| 10 | 12 | 285 |
| 10 | 13 | 305 |
| 10 | 14 | 296 |
| 10 | 15 | 316 |
| 10 | 16 | 365 |
| 10 | 17 | 385 |
| 10 | 18 | 376 |
| 10 | 19 | 396 |
| 11 | 0 | 5 |
| 11 | 1 | 25 |
| 11 | 2 | 16 |
| 11 | 3 | 36 |
| 11 | 4 | 85 |
| 11 | 5 | 105 |
| 11 | 6 | 96 |
| 11 | 7 | 116 |
| 11 | 8 | 165 |
| 11 | 9 | 185 |
| 11 | 10 | 176 |
| 11 | 11 | 196 |
| 11 | 12 | 245 |
| 11 | 13 | 265 |
| 11 | 14 | 256 |
| 11 | 15 | 276 |
| 11 | 16 | 325 |
| 11 | 17 | 345 |
| 11 | 18 | 336 |
| 11 | 19 | 356 |
| 12 | 0 | 44 |
| 12 | 1 | 64 |
| 12 | 2 | 57 |
| 12 | 3 | 77 |
| 12 | 4 | 124 |
| 12 | 5 | 144 |
| 12 | 6 | 137 |
| 12 | 7 | 157 |
| 12 | 8 | 204 |
| 12 | 9 | 224 |
| 12 | 10 | 217 |
| 12 | 11 | 237 |
| 12 | 12 | 284 |
| 12 | 13 | 304 |
| 12 | 14 | 297 |
| 12 | 15 | 317 |
| 12 | 16 | 364 |
| 12 | 17 | 384 |
| 12 | 18 | 377 |
| 12 | 19 | 397 |
| 13 | 0 | 4 |
| 13 | 1 | 24 |
| 13 | 2 | 17 |
| 13 | 3 | 37 |
| 13 | 4 | 84 |
| 13 | 5 | 104 |
| 13 | 6 | 97 |
| 13 | 7 | 117 |
| 13 | 8 | 164 |
| 13 | 9 | 184 |
| 13 | 10 | 177 |
| 13 | 11 | 197 |
| 13 | 12 | 244 |
| 13 | 13 | 264 |
| 13 | 14 | 257 |
| 13 | 15 | 277 |
| 13 | 16 | 324 |
| 13 | 17 | 344 |
| 13 | 18 | 337 |
| 13 | 19 | 357 |
| 14 | 0 | 43 |
| 14 | 1 | 63 |
| 14 | 2 | 58 |
| 14 | 3 | 78 |
| 14 | 4 | 123 |
| 14 | 5 | 143 |
| 14 | 6 | 138 |
| 14 | 7 | 158 |
| 14 | 8 | 203 |
| 14 | 9 | 223 |
| 14 | 10 | 218 |
| 14 | 11 | 238 |
| 14 | 12 | 283 |
| 14 | 13 | 303 |
| 14 | 14 | 298 |
| 14 | 15 | 318 |
| 14 | 16 | 363 |
| 14 | 17 | 383 |
| 14 | 18 | 378 |
| 14 | 19 | 398 |
| 15 | 0 | 3 |
| 15 | 1 | 23 |
| 15 | 2 | 18 |
| 15 | 3 | 38 |
| 15 | 4 | 83 |
| 15 | 5 | 103 |
| 15 | 6 | 98 |
| 15 | 7 | 118 |
| 15 | 8 | 163 |
| 15 | 9 | 183 |
| 15 | 10 | 178 |
| 15 | 11 | 198 |
| 15 | 12 | 243 |
| 15 | 13 | 263 |
| 15 | 14 | 258 |
| 15 | 15 | 278 |
| 15 | 16 | 323 |
| 15 | 17 | 343 |
| 15 | 18 | 338 |
| 15 | 19 | 358 |
| 16 | 0 | 42 |
| 16 | 1 | 62 |
| 16 | 2 | 59 |
| 16 | 3 | 79 |
| 16 | 4 | 122 |
| 16 | 5 | 142 |
| 16 | 6 | 139 |
| 16 | 7 | 159 |
| 16 | 8 | 202 |
| 16 | 9 | 222 |
| 16 | 10 | 219 |
| 16 | 11 | 239 |
| 16 | 12 | 282 |
| 16 | 13 | 302 |
| 16 | 14 | 299 |
| 16 | 15 | 319 |
| 16 | 16 | 362 |
| 16 | 17 | 382 |
| 16 | 18 | 379 |
| 16 | 19 | 399 |
| 17 | 0 | 2 |
| 17 | 1 | 22 |
| 17 | 2 | 19 |
| 17 | 3 | 39 |
| 17 | 4 | 82 |
| 17 | 5 | 102 |
| 17 | 6 | 99 |
| 17 | 7 | 119 |
| 17 | 8 | 162 |
| 17 | 9 | 182 |
| 17 | 10 | 179 |
| 17 | 11 | 199 |
| 17 | 12 | 242 |
| 17 | 13 | 262 |
| 17 | 14 | 259 |
| 17 | 15 | 279 |
| 17 | 16 | 322 |
| 17 | 17 | 342 |
| 17 | 18 | 339 |
| 17 | 19 | 359 |
| 18 | 0 | 41 |
| 18 | 1 | 61 |
| 18 | 2 | 60 |
| 18 | 3 | 80 |
| 18 | 4 | 121 |
| 18 | 5 | 141 |
| 18 | 6 | 140 |
| 18 | 7 | 160 |
| 18 | 8 | 201 |
| 18 | 9 | 221 |
| 18 | 10 | 220 |
| 18 | 11 | 240 |
| 18 | 12 | 281 |
| 18 | 13 | 301 |
| 18 | 14 | 300 |
| 18 | 15 | 320 |
| 18 | 16 | 361 |
| 18 | 17 | 381 |
| 18 | 18 | 380 |
| 18 | 19 | 400 |
| 19 | 0 | 1 |
| 19 | 1 | 21 |
| 19 | 2 | 20 |
| 19 | 3 | 40 |
| 19 | 4 | 81 |
| 19 | 5 | 101 |
| 19 | 6 | 100 |
| 19 | 7 | 120 |
| 19 | 8 | 161 |
| 19 | 9 | 181 |
| 19 | 10 | 180 |
| 19 | 11 | 200 |
| 19 | 12 | 241 |
| 19 | 13 | 261 |
| 19 | 14 | 260 |
| 19 | 15 | 280 |
| 19 | 16 | 321 |
| 19 | 17 | 341 |
| 19 | 18 | 340 |
| 19 | 19 | 360 |

> **⚠ Flag — table is the v0.1 mapping only:** this 400-row table is for the v0.1 panel layout. v0.2 and v0.3 mappings need to be added (or this file refactored to per-revision sub-pages). Until then, any worked example that uses this table must explicitly note "using v0.1 LED layout".

## Open Questions / TBDs

1. **Per-revision tables.** Decide whether `g6_02-led-mapping.md` carries one table per panel revision (v0.1 / v0.2 / v0.3 each as their own subsection or adjunct file), or whether it always reflects "current production" with the previous revision moved to an archive subsection.
2. **Extraction script + KiCAD source path.** Capture the script and the specific KiCAD file used to produce the v0.1 table so v0.2 and v0.3 can be regenerated reproducibly.
3. **CSV adjunct vs. inline table.** A 400-row Markdown table is heavy in any viewer. Consider promoting the table to `g6_02-led-mapping.csv` next to this file; the Markdown then describes the schema and links to the CSV. Defer to Phase 2 consolidation.
4. **Visual orientation note.** Make the grid orientation explicit in this file (row 0 = bottom, row 19 = top) so future readers don't have to infer from the v1 worked example.
5. **Layering relative to panel firmware's schematic-to-pin mapping.** This file describes (pixel, row, col) ↔ LED-designator. Panel firmware additionally applies schematic-to-physical-pin remapping (`display.cpp::sch_to_pos_index()` in `iorodeo/g6_firmware_devel`). Confirm the two layers are independent and document which mapping each layer is responsible for. Cross-references the same architecture flag (D5) in [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md).

## Cross-references

- [Source Google Doc, "Panel LED Mappings" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this file.
- [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Example pixel ↔ LED mapping — uses this table for the four worked-example pixels (`pixel[0,0]` → D50, `pixel[0,1]` → D70, `pixel[19,18]` → D340, `pixel[19,19]` → D360).
- [`g6_00-architecture.md`](g6_00-architecture.md) § Host responsibilities — host owns LED mapping; this file is the data the host uses.
- `Generation 6/Panels/panel_rp2354_20x20_v0p2/` (in submodule) — current production panel.
- `Generation 6/Panels/panel_rp2354_20x20_v0p3/` (draft, in submodule) — next-revision panel.
