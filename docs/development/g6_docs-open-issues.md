# G6 Dev-Set — Open Issues at Handoff

Last updated: 2026-05-15 by mreiser · Status: **Pre-handoff review notes** (post Codex cross-review pass)

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

6. ~~**`webDisplayTools/js/pat-encoder.js:230-232` writes `0x00` for both panel-block header and command bytes.**~~ Fixed 2026-05-15. `encodeG6PanelGS2`/`encodeG6PanelGS16` now write correct cmd bytes (0x10/0x30); `setG6PanelHeaderWithParity()` helper sets the v1 header byte with parity over version + cmd + payload + stretch. JSDoc + dimension-check comments also updated (full-grid `col_count` semantics; partial-arena support still requires structural changes to the encoder — flagged in code comment). **UNTESTED**: `g6_encoding_reference.json` round-trip vectors must be regenerated after MATLAB parity fix (see item 7).

7. ~~**`maDisplayTools/g6/g6_save_pattern.m:93` writes installed-column count to `col_count`, spec says full-grid.**~~ Fixed 2026-05-15, **second pass needed and applied**: original fix passed `missing_panels` to `g6_arena_config()` but `create_panel_mask()` discarded the arg (signature `(row_count, col_count, ~)`). Second-pass fix actually wires `missing_panels` through to clear-bit logic; comment block rewritten with new full-grid semantics. **Companion MATLAB parity fix (Codex-caught):** `g6_encode_panel.m::compute_header()` was omitting the version bit from the parity count, producing inverted parity vs. spec. Fixed to include bits 0–6 of byte 0. Both fixes UNTESTED end-to-end; regenerate `g6_encoding_reference.json` and confirm JS+MATLAB agree before relying on either.

## C. Architectural open questions (input welcomed)

These are not bugs; they're places where the spec is silent or undecided and where reviewer judgment would land cleaner here than after firmware bring-up.

8. ~~**v3 Triggered "unit of display" is implementation-defined, not per-command.**~~ Resolved 2026-05-15. Unit = **one row of the loaded pattern across all 4 BCM bit-planes**. The panel scans row-by-row (20 row drivers + 20 col drivers per `g6_02` § Hardware Reference), so "row + 4 BCM planes" is the natural granularity. Updated in `g6_01` § v3 Display Modes and `g6_02` § Triggered modes; the old "(a row, frame, or row-bit-plane — exact granularity is implementation choice)" wording is gone.

9. **v2/v3 superset compatibility: normative MUST or soft MAY?**
   `g6_01:259` body says panels MUST accept all commands from versions 1 through N. The parenthetical immediately after says "Scope of which commands carry over per version may be narrowed during implementation review — TBD." Pick one. (Recommendation: full superset is what's prototyped; commit to MUST and drop the parenthetical.) *Decision deferred to user's design-review session.*

10. **PSRAM index semantics + preload atomicity.**
    `g6_01` v2 uses "PSRAM index/location" without saying whether the 24-bit value is a byte address, frame slot, record index, or typed handle — plus bounds, alignment, GS2/GS16 type tagging, persistence across reset, full-memory behavior. Separately: if a preload pass is interrupted (one panel reboots mid-load), one panel can hold a different pattern table than its neighbors and the same 24-bit index then drives a spatially inconsistent stimulus. Worth a half-page subsection in `g6_01` § v2 once the address-space question is answered.

## C-bis. Second-pass spec fixes from Codex cross-review (resolved 2026-05-15)

Items surfaced by the Codex cross-review (2026-05-15) against the prior session's diff. All addressed in the same pass.

- **ISP_ENTER reply doesn't fit standard 3-byte confirmation slot.** Resolved by specifying an **extended ISP confirmation format** (`header + echoed_cmd + N-byte response_payload + 8-bit checksum`) with per-opcode response lengths. ISP_ENTER carries its response on the SAME transaction (20 bytes total) because no prior ISP command exists to piggyback on. See [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § ISP confirmation format.

- **ISP_VERIFY_CRC payload was missing the session nonce** while the state-machine paragraph said nonce was required on every opcode. Fixed: added 4-byte nonce to `0xE3` payload. VERIFY response now also includes panel-computed CRC32 (5-byte response: 1-byte status + 4-byte CRC).

- **ISP per-page CRC32 byte coverage was underspecified.** Fixed: explicitly states "CRC32 over the 256 data bytes only" in the `0xE2` row.

- **Master command summary table didn't list new ISP opcodes** despite claiming to be "complete reference of all commands v1–v4." Added 5 rows for `0xE0`–`0xE4` to the master table; with note that ISP opcodes use the extended confirmation slot.

- **`g6-program-panel` Host Command Summary row was labeled "v1 (G6-new)"** but its wire form starts with `0x02` (v2 prefix). Relabeled to "v2 (G6-new)" to match `g6-panel-storage-mode`'s convention.

- **`g6_07:91` still had the OLD (wrong) J3/J5 CS-shift prose** after the panel KiCad fix updated `g6_02:142+`. Rewritten to match the corrected canonical mapping (J3 pin 5 → MCU CS0, J5 pin 2 = NC, EINT through-pass on pin 1).

- **`g6_07:180` (DIO/EINT level-translator bullet) implied `pinMode` was sufficient** to set translator direction. After the U2/U3 DIR clarification, this is wrong — firmware must explicitly drive D36 (U2 DIR) and D34 (U3 DIR). Bullet rewritten.

- **`pat-encoder.js` JSDoc + dimension-check semantics** still assumed `col_count = installed columns`. JSDoc updated to "full grid columns" per spec. Added a "KNOWN LIMITATION" comment block explaining that partial-arena support needs a structural change (separate `fullColCount` + `installedCols` fields); G6_2x10 works correctly today because installed = full for that geometry.

- **Arena hardware schema required one YAML per geometry name** which would have caused codegen to skip G6_2x8of10 (same hardware as G6_2x10). Refactored: geometry YAMLs now declare `hardware_profile:` field; hardware YAMLs are keyed by profile, not geometry. Codegen resolves geometry → profile → topology file. Result: G6_2x10 + G6_2x8of10 both compile against `arena_10-10_v1p1r7.yaml`. Codegen smoke-tested end-to-end (produces 2 arenas + skips G6_3x12of18 cleanly).

- **Codegen error handling.** Now catches `yaml.YAMLError`, `TypeError`, `OSError` in addition to `KeyError`/`ValueError`; per-arena skip with reason instead of stack-trace abort.

## C-bis open / deferred items (Codex-surfaced design pressure)

These are real points Codex raised that the second-pass spec changes acknowledge but don't fully resolve:

- **ISP-in-v1 vs separate protocol version.** Adversarial reviewer argued for a dedicated ISP protocol with explicit `BOOT_TO_ISP` transition. Current spec keeps the v1-namespace approach but downgrades the ISP section's status to **"Draft — design-review needed"** and adds a § "ISP open questions" with four flagged design holes (atomic staging, image authenticity, version-evolution, mixed-firmware-on-failure).

- **`g6_arena_configs.h` static-const-in-header.** Multiple TUs `#include`ing the header each get their own copy of the arena table. Codegen still emits the same pattern. **Deferred** to a follow-up that splits codegen output into `.h` (extern decls) + `.c` (definitions).

- **Host vs controller parity ownership contradiction** between `g6_03:47` ("controller adds parity") and `g6_04:92` ("host pre-computes parity; controller transmits raw"). Pre-existing; not addressed in this pass.

- **Stale config names in `maDisplayTools/README.md`** (`G6_2x10_full`, `G6_2x8_walking`). Pre-existing; not addressed in this pass.

- **Round-trip vector regeneration.** Required after both encoders' parity is consistent (Codex's MATLAB-parity catch means the previous `g6_encoding_reference.json` is also wrong; regenerate against the fixed MATLAB encoder, then revalidate JS against it).

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
