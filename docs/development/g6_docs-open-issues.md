# G6 Dev-Set — Open Issues at Handoff

Last updated: 2026-05-04 by mreiser · Status: **Pre-handoff review notes**

This file lists known issues found in a pre-handoff review pass (Codex GPT-5.5 cross-review against the full dev set, run 2026-05-03) that have **not yet been resolved in the spec**. It exists so the next reviewer doesn't re-discover them; once each item is addressed, it should be removed from this list. **This is a temporary meta-doc — when the list is empty, delete the file.**

The live `⚠ Flag` callouts and per-file `Open Questions / TBDs` sections that already exist inside each `g6_*.md` are not restated here; this list is strictly *additional* findings.

---

## A. Spec bugs (clear catches — fix without further discussion)

These are direct contradictions or errors inside the spec. Six of seven are one-or-two-line edits.

1. **`g6_01:211-213` — GS16 nibble worked examples are reversed from the encoding rule.**
   The rule at `g6_01:191` says even pixels use the upper nibble (`>>4`), odd pixels use the lower nibble (`& 0x0F`). The worked examples then show `pixel[0,0]` (even) using "bits 0…3" and `pixel[0,1]` (odd) using "bits 4…7" — backwards. An implementer following the examples would produce mirror-flipped GS16 output. Fix the example bit ranges to match the rule.

2. **`g6_01:368-379` — PSRAM index examples are big-endian, contradicting the file-wide little-endian rule.**
   `g6_01:71` and `g6_01:324` both mandate little-endian for multi-byte integers, but the v2 workflow examples encode pattern 1 as `[0x00 0x00 0x01]`. Fix to `[0x01 0x00 0x00]` (or use index 256 → `[0x00 0x01 0x00]` for an unambiguous illustration). Re-check all 24-bit-index examples in `g6_01` and `g6_03`.

3. **`g6_07:177` — MCP4725 alternate-address inconsistency.**
   Line 177 says "default 0x60/0x62"; line 191 says "0x60 / 0x61". The MCP4725A0T-E/CH (factory bits A2:A0 = 000) toggles only on the A0 pin, giving `0x60`/`0x61` only. Drop "0x62" in line 177.

4. **`g6_07:182` — D36 listed as a floating spare, contradicts main pin table.**
   Line 38 assigns Teensy pin 28 / D36 to `TNY.EINT` (the panel-trigger output). Line 182 then says "Pins 26, 28 (D34, D36) are auto-named, also floating." Same pin can't be both. Remove D36 from the floating-spare list.

5. **`g6_02:140-144` connector pin table contradicts the CS-shift prose at `g6_02:153-154`.**
   The table says J3 pin 1 = EINT, pin 2 = CS3, pin 3 = CS2, pin 4 = CS1, pin 5 = +5V. The prose immediately after says J3 pin 1 → MCU CS0, pin 2 = CS1, pin 3 = CS2, pin 4 = CS3, pin 5 = EINT. Plus J5 pin 4 = CS1 (table) vs NC (prose), and J5 pin 5 = +5V (table) vs EINT (prose). The two describe different connectors. Resolve against the panel KiCad source (`iorodeo/LED-Display_G6_Hardware_Panel`, currently uninitialized as a submodule — blocked on SSH host-key trust) and replace both the table and prose with one consistent pin map.

## B. Spec ↔ implementation divergences (need a decision before edit)

Two cases where the spec and a reference implementation disagree. The fix depends on which side is canonical.

6. **`webDisplayTools/js/pat-encoder.js:230-232` writes `0x00` for both panel-block header and command bytes.**
   The spec (`g6_04:158`, `g6_04:80-93`) says blocks are pre-formatted as `[header (0x01/0x81)][command (0x10/0x30)][pixels][stretch]` and the controller transmits them "without modification". The JS encoder writes `block[0] = 0x00; block[1] = 0x00;` with comment "Header byte (panel address, typically 0)" — author appears to have misread the protocol. As written, the controller transmitting these blocks raw would produce a parity-version mismatch and the panel would reject every message.
   - **Decision needed:** fix the JS encoder to write valid panel-protocol bytes, **or** edit the spec to say the controller sets header+cmd before SPI transmission (which would require revising the "without modification" claim and the round-trip-validation language in `g6_04` and `g6_06`).
   - If the encoder is fixed, also recheck the round-trip-validated test vectors in `Generation 6/maDisplayTools/g6/g6_encoding_reference.json` — they may currently be validating the broken format.

7. **`maDisplayTools/g6/g6_save_pattern.m:93` writes installed-column count to `col_count`, spec says full-grid.**
   `g6_04:33` defines byte 9 as "**Full** grid columns in arena (subset installed via panel mask)". The MATLAB writer constructs `arena_config = g6_arena_config(row_count, num_installed_cols, [])` and stores that into the pattern header. For partial arenas (e.g. `G6_2x8of10`, `G6_3x12of18`), `panel_id = row × col_count + col` will produce incorrect IDs.
   - **Decision needed:** fix the MATLAB writer to pass full-grid `col_count`, **or** edit the spec to say `col_count` is installed-cols and rewrite the panel-mask interpretation accordingly.

## C. Architectural open questions (input welcomed)

These are not bugs; they're places where the spec is silent or undecided and where reviewer judgment would land cleaner here than after firmware bring-up.

8. **Region / SPI-bus info missing from the canonical 18-byte pattern header.**
   `g6_03:343`, `g6_04:187`, `g6_06:91` all flag this. Implicit "cols 0-4 → region 0, 5-9 → region 1" rule works for `arena_10-10` only. Three options on the table: (a) sidecar arena-config file, (b) compute from `col_count` + fixed regions, (c) reserved bytes in the v2 header now (cheapest if anyone other than `arena_10-10` ships later). Worth deciding before the pattern format is in many hands.

9. **v3 Triggered "unit of display" is implementation-defined, not per-command.**
   `g6_01:394` says each EINT edge fires "one row, one frame, or one row-bit-plane (exact granularity per command)" — but the per-command granularity isn't specified. External synchronization (the entire reason v3 Triggered exists) cannot be implemented against an undefined display unit. Pick one, or expose the choice via `get-controller-info` so the host can adapt.

10. **v2/v3 superset compatibility: normative MUST or soft MAY?**
    `g6_01:259` body says panels MUST accept all commands from versions 1 through N. The parenthetical immediately after says "Scope of which commands carry over per version may be narrowed during implementation review — TBD." Pick one. (Recommendation: full superset is what's prototyped; commit to MUST and drop the parenthetical.)

11. **PSRAM index semantics + preload atomicity.**
    `g6_01` v2 uses "PSRAM index/location" without saying whether the 24-bit value is a byte address, frame slot, record index, or typed handle — plus bounds, alignment, GS2/GS16 type tagging, persistence across reset, full-memory behavior. Separately: if a preload pass is interrupted (one panel reboots mid-load), one panel can hold a different pattern table than its neighbors and the same 24-bit index then drives a spatially inconsistent stimulus. Worth a half-page subsection in `g6_01` § v2 once the address-space question is answered.

## D. Out-of-band action items (already known; not for this review pass)

These remain from the prior session's handover; listed here so the reviewer doesn't re-discover them:

- **D33 (SN74LVC1T45 U2 DIR) needs adding to the `g6_07` Pin assignments table.** Cell content already drafted in `g6_07:192` Open Q #3.
- **`docs/arena.md` in the upstream Arena repo lags v1.1.7** (still recommends v1p1r6). Out-of-band item for `reiserlab/LED-Display_G6_Hardware_Arena`.
- **`pattern.version` in-memory field in `g6_save_pattern.m:131`** is unused by the binary writer; tiny cleanup commit in the `maDisplayTools` submodule.
- **KiCad submodule SSH host-key trust** blocking direct local audit — `ssh-keyscan github.com >> ~/.ssh/known_hosts` once and accept.

## E. Out of scope (do not address in this review pass)

- The 5 live `⚠ Flag` callouts in the spec body — all are firmware/hardware investigations (v3 trigger edge polarity, SPI clock ceiling, etc.), not spec issues.
- Phase 2 consolidation (collapsing the 7 dev docs into 2-3 public-facing docs at `docs/` level with Jekyll front matter). Gated on the dev set being explicitly called stable.
- G6 panel firmware bring-up, G6 controller firmware bring-up — downstream work after the review pass lands.

---

## Provenance

The list above came from a single cross-review pass: Codex GPT-5.5 (standard + adversarial prompts in parallel) plus an independent Claude pass against the full concat of the 7 `.md` files plus the LED-mapping CSV (2,253 lines staged). Items A.5 and B.6/B.7 are catches I would have missed without the cross-review. Confidence on items A.1–A.4 is high (each was hand-verified against the source line). Confidence on A.5 is high but worth re-confirming once the panel KiCad submodule is initialized. Items in C are explicitly marked open in the source spec already; this section is just a curated subset where reviewer input is most valuable.
