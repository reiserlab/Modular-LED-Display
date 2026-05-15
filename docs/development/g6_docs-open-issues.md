# G6 Dev-Set — Open Issues at Handoff

Last updated: 2026-05-15 by mreiser · Status: **Pre-handoff review notes**

This file lists known issues found in a pre-handoff review pass (Codex GPT-5.5 cross-review against the full dev set, run 2026-05-03) that have **not yet been resolved in the spec**. It exists so the next reviewer doesn't re-discover them; once each item is addressed, it should be removed from this list. **This is a temporary meta-doc — when the list is empty, delete the file.**

The live `⚠ Flag` callouts and per-file `Open Questions / TBDs` sections that already exist inside each `g6_*.md` are not restated here; this list is strictly *additional* findings.

---

## A. Spec bugs (clear catches — fix without further discussion)

All five items resolved 2026-05-15 (items 1–4 doc-internal; items 3 and 5 KiCad-verified via `kicad-design-review` skill).

1. ~~**`g6_01:211-213` — GS16 nibble worked examples are reversed.**~~ Fixed 2026-05-15.

2. ~~**`g6_01:368-379` — PSRAM index examples are big-endian.**~~ Fixed 2026-05-15 (indices 1 and 2 swapped to little-endian; index 0 unchanged as it's endian-ambiguous).

3. ~~**`g6_07:177` — MCP4725 alternate-address inconsistency.**~~ Fixed 2026-05-15. KiCad review (Arena `a9ab466e`, `kicad-design-review` skill) confirmed U85 pin 6 (A0) ties to GND → effective I²C address is **`0x60` only**, no alternate. Old open question removed.

4. ~~**`g6_07:182` — D36 listed as a floating spare, contradicts main pin table.**~~ Fixed 2026-05-15. KiCad netlist trace revealed a deeper problem: the original Pin assignments table itself was wrong — TNY.EINT (panel-trigger out) is actually on silk D33 (footprint pin 25) via R25, **not** D36 as previously documented. D36 is U2 DIR (BNC J3 EINT level-translator direction); D34 is U3 DIR (BNC J4 DIO level-translator direction). All three pins (D33, D34, D36) now correctly assigned in `g6_07`, with cascade fixes to `g6_02` and `g6_03` for downstream "D36 → R25 → panels" mentions.

5. ~~**`g6_02:140-144` connector pin table contradicts the CS-shift prose at `g6_02:153-154`.**~~ Fixed 2026-05-15. KiCad review of `reiserlab/LED-Display_G6_Hardware_Panel` v0p3 confirmed: J3 = `[EINT, CS3, CS2, CS1, CS0]` (NOT `+5V` on pin 5 as the old table claimed); J5 = `[EINT, NC, CS3, CS2, CS1]` (CS lines shifted by one pin position vs J3, NOT `+5V` on pin 5). MCU CS0 is hardwired on J3 pin 5 (NOT pin 1 as the old prose claimed). Both table and prose were wrong in different ways; both rewritten against KiCad-verified pin map.

## B. Spec ↔ implementation divergences (both resolved 2026-05-15; fixes untested)

Two cases where the spec and a reference implementation disagreed. Both fixed by editing the implementation to match the spec; both fixes are unverified end-to-end (round-trip vectors need regeneration). See per-item notes for the remaining validation steps.

6. ~~**`webDisplayTools/js/pat-encoder.js:230-232` writes `0x00` for both panel-block header and command bytes.**~~ Fixed 2026-05-15 in [`pat-encoder.js`](../../Generation%206/webDisplayTools/js/pat-encoder.js) — `encodeG6PanelGS2` now writes `block[1] = 0x10`; `encodeG6PanelGS16` writes `block[1] = 0x30`; added `setG6PanelHeaderWithParity()` helper that computes the v1 header byte with parity bit at the end (after cmd + payload + stretch are populated). **UNTESTED 2026-05-15**: the round-trip vectors at `Generation 6/maDisplayTools/g6/g6_encoding_reference.json` need to be re-generated and revalidated against the new encoder output; until that lands, treat the JS-encoder output as untested.

7. ~~**`maDisplayTools/g6/g6_save_pattern.m:93` writes installed-column count to `col_count`, spec says full-grid.**~~ Fixed 2026-05-15 in [`g6_save_pattern.m`](../../Generation%206/maDisplayTools/g6/g6_save_pattern.m) — the `g6_arena_config()` call now receives `full_col_count` instead of `num_installed_cols`, and the `missing_panels` array (already computed using full-grid IDs above) is passed in so the panel mask correctly marks absent panels. **UNTESTED 2026-05-15**: the fix has not been run against the binary writer / round-trip vectors; partial-arena patterns (`G6_2x8of10`, `G6_3x12of18`) need verification before relying on output.

## C. Architectural open questions (input welcomed)

These are not bugs; they're places where the spec is silent or undecided and where reviewer judgment would land cleaner here than after firmware bring-up.

8. ~~**v3 Triggered "unit of display" is implementation-defined, not per-command.**~~ Resolved 2026-05-15. Unit = **one row of the loaded pattern across all 4 BCM bit-planes**. The panel scans row-by-row (20 row drivers + 20 col drivers per `g6_02` § Hardware Reference), so "row + 4 BCM planes" is the natural granularity. Updated in `g6_01` § v3 Display Modes and `g6_02` § Triggered modes; the old "(a row, frame, or row-bit-plane — exact granularity is implementation choice)" wording is gone.

9. **v2/v3 superset compatibility: normative MUST or soft MAY?**
   `g6_01:259` body says panels MUST accept all commands from versions 1 through N. The parenthetical immediately after says "Scope of which commands carry over per version may be narrowed during implementation review — TBD." Pick one. (Recommendation: full superset is what's prototyped; commit to MUST and drop the parenthetical.) *Decision deferred to user's design-review session.*

10. **PSRAM index semantics + preload atomicity.**
    `g6_01` v2 uses "PSRAM index/location" without saying whether the 24-bit value is a byte address, frame slot, record index, or typed handle — plus bounds, alignment, GS2/GS16 type tagging, persistence across reset, full-memory behavior. Separately: if a preload pass is interrupted (one panel reboots mid-load), one panel can hold a different pattern table than its neighbors and the same 24-bit index then drives a spatially inconsistent stimulus. Worth a half-page subsection in `g6_01` § v2 once the address-space question is answered.

## D. Out-of-band action items (already known; not for this review pass)

These remain from the prior session's handover; listed here so the reviewer doesn't re-discover them:

- ~~**SN74LVC1T45 DIR (U2 / U3) — Teensy pin assignment ambiguous from KiCad netlist**~~ Resolved 2026-05-15. KiCad netlist trace via `kicad-design-review`: U2 pin 5 (DIR) → silk **D36** / footprint pin 28 (BNC J3 EINT translator direction); U3 pin 5 (DIR) → silk **D34** / footprint pin 26 (BNC J4 DIO translator direction). The KiCad-auto-net naming convention `NET-(U1-NN_ALT)` uses **silk-label number** + **alternate-function suffix** (the Teensy symbol pin names are formatted `<silk>_<alts...>`, and the symbol's footprint pin numbering matches the standard Teensy 4.1 pinout). The prior assumption that DIR was on D33/pin 25 was wrong: D33 is `TNY.EINT` (the panel-trigger output via R25), not a DIR pin. All three rows now correct in `g6_07` Pin assignments table.
- **`docs/arena.md` in the upstream Arena repo lags v1.1.7** (still recommends v1p1r6). Out-of-band item for `reiserlab/LED-Display_G6_Hardware_Arena`.
- **`pattern.version` in-memory field in `g6_save_pattern.m:131`** is unused by the binary writer; tiny cleanup commit in the `maDisplayTools` submodule.
- **KiCad submodule SSH host-key trust** blocking direct local audit — `ssh-keyscan github.com >> ~/.ssh/known_hosts` once and accept.
- **Arena-config codegen drafted but UNTESTED (2026-05-15).** Three new files inside the `Generation 6/maDisplayTools/` submodule (untracked there, not visible in parent-repo `git status` except as a modified-submodule indicator):
  - `tools/gen_arena_configs.py` — Python codegen
  - `configs/arena_hardware/G6_2x10.yaml` — first hardware-topology sibling
  - `configs/arena_hardware/README.md` — schema docs
  Validation procedure (in the script's banner): run with `--output /tmp/generated.h`, diff against the hand-written reference [`g6_arena_configs.h`](g6_arena_configs.h). If diff is empty, swap the hand-written file for the generated one and add a regen step to the workflow. If diff is non-empty, fix whichever side is wrong before trusting either.

## E. Out of scope (do not address in this review pass)

- The 5 live `⚠ Flag` callouts in the spec body — all are firmware/hardware investigations (v3 trigger edge polarity, SPI clock ceiling, etc.), not spec issues.
- Phase 2 consolidation (collapsing the 7 dev docs into 2-3 public-facing docs at `docs/` level with Jekyll front matter). Gated on the dev set being explicitly called stable.
- G6 panel firmware bring-up, G6 controller firmware bring-up — downstream work after the review pass lands.

---

## Provenance

The list above came from a single cross-review pass: Codex GPT-5.5 (standard + adversarial prompts in parallel) plus an independent Claude pass against the full concat of the 7 `.md` files plus the LED-mapping CSV (2,253 lines staged). Items A.5 and B.6/B.7 are catches I would have missed without the cross-review. Confidence on items A.1–A.4 is high (each was hand-verified against the source line). Confidence on A.5 is high but worth re-confirming once the panel KiCad submodule is initialized. Items in C are explicitly marked open in the source spec already; this section is just a curated subset where reviewer input is most valuable.
