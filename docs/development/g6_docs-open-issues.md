# G6 Dev-Set — Open Issues

Genuinely open items only. Resolved items are deleted (the git log preserves them). When this file is empty, delete it.

Live `⚠ Flag` callouts and per-file `Open Questions / TBDs` sections inside each `g6_*.md` are not restated here; this list is strictly *additional* cross-cutting findings.

---

## Spec decisions still open

*(no cross-cutting spec decisions currently open; per-file `Open Questions / TBDs` sections in each `g6_*.md` remain authoritative for narrower items)*

## Deferred design pressure (acknowledged but not closed)

- **Panel-side v2 capability advertisement.** [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § v2 — G6 Panel Protocol v2 — PSRAM-backed display (Compatibility note) records that "I am v2-capable" is not yet a dedicated opcode; the controller probes v2 support via `0x2F` Query PSRAM Status round-trip. A purpose-built advertisement opcode (analogous to `COMM_CHECK`) would let the controller fan out a discovery sweep without depending on PSRAM-state side effects. Worth tackling alongside the next v2 firmware bring-up pass.

- **ISP-in-v1 vs separate protocol version.** Putting flash-write opcodes in v1 means every future v2/v3/v4 panel firmware must continue to support them. A dedicated ISP protocol with explicit `BOOT_TO_ISP` transition would isolate dangerous operations and survive version evolution. The ISP section is currently marked **"Draft — design-review needed"** with four flagged design holes (atomic staging, image authenticity, version-evolution, mixed-firmware-on-failure) — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § ISP open questions.

- **`g6_arena_configs.h` static-const-in-header.** Multiple TUs `#include`ing the header each get their own copy of the arena table. Codegen emits the same pattern; cleanest fix is to split codegen output into `.h` (extern decls) + `.c` (definitions). Deferred to a follow-up codegen pass.

- **Stale config names in `Generation 6/maDisplayTools/README.md`** (`G6_2x10_full`, `G6_2x8_walking` — don't match registered names `G6_2x10`, `G6_2x8of10`). Out-of-band item for the maDisplayTools submodule.

## Follow-up after CRC spec lands

- **Controller-side CRC-16 per-frame validation** (`verify_crc16()` or equivalent) and sharp `file:line` cite to it from `g6_04` § Per-frame CRC-16 — pending the G6 controller port.

## Out-of-band

- `docs/arena.md` in `reiserlab/LED-Display_G6_Hardware_Arena` lags v1.1.7 (still recommends v1p1r6). Out-of-band for the Arena submodule.
- `pattern.version` in-memory field in `g6_save_pattern.m` is unused by the binary writer; trivial cleanup commit pending in maDisplayTools.
- KiCad submodules (`Generation 6/Arena`, `Generation 6/Panels`, `Generation 6/Hardware`) use SSH URLs; need `ssh-keyscan github.com >> ~/.ssh/known_hosts` once for direct local audit. The `kicad-design-review` skill works around this by fetching via `gh api`.

## Out of scope (do not address in this review pass)

- Live `⚠ Flag` callouts in spec bodies — these are firmware/hardware investigations (v3 trigger edge polarity, SPI clock ceiling, etc.), not spec issues.
- Phase 2 consolidation (collapsing the 7 dev docs into 2–3 public-facing docs at `docs/`). Gated on the dev set being explicitly called stable.
- G6 panel firmware bring-up, G6 controller firmware bring-up — downstream work.
