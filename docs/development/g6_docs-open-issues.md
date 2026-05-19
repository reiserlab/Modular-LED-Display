# G6 Dev-Set — Open Issues

Genuinely open items only. Resolved items are deleted (the git log preserves them). When this file is empty, delete it.

Live `⚠ Flag` callouts and per-file `Open Questions / TBDs` sections inside each `g6_*.md` are not restated here; this list is strictly *additional* cross-cutting findings.

---

## Spec decisions still open

- **PSRAM index semantics + preload atomicity.** `g6_01` v2 uses "PSRAM index/location" without saying whether the 24-bit value is a byte address, frame slot, record index, or typed handle — plus bounds, alignment, GS2/GS16 type tagging, persistence across reset, full-memory behavior. Separately: if a preload pass is interrupted (one panel reboots mid-load), one panel can hold a different pattern table than its neighbors and the same 24-bit index then drives a spatially inconsistent stimulus. Needs a half-page subsection in `g6_01` § v2 once the address-space question is answered.

## Deferred design pressure (acknowledged but not closed)

- **ISP-in-v1 vs separate protocol version.** Putting flash-write opcodes in v1 means every future v2/v3/v4 panel firmware must continue to support them. A dedicated ISP protocol with explicit `BOOT_TO_ISP` transition would isolate dangerous operations and survive version evolution. The ISP section is currently marked **"Draft — design-review needed"** with four flagged design holes (atomic staging, image authenticity, version-evolution, mixed-firmware-on-failure) — see [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § ISP open questions.

- **`g6_arena_configs.h` static-const-in-header.** Multiple TUs `#include`ing the header each get their own copy of the arena table. Codegen emits the same pattern; cleanest fix is to split codegen output into `.h` (extern decls) + `.c` (definitions). Deferred to a follow-up codegen pass.

- **Host vs controller parity ownership contradiction** between `g6_03-controller.md` § Modify-for-G6 ("controller adds parity") and `g6_04-pattern-file-format.md` § Transmission ("host pre-computes parity; controller transmits raw"). Pre-existing in the dev set.

- **Stale config names in `Generation 6/maDisplayTools/README.md`** (`G6_2x10_full`, `G6_2x8_walking` — don't match registered names `G6_2x10`, `G6_2x8of10`). Out-of-band item for the maDisplayTools submodule.

## Follow-up after CRC spec lands

The dev-set specifies CRC-8/AUTOSAR for wire-level slots (CIPO confirmation, ISP extended confirmation, pattern-file header byte 17 over bytes 0-16) and CRC-16/CCITT for per-frame integrity in pattern files. Downstream work:

- **Firmware swap in `reiserlab/LED-Display_G6_Firmware_Panel @ feat/v1-stage2-bcm`** — `Message::calculate_8bit_checksum()` body changes from sum-mod-256 to CRC-8/AUTOSAR (256-byte LUT, table-driven). Consider renaming `calculate_crc8()`. Stacked-panel bench-test re-baseline follows.
- **MATLAB encoder update** in `Generation 6/maDisplayTools/g6/g6_save_pattern.m` — (a) swap header byte 17 from byte-wise XOR over all frame data to CRC-8/AUTOSAR over header bytes 0-16; (b) append per-frame CRC-16/CCITT trailer to each frame.
- **JS encoder update** in `Generation 6/webDisplayTools/` — same two changes.
- **Pattern-file consumers** (any reader code in maDisplayTools/webDisplayTools/controller) — update file_size and frame_size formulas to account for the per-frame +2 bytes.
- **v2 short-command padding** — when v2 firmware lands, ensure `0x0F` Reset PSRAM, `0x02` Query diagnostics, `0x03` Reset diagnostic stats are all sent with 1 reserved padding byte (per [`g6_01-panel-protocol.md`](g6_01-panel-protocol.md) § Confirmation message ≥ 3-byte rule). Already reflected in the v2 spec command definitions.
- **Round-trip vector regeneration.** `Generation 6/maDisplayTools/g6/g6_encoding_reference.json` regenerated against the corrected encoders; pin protocol-specific CRC-8 vectors (`01 10 00…00 00` → `0xC6`, `81 30 00…00 00` → `0x0C`, COMM_CHECK canonical → `0x8B`) and per-frame CRC-16 vectors. Confirm MATLAB↔JS byte-for-byte. Also subsumes the existing post-fix regen item.
- **Sharp-cite re-add** — once firmware lands `calculate_crc8()` and the controller adds `verify_crc16()` for per-frame validation, add `file:line` cites from `g6_01` § Confirmation message and `g6_04` § Per-frame CRC-16 (CLAUDE.md rule #9).

## Out-of-band

- `docs/arena.md` in `reiserlab/LED-Display_G6_Hardware_Arena` lags v1.1.7 (still recommends v1p1r6). Out-of-band for the Arena submodule.
- `pattern.version` in-memory field in `g6_save_pattern.m` is unused by the binary writer; trivial cleanup commit pending in maDisplayTools.
- KiCad submodules (`Generation 6/Arena`, `Generation 6/Panels`, `Generation 6/Hardware`) use SSH URLs; need `ssh-keyscan github.com >> ~/.ssh/known_hosts` once for direct local audit. The `kicad-design-review` skill works around this by fetching via `gh api`.

## Out of scope (do not address in this review pass)

- Live `⚠ Flag` callouts in spec bodies — these are firmware/hardware investigations (v3 trigger edge polarity, SPI clock ceiling, etc.), not spec issues.
- Phase 2 consolidation (collapsing the 7 dev docs into 2–3 public-facing docs at `docs/`). Gated on the dev set being explicitly called stable.
- G6 panel firmware bring-up, G6 controller firmware bring-up — downstream work.
