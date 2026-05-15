# G6 Dev-Set — Open Issues

Genuinely open items only. Resolved items are deleted (the git log preserves them). When this file is empty, delete it.

Live `⚠ Flag` callouts and per-file `Open Questions / TBDs` sections inside each `g6_*.md` are not restated here; this list is strictly *additional* cross-cutting findings.

---

## Spec decisions still open

- **v2/v3 superset compatibility: normative MUST or soft MAY?** `g6_01-panel-protocol.md` § v2 body says panels MUST accept all commands from versions 1 through N; the parenthetical that follows says scope may be narrowed during implementation review. Pick one. Recommendation: commit to MUST (matches what's prototyped) and drop the parenthetical. Deferred to design-review session.

- **PSRAM index semantics + preload atomicity.** `g6_01` v2 uses "PSRAM index/location" without saying whether the 24-bit value is a byte address, frame slot, record index, or typed handle — plus bounds, alignment, GS2/GS16 type tagging, persistence across reset, full-memory behavior. Separately: if a preload pass is interrupted (one panel reboots mid-load), one panel can hold a different pattern table than its neighbors and the same 24-bit index then drives a spatially inconsistent stimulus. Needs a half-page subsection in `g6_01` § v2 once the address-space question is answered.

## Deferred design pressure (Codex-surfaced, acknowledged but not closed)

- **ISP-in-v1 vs separate protocol version.** Putting flash-write opcodes in v1 means every future v2/v3/v4 panel firmware must continue to support them. A dedicated ISP protocol with explicit `BOOT_TO_ISP` transition would isolate dangerous operations and survive version evolution. The ISP section is currently marked **"Draft — design-review needed"** with four flagged design holes (atomic staging, image authenticity, version-evolution, mixed-firmware-on-failure) — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § ISP open questions.

- **`g6_arena_configs.h` static-const-in-header.** Multiple TUs `#include`ing the header each get their own copy of the arena table. Codegen emits the same pattern; cleanest fix is to split codegen output into `.h` (extern decls) + `.c` (definitions). Deferred to a follow-up codegen pass.

- **Host vs controller parity ownership contradiction** between `g6_03-controller.md` § Modify-for-G6 ("controller adds parity") and `g6_04-pattern-file-format.md` § Transmission ("host pre-computes parity; controller transmits raw"). Pre-existing in the dev set.

- **Stale config names in `Generation 6/maDisplayTools/README.md`** (`G6_2x10_full`, `G6_2x8_walking` — don't match registered names `G6_2x10`, `G6_2x8of10`). Out-of-band item for the maDisplayTools submodule.

- **Round-trip vector regeneration.** `Generation 6/maDisplayTools/g6/g6_encoding_reference.json` was generated against pre-fix MATLAB output. After the MATLAB parity + col_count fixes, regenerate against the corrected encoder and confirm JS+MATLAB agree byte-for-byte.

## Out-of-band

- `docs/arena.md` in `reiserlab/LED-Display_G6_Hardware_Arena` lags v1.1.7 (still recommends v1p1r6). Out-of-band for the Arena submodule.
- `pattern.version` in-memory field in `g6_save_pattern.m` is unused by the binary writer; trivial cleanup commit pending in maDisplayTools.
- KiCad submodules (`Generation 6/Arena`, `Generation 6/Panels`, `Generation 6/Hardware`) use SSH URLs; need `ssh-keyscan github.com >> ~/.ssh/known_hosts` once for direct local audit. The `kicad-design-review` skill works around this by fetching via `gh api`.

## Out of scope (do not address in this review pass)

- Live `⚠ Flag` callouts in spec bodies — these are firmware/hardware investigations (v3 trigger edge polarity, SPI clock ceiling, etc.), not spec issues.
- Phase 2 consolidation (collapsing the 7 dev docs into 2–3 public-facing docs at `docs/`). Gated on the dev set being explicitly called stable.
- G6 panel firmware bring-up, G6 controller firmware bring-up — downstream work.
