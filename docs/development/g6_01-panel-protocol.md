# G6 — Panel Protocol

Source: G6 panels protocol v1 proposal (Google Doc `17crYq4s...`, tabs "Panel Version 1" → "Panel Version 4 and beyond" + "Panel Version Summary"; lines 61–1110) · Last reviewed: 2026-05-01 by mreiser
Status: **§ v1 = Specified, partially implemented** (5 spec ↔ firmware divergences vs `iorodeo/g6_firmware_devel`) · **§ v2 = Migrated (teaser); opcodes declared in firmware but behavior not implemented** · **§ v3 = Migrated (teaser); feasibility strongly prototyped via `G6_Panels_Test_Firmware`** (BCM, gating, persistent — see reconciliation table; 2 blockers: trigger-edge polarity, sync-vs-async gating semantics) · **§ v4 = Migrated (~30 % specified); zero firmware support anywhere; predefined-pattern flash mechanism is a prerequisite to design** · **§ v5 = Sketch only (roadmap, not implementable)** · **§ master command summary = Migrated; documents 22 commands across v1–v4 with 5 internal inconsistencies flagged**

This file holds the SPI-level protocol between the controller and the panels — message scaffolding, header byte, parity rule, the per-version command set, payload formats, panel confirmations, and pixel data layout. Versions are staged in chronological order (v1 first because it sets all the conventions and is the only version with deployable firmware in flight).

## Current state

- **v1 protocol implementation (authoritative):** [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) at `6944894` (2026-02-12). Local read-only clone at `/Users/reiserm/Documents/GitHub/g6_firmware_devel/`. Layout: `panel/{platformio.ini, src/{main, messenger, message, protocol, panel_spi_custom, display, pattern, constants}.{cpp,h}}` and `test_arena/{platformio.ini, src/main.cpp}`.
- **v3 prototype evidence:** [`mbreiser/G6_Panels_Test_Firmware`](https://github.com/mbreiser/G6_Panels_Test_Firmware) — debug/test code that proved BCM-via-PIO, gating, all-off, and the experimental `PIXEL` command on G6 panels v0.2.1 / v0.3.1. Cited in the v3 section (when it lands) as "prototyped", **not** as a v1 reference and **not** as a deployable implementation.

### Reconciliation against `g6_firmware_devel` @ `6944894` (run 2026-05-01)

**Confirmations (spec matches firmware):**

| Spec claim | Firmware evidence | Verdict |
|---|---|---|
| Parity rule = `popcount(version_bits ‖ command ‖ payload) mod 2` | `Message::calculate_parity_bit()` ([message.cpp:157–168](../../../g6_firmware_devel/panel/src/message.cpp)) masks bit 7 of byte 0, sums popcounts across all bytes, returns `sum % 2` | ✓ |
| 1-byte header + 1-byte command + payload | `HEADER_SIZE = 2` ([protocol.cpp:8](../../../g6_firmware_devel/panel/src/protocol.cpp)); byte 0 = header, byte 1 = command (`Message::header_byte()`, `Message::command_byte()`) | ✓ |
| `0x01` / `0x10` / `0x30` opcodes | `CMD_ID_COMMS_CHECK = 0x01`, `CMD_ID_DISPLAY_GRAY_2 = 0x10`, `CMD_ID_DISPLAY_GRAY_16 = 0x30` ([protocol.h:12–14](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ |
| Payload sizes 200 / 51 / 201 bytes | `PAYLOAD_COMMS_CHECK = 200`, `PAYLOAD_DISPLAY_GRAY_2 = 51`, `PAYLOAD_DISPLAY_GRAY_16 = 201` ([protocol.cpp:10–12](../../../g6_firmware_devel/panel/src/protocol.cpp)) | ✓ |
| Pixel data row-major, MSB-first, `byte_index = k//8`, `bit_in_byte = 7 - (k%8)` (2bpp) | `Message::from_pattern_gray_2()` ([message.cpp:195–224](../../../g6_firmware_devel/panel/src/message.cpp)): outer loop `i = row 0..19`, inner `j = col 0..19`, `byte_num = pixel_num/8`, `bit_pos = 7 - (pixel_num - 8*byte_num)` | ✓ |
| 16-level: `byte_index = k//2`; even pixel → upper nibble, odd → lower | `Message::from_pattern_gray_16()` ([message.cpp:226–264](../../../g6_firmware_devel/panel/src/message.cpp)): `byte_num = pixel_num/2`, even → `upper = pixel_value << 4`, odd → `lower = pixel_value` | ✓ |
| `PANEL_SIZE = 20` (×20 = 400 pixels) | `constexpr uint8_t PANEL_SIZE = 20` ([protocol.h:26](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ |
| Stretch is the last byte of the payload | `Message::from_pattern_gray_*()` writes `data_.at(total_size-1) = pat.stretch();` ([message.cpp:222, 262](../../../g6_firmware_devel/panel/src/message.cpp)) | ✓ |
| Invalid messages silently discarded (parity / length) | `Messenger::update()` ([messenger.cpp:45–60](../../../g6_firmware_devel/panel/src/messenger.cpp)) only invokes the command callback when `check_parity()` AND `check_length()` both pass | ✓ |
| SPI message ends on CS rising edge; parser reset | `custom_spi_read_blocking` ([panel_spi_custom.cpp:16–49](../../../g6_firmware_devel/panel/src/panel_spi_custom.cpp)) breaks the read loop the moment `gpio_get(cs_pin)` goes high; the next `panel_spi_read()` reuses the same Message buffer (effectively a parser reset) | ✓ |
| Checksum is "8-bit (simple additive)" | `Message::calculate_8bit_checksum()` ([message.cpp:171–177](../../../g6_firmware_devel/panel/src/message.cpp)) returns `uint8_t(sum_of_all_bytes)` | ✓ on algorithm |
| `MESSAGE_MINIMUM_SIZE = 3` ("at least 3 bytes" rule) | `MESSAGE_MINIMUM_SIZE = HEADER_SIZE + PAYLOAD_MINIMUM_SIZE = 2 + 1 = 3` ([protocol.cpp:13](../../../g6_firmware_devel/panel/src/protocol.cpp)) | ✓ |

**Resolutions (firmware answers spec open questions):**

| Spec open question | Firmware answer |
|---|---|
| What is the COMM_CHECK "known sequence"? | `Message::to_comms_check()` ([message.cpp:121–136](../../../g6_firmware_devel/panel/src/message.cpp)) sets `payload[i] = uint8_t(i)` for `i ∈ [0, 200)` — i.e., bytes `0x00, 0x01, … 0xC7` |
| What is the parity rule, definitively? | `parity = popcount(byte0_with_bit7_masked ‖ byte1 ‖ payload) mod 2`, exactly as the spec describes |
| Examples 1, 2, 3 — which are right? | Working through firmware: Ex1 should be `0x01` (spec says `0x81` — **wrong**); Ex2 should be `0x81` (spec says `0x01` — **wrong**, headers swapped); Ex3 header `0x81` is correct but the parenthetical "1 + 1 from command → 0 parity" is doubly wrong (`0x30` has 2 ones, not 1; correct popcount = 1+2 = 3 → parity 1) |

**Spec ↔ firmware divergences (need a decision):**

| # | Topic | Spec | Firmware | Action |
|---|---|---|---|---|
| D1 | **Checksum scope** | "calculates a 8-bit checksum **of the payload**" (§ Confirmation message) | `calculate_8bit_checksum()` sums **all bytes** including header byte and command byte ([message.cpp:171–177](../../../g6_firmware_devel/panel/src/message.cpp)) | Decide whether checksum covers payload only or whole message. The firmware impl is simpler (one loop over `data_`), but the spec example (`checksum pixel data 1 + stretch`) reads as payload-only. |
| D2 | **Confirmation message** | Panel returns header + command + 8-bit checksum from previous command on next CS transaction; empty buffer → `0x81 0x00` | **Not implemented in v1 firmware.** No MISO write logic in `messenger.cpp` or `panel_spi_custom.cpp`; SPI is configured slave-receive-only | Spec is ahead of firmware. Not blocking spec sign-off, but the spec text should note this is "specified, firmware implementation pending". |
| D3 | **Stretch behavior** | "scales the brightness of all pixels in a pattern" — provides dynamic brightness, HDR, modulation, adaptive stimuli | **Stretch is parsed from the wire and stored on the Pattern, but `Display::show()` ([display.cpp:43–88](../../../g6_firmware_devel/panel/src/display.cpp)) never reads `pat_.stretch()`.** Stretch has zero effect on the rendered display. | Major divergence. v1 firmware does not yet implement stretch. Spec sign-off OK; firmware ticket needed. |
| D4 | **`COMM_CHECK` visual response** | "upon reception of the command a specific part of the panel could light up" (aspirational) | `Messenger::on_cmd_comms_check()` is empty ([messenger.cpp:82–84](../../../g6_firmware_devel/panel/src/messenger.cpp)) — wire-level reception is validated but no display response | Spec was already aspirational ("could light up"). Either (a) make it normative and require a visual response, or (b) drop the aspirational sentence. Firmware would need updating either way to make it visible. |
| D5 | **Schematic-to-position LED mapping in panel firmware** | "Host owns LED mapping (pixel → physical LED), including corrections for rotated / flipped panels" — i.e., panel firmware should NOT remap | `display.cpp::sch_to_pos_index()` ([display.cpp:91–114](../../../g6_firmware_devel/panel/src/display.cpp)) **does** apply a non-trivial mapping from "schematic" pixel coordinates to physical row/column pin indices, with a 4-color quadrant scheme based on `NUM_COLOR = 4` | Layering decision needed. Likely correct framing: host owns *logical → schematic* mapping (rotation, flip, panel-position-in-arena); firmware owns *schematic → physical-pin* mapping (driven by the panel PCB layout). Update spec to reflect this 2-stage mapping rather than the absolute "host owns mapping" wording. Cross-references the same architecture flag in [`g6_00-architecture.md`](g6_00-architecture.md). |

**Items the firmware exposes but the spec does not yet specify:**

- **SPI mode / polarity / clock**: `spi_set_format(spi0, 8, SPI_CPOL_1, SPI_CPHA_1, SPI_MSB_FIRST)`, `SPI_SPEED = 30 MHz` ([messenger.cpp:42](../../../g6_firmware_devel/panel/src/messenger.cpp), [constants.cpp:15](../../../g6_firmware_devel/panel/src/constants.cpp)). Spec should specify SPI mode (CPOL=1, CPHA=1 = Mode 3), bit order (MSB first), and a max clock for cross-platform interop. Pin assignments are firmware-side: `SPI_SCK_PIN = 34`, `SPI_MOSI_PIN = 32`, `SPI_MISO_PIN = 35`, `SPI_CS_PIN = 33` ([constants.cpp:7–10](../../../g6_firmware_devel/panel/src/constants.cpp)).
- **v2 command codes already declared:** `protocol.h` already declares `CMD_ID_QUERY_DIAGNOSTIC = 0x02`, `CMD_ID_RESET_DIAGNOSTICS = 0x03`, `CMD_ID_RESET_PSRAM = 0x0F`, `CMD_ID_SET_PSRAM_GRAY_2 = 0x1F`, `CMD_ID_SET_PSRAM_GRAY_16 = 0x3F`, `CMD_ID_DISPLAY_PSRAM = 0x50` — the v2 PSRAM command set. They are scaffolded but not implemented (no entries in `PAYLOAD_SIZE_UMAP`, no callbacks in `Messenger::cmd_umap_`). Useful starting point for v2 reconciliation.
- **`check_protocol(uint8_t protocol)`** ([message.cpp:69–71](../../../g6_firmware_devel/panel/src/message.cpp)) compares the *full header byte* (including parity bit) against `CMD_PROTOCOL_V1 = 0x01`. For a parity=1 message (header `0x81`) this returns false — it would reject a valid v1 message with parity=1. **However, `Messenger::update()` does not call `check_protocol()`** ([messenger.cpp:45–60](../../../g6_firmware_devel/panel/src/messenger.cpp)), so this latent bug is dormant in v1. It would surface at v2 (when multiple protocol versions co-exist) unless `check_protocol` is changed to mask the parity bit before comparing.
- **Optional Panel Error Display:** not implemented. Confirmed the spec's "not required for protocol v1 compliance" — firmware doesn't include it.

### Reconciliation: Panel Protocol v2 (run 2026-05-01)

v2 is at **opcodes-declared, behavior-not-implemented** in `iorodeo/g6_firmware_devel @ 6944894`. The thin pass:

| Spec claim | Firmware evidence | Verdict |
|---|---|---|
| `0x02` Query diagnostics opcode | `CMD_ID_QUERY_DIAGNOSTIC = 0x02` ([protocol.h:17](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |
| `0x03` Reset diagnostic stats opcode | `CMD_ID_RESET_DIAGNOSTICS = 0x03` ([protocol.h:18](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |
| `0x0F` Reset PSRAM opcode | `CMD_ID_RESET_PSRAM = 0x0F` ([protocol.h:19](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |
| `0x1F` Write 2-Level Grayscale to PSRAM opcode | `CMD_ID_SET_PSRAM_GRAY_2 = 0x1F` ([protocol.h:20](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |
| `0x3F` Write 16-Level Grayscale to PSRAM opcode | `CMD_ID_SET_PSRAM_GRAY_16 = 0x3F` ([protocol.h:21](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |
| `0x50` Display PSRAM Index opcode | `CMD_ID_DISPLAY_PSRAM = 0x50` ([protocol.h:22](../../../g6_firmware_devel/panel/src/protocol.h)) | ✓ declared |

**Not implemented** (each is a follow-on firmware ticket):

- No payload sizes for `0x02` / `0x03` / `0x0F` / `0x1F` / `0x3F` / `0x50` in `PAYLOAD_SIZE_UMAP` ([protocol.cpp:15–19](../../../g6_firmware_devel/panel/src/protocol.cpp)).
- No callbacks for v2 commands in `Messenger::cmd_umap_` ([messenger.cpp:11–27](../../../g6_firmware_devel/panel/src/messenger.cpp)).
- No `CMD_PROTOCOL_V2` constant defined; `protocol.cpp` has only `CMD_PROTOCOL_V1 = 0x01`. v2 messages would be rejected by `check_protocol()` if it were called (it currently isn't).
- No PSRAM driver, no diagnostic counters, no Pattern-storage abstraction beyond the Display queue.

**Forward-looking constraints surfaced by v2 migration:**

- **Zero-payload commands (`0x02`, `0x03`, `0x0F`) collide with `PAYLOAD_MINIMUM_SIZE = 1`.** The firmware's `check_length()` enforces a 1-byte minimum payload — implementing the v2 zero-payload commands needs either (a) `PAYLOAD_MINIMUM_SIZE` dropped to 0, or (b) the per-command length lookup overriding the floor for these commands. Decide before any of the v2 commands gets implemented.
- **`0x50` payload size discrepancy unresolved by firmware.** Source spec says "Payload: 4 bytes" but lists only 3 bytes of fields, and the Master Command Summary tab independently lists "3 (idx)". With no firmware implementation, the question stays open. Recommend adopting "3 bytes" — the smaller, internally-consistent figure — when v2 implementation begins.
- **`0x02` diagnostics return-data format still unspecified.** Spec defers to "circle back once v1 is implemented"; firmware has no diagnostic counters yet, so there's nothing to design against. Spec the diagnostic record format before this command becomes implementable.

### Reconciliation: Panel Protocol v3 (run 2026-05-01)

**Repo state:** [`G6_Panels_Test_Firmware @ bb26a44`](https://github.com/mbreiser/G6_Panels_Test_Firmware) ("Phase 4 PIOFULL: complete the scaffold + AD3 characterization tooling", 2026-04-24). Local clone at `/Users/reiserm/Documents/GitHub/G6_Panels_Test_Firmware/`. **This is a proof-of-concept and characterization rig on G6 panels v0.2.1 / v0.3.1 — intentionally NOT a v1 reference, NOT deployable.** It demonstrates the feasibility of v3 features (gated/persistent display, BCM grayscale, trigger-line wiring, RAM-backed frame display) through empirical measurements: DWT cycle counter, Saleae Logic, AD3 oscilloscope, Ocean Insight spectrometer. Firmware organized in Phases 0–7: single-LED pulse timing → full-panel row scanning → PIO column drivers → dual-PIO PIOFULL → BCM grayscale → external trigger integration → AD3 optical characterization.

> All findings below are **test-rig observations**, not "the firmware implements v3 correctly". The rig uses serial-port commands (BCMBURST, PIOROW, PIOFULL, etc.), not the v3 binary packet protocol — that's expected, since the rig is timing/feasibility evidence, not a protocol implementation.

**Capabilities prototyped (evidence that v3 features are physically achievable on G6 panels):**

| v3 spec claim | Test-rig evidence | Verdict |
|---|---|---|
| **Gated display mode** (~15 µs scan window) | Phase 6 (`single_led/SESSION_2026-04-24_PIOFULL_AD3.md`): external trigger on GP45 via W1 wavegen at 8 kHz, dual-PIO PIOFULL architecture. Trigger-to-LED latency: **865 ± 17 ns** (Saleae + AD3, 30 captures). Zero jitter (0.000 µs std dev) over 10k triggers. | ✅ feasible — works with real external trigger; architecture supports trigger polling via PIO IRQ or GPIO wait |
| **Persistent display mode** (continuous free-running) | BCMBURST mode (Phase 4, `single_led/PRODUCTION_ARCHITECTURE.md` § 4): simulated 8 kHz trigger, multicore lockout + `noInterrupts()` during burst, `interrupts()` during ~115 µs idle. Zero jitter (0.007 µs ≈ 1 CPU cycle) at 400 Hz frame rate. Double-buffer design (display_buf / recv_buf) supports continuous frame swaps. | ✅ feasible — BCM burst loop works at 400 Hz with zero jitter |
| **Gated-Persistent mode** (the spec's implied `0x54`) | Not prototyped explicitly. PIOFULL architecture is compatible (e.g., per-burst gating with persistent display between bursts) but no dedicated test exists. | ❓ not prototyped — architecture is compatible but unproven |
| **BCM 4-bit grayscale** (16 levels) | Phase 4 (`single_led/PRODUCTION_ARCHITECTURE.md` § 9, `TIMING_SUMMARY.md`, `RESULTS.md`): 4-bit BCM at T=0.5 µs base time → 16 levels, 9.42 µs per-row burst, zero jitter across 160k triggers. Standard weights `[1, 2, 4, 8]` or optimized `[1, 2, 5.02, 10.19]` for linearity correction. BCMDEMO ramp visually verified (non-linear due to per-bit-plane brightness decay; corrected via weight optimization). | ✅ fully prototyped — timing & jitter proven; intensity linearity characterized via spectrometer |
| **Indexed pre-loaded display** (analogous to v3 PSRAM commands) | RAMBURST mode (Phase 5a): 8 test frames cycling at 400 Hz from RAM. Incremental per-row BCM precompute (38 µs/row) during 115 µs idle. Zero jitter with frame swaps. **PSRAM not used** — frames live in SRAM; PSRAM integration is a future step. | ✅ prototyped — RAM-resident `bcm_plane_data[20][8][2]`; PSRAM-backed display would be straightforward to layer on |
| **Trigger-line wiring & behavior** | Phase 6–7: GP45 external trigger via bodge wire on `J3` pin 1. W1 wavegen drives EINT at 8 kHz with variable duty cycle. **Open issue:** firmware code expects rising edge but AD3 + Ch2 captures show LED fires on the **falling edge** of W1 (`single_led/SESSION_2026-04-24_PIOFULL_AD3.md` §2). Suspected cause: ringing on falling edge (±2.5 V overshoot) triggers a transient HIGH the GPIO poll latches onto. Hypothesis documented; not yet fixed. | ⚠️ edge polarity TBD — gating timing works (0 jitter) but rising-vs-falling edge needs hardware-level investigation |
| **Stretch byte in grayscale payload** | Not present in test rig. BCM bit-plane ON times are encoded as PIO-cycle delay counts; per-plane scaling uses float weights (BCMWEIGHTS command). | ❌ not implemented — test rig uses a different timing representation than v3 spec implies |

**Concrete numbers / timing observations** (citing the report and AD3 capture):

| Observation | Source | Value |
|---|---|---|
| BCM frame / refresh cycle | `single_led/PRODUCTION_ARCHITECTURE.md` § 3, `TIMING_SUMMARY.md` | **400 Hz frame rate** (20 rows × 8 kHz trigger = 2.5 ms / frame). Per-row burst: **9.42 µs** at T=0.5 µs, 4-bit BCM. |
| Trigger-to-LED latency | `single_led/SESSION_2026-04-24_PIOFULL_AD3.md` § 3, `ad3_piorow_sweep.png` | **865 ± 17 ns** (range 830–910 ns, 30 captures, sch_row=4, PIOROW command). |
| Burst width | same | **22.557 ± 4.4 ns** (zero jitter measured 0.000 µs std dev across 10k triggers). |
| 8 kHz trigger characterization | `TIMING_SUMMARY.md` § 2; `PRODUCTION_ARCHITECTURE.md` § 4 | At 8 kHz (125 µs period), 15 µs scan window allocated. 9.42 µs burst fits with 5.6 µs margin. |
| 12 kHz trigger characterization | — | **Not tested.** Firmware uses 8 kHz simulation; 12 kHz would require external hardware step function. Spec covers both 8 and 12 kHz — recommend testing at 12 kHz before committing v3 spec to the higher rate. |
| Two-photon scan window budget | `CLAUDE.md` lines 12–21; `PRODUCTION_ARCHITECTURE.md` § 4 | Application requirement: **0.75 µs per-row budget within 15 µs turnaround**. Test rig achieves **0.37–0.61 µs per-row overhead** (PIOSCAN preferred for lowest jitter). Frame burst (9.42 µs) + margin (5.6 µs) compatible. External trigger polling: 0.000 µs jitter. |
| Dual-PIO overhead (PIOFULL) | `PRODUCTION_ARCHITECTURE.md` § 5.1; `SESSION_2026-04-24_PIOFULL_AD3.md` line 6 | **Burst: 7.81 µs at 1 row** (27 % shorter than BCMBURST Mode A's 10.63 µs). Dual-PIO DMA-chained (PIO0 columns, PIO1 rows). Not yet jitter-characterized at scale; only visual validation. |
| Trigger edge anomaly | `SESSION_2026-04-24_PIOFULL_AD3.md` §§ 2, 3 | LED fires consistently 1–5 µs **after** W1 HIGH→LOW transition, not after LOW→HIGH. Firmware code expects rising edge. Hypothesis: ringing on falling edge (±2.5 V overshoot). Documented for next session. |

**The PIXEL command:**

- **What it does** (`CLAUDE.md` line 252, `main.cpp` line 3082): `PIXEL row col intensity` — sets a single pixel (layout coords row 0–19, col 0–19) to an intensity value (0–255, mapped to 4-bit BCM level 0–15). Bypasses the per-frame buffer; direct `pixel_data` update.
- **Why NOT in the protocol spec:** the v3 spec focuses on frame-level atomic updates (full PSRAM index or grayscale payload). Individual pixel updates without re-sending the entire 20×20 frame are useful for incremental updates but add protocol complexity (race conditions with frame swaps, rate-limiting questions).
- **What it would map to if adopted:** a new opcode (e.g., `0x55` for `PIXEL_SET`) with 3-byte payload `[pixel_row][pixel_col][intensity]`.
- **Recommendation:** keep PIXEL out of the v3 spec for now; document it as a future-version candidate for incremental-update use cases. The test rig has proved feasibility; defer adoption decision to v4 or later.

**Spec ↔ test-firmware divergences (test rig diverges from v3 spec — expected, since the rig is feasibility evidence):**

| # | Topic | v3 spec | Test rig | Action |
|---|---|---|---|---|
| 1 | Command transport | 6 binary opcodes (`0x12/13/32/33/52/53`) plus implied `0x54`; header byte = parity + version `0b0000011` (`0x03` / `0x83`) | Serial-port commands (`BCMBURST`, `PIOROW`, `PIOFULL`, `BCMWEIGHTS`, `PIXEL`, …); no binary packet parsing | ℹ️ expected divergence — test rig is firmware-only. When v3 packet protocol is implemented, command transport will differ. Not a bug. |
| 2 | BCM bit-plane encoding | v3 spec implies bit-planes (ON time = T × 2^bit) | Test rig uses an explicit weights array `[w0, w1, w2, w3]` with ~6.67 ns float resolution; supports non-standard weights for linearity correction | ℹ️ harmonizable — v3 spec is abstract on bit-plane representation. Weight-based approach is a concrete implementation choice. Decide whether v3 spec should mandate a specific encoding. |
| 3 | Trigger source | v3 spec: "asynchronous gating or synchronous gating tied to internal row/column update cycles — explicitly TBD" | Test rig uses simple external GPIO trigger polling; no internal row/column timing coupling | ℹ️ clarification needed — spec should resolve sync-vs-async before committing to a v3 reference architecture. The test rig demonstrates the async path works at 0-jitter; the sync path is unproven. |
| 4 | PSRAM addressing | `0x52`/`0x53`: 3-byte payload (PSRAM index) → display from indexed frame | Test rig cycles through 8 pre-loaded frames in SRAM; no PSRAM addressing | ℹ️ expected — test rig pre-stages frames to prove timing. Full PSRAM addressing belongs in v1 firmware. |
| 5 | `0x54` Gated-Persistent | Implied in v3 spec workflow examples; not formally listed in command list or Display Modes section | Not prototyped | ℹ️ to-do — clarify spec intent. Test-rig architecture supports a hybrid gated-then-persistent pattern but timing is not validated. |
| 6 | Stretch byte | v3 spec includes `[stretch]` byte in 0x12 / 0x13 / 0x32 / 0x33 payloads | Test rig has no stretch byte; brightness is via float-weight calibration | ℹ️ semantics gap — what does "stretch" mean numerically? See v1's flag D3 (stretch is parsed but ignored in `g6_firmware_devel`). v3 inherits the same ambiguity. |

**v3 spec questions resolved (or strongly informed) by the test rig:**

| v3 open question | Test-rig answer |
|---|---|
| Is BCM at microsecond scale physically achievable? | **Yes.** 0.5 µs bit-plane ON times produce 16 distinguishable brightness levels with zero jitter (160k triggers, 0.000 µs std dev). Per-bit-plane brightness decay is real (Ocean Insight spectrometer: B0 = 3163 cts / µs → B3 = 2024 cts / µs, 56 % drop) but correctable via weight optimization. |
| Can external trigger gating achieve sub-µs latency? | **Yes.** Trigger-to-LED latency: 865 ± 17 ns. Jitter: 0.000 µs (1 CPU cycle) over 10k triggers with the full lockout recipe (multicore lockout + `noInterrupts()` + warm-up). |
| What is the minimum per-row time budget? | **~0.4 µs achievable** with PIOFULL dual-PIO DMA (7.81 µs burst for 1 row). With CPU polling (BCMBURST), 0.61–0.76 µs per-row overhead → 9.42 µs burst at 4-bit BCM. At 8 kHz, the 15 µs window fits comfortably. |
| Is the 2P microscopy application (15 µs scan window) feasible? | **Yes.** 9.42 µs burst + 5.6 µs margin within 15 µs. Per-row time (0.4–0.76 µs) well below 0.75 µs budget. Architecture: PIO columns, CPU rows, multicore lockout during burst, `noInterrupts()` during scan. |
| Asynchronous vs synchronous gating? | **Test rig implements asynchronous external GPIO trigger polling.** No internal row/column cycle coupling. If v3 spec intends synchronous gating, that requires a different architecture (PIO SM armed by internal counter); unproven. |
| Can intensity be linear across BCM levels? | **Partially.** Raw bit-planes `[1, 2, 4, 8]` are non-linear at short ON times. **Optimized weights `[1, 2, 5.02, 10.19]` achieve 2.5 % max error** with 12.7 µs burst (still fits 15 µs window). Linearity fully characterized and correctable. |

**v3 spec questions NOT yet answered by the test rig:**

| Open question | Why unresolved | Impact |
|---|---|---|
| `0x54` Gated-Persistent mode timing | Not prototyped. Unclear if `0x54` is a distinct mode or a workflow option. Requires spec clarification first. | Medium — affects opcode table and Display Modes section. |
| Synchronous gating (row / col cycle coupling) | Test rig uses simple external trigger (asynchronous). Synchronous mode would need a different PIO architecture. | High — architectural choice affects jitter and integration approach. Spec says "explicitly TBD". |
| Stretch byte semantics | Test rig does not use stretch (uses float weights). v3 spec includes a stretch byte but its exact purpose is undefined (see v1 flag D3). | Medium — needed to finalize protocol payload format consistently across v1/v3. |
| 12 kHz trigger validation | Test rig uses 8 kHz simulation; 12 kHz untested. | Low — would catch any rate-dependent issues before committing v3 spec to both 8 and 12 kHz. |
| Multi-panel cascading / daisy-chain protocol | Test rig is single-panel only. | Low — out of scope for single v0.2.1/v0.3.1 panel reconciliation. |
| Trigger edge polarity (rising vs falling) | Hardware ringing causes LED to fire on falling edge despite firmware expecting rising; cause hypothesised but not fixed. | High — spec assumes rising-edge gating; if the panel sees falling edge, that's a v3 implementation blocker. |

**Bottom line for v3 spec sign-off:**

The test rig **strongly validates the physical feasibility of v3's core capabilities**: 4-bit BCM grayscale at 0.5 µs base time, zero-jitter external trigger gating (~865 ns latency), persistent frame display at 400 Hz, and a 5.6 µs margin within the critical 15 µs 2P-microscopy scan window. Concrete measurements are reproducible.

Two blockers for finalizing v3:

1. **Trigger edge polarity** — firmware expects rising; observed behavior is falling edge (likely ringing on hardware). Resolve before deploying v3 firmware on real arenas.
2. **Synchronous vs asynchronous gating** — spec says "TBD"; test rig only validates async. Decide before committing v3 spec to a particular gating model.

Confidence: ✅ high on Gated, Persistent, BCM, trigger latency, 2P timing. ⚠️ medium on Gated-Persistent (`0x54`) and synchronous gating semantics. ⚠️ trigger edge polarity needs resolution before deployment.

### Reconciliation: Panel Protocol v4 (run 2026-05-01)

v4 is at **nothing implemented anywhere**. Both reference firmwares were checked:

| Repo | v4 evidence | Verdict |
|---|---|---|
| `iorodeo/g6_firmware_devel @ 6944894` ([protocol.h:10–23](../../../g6_firmware_devel/panel/src/protocol.h)) | The `CommandId` enum declares only v1 + v2 opcodes (`0x01`, `0x10`, `0x30`, `0x02`, `0x03`, `0x0F`, `0x1F`, `0x3F`, `0x50`). **No v4 opcodes** (`0x60`, `0x61`, `0x62`, `0x63`, `0x64`, `0x70`, `0x71`, `0x72`, `0x73`, `0x74`) are declared. | ❌ not declared |
| `mbreiser/G6_Panels_Test_Firmware @ bb26a44` | The test rig uses serial commands, not binary opcodes — and has no concept of "predefined pattern flash storage" or "PSRAM-with-stretch-multiplier". The `PIXEL` command is unrelated to v4. | ❌ no v4 capabilities |

**Forward-looking constraints surfaced by v4:**

- **Predefined-pattern flash mechanism is the prerequisite for v4.** No firmware currently has factory-loaded patterns in flash, no programming flow for them, no catalog. This is a green-field area: design the storage layout, programming flow (manufacturing-time? OTA? host command?), and the catalog before any of the `0x70`–`0x74` family becomes implementable.
- **Stretch multiplier on indexed-display commands (`0x60`–`0x64`) is the v4 contribution beyond v2/v3 indexed display.** The indexed-display commands (`0x50` v2, `0x52`/`0x53` v3) take only a 3-byte index payload; v4's `0x60`/`0x62`/`0x63` add a 1-byte stretch multiplier. Decide whether v4 supersedes those v2/v3 indexed-display commands (deprecating them in favor of always-with-stretch variants) or coexists.
- **Trigger and Gated-Persistent modes are still undefined.** v4 introduces `0x61`/`0x71` (Trigger) and `0x64`/`0x74` (Gated-Persistent) without describing them. The v3 reconciliation already noted that test-rig architecture supports a Gated-Persistent pattern but timing is unproven. **Action:** define both modes formally (under v3 § Display Modes) before v4 implementation begins.
- **`0x70` opcode collision with v1 error display.** The v1 error display feature (currently optional, not implemented) suggests using `0x70` for the panel error glyph. v4 uses `0x70` for "Display Predefined Pattern with Stretch (Oneshot)". Resolve before either feature is implemented; the simplest fix is to reserve a specific predefined-pattern index (e.g., index `0x000000`) as the error-glyph slot, indexed via the v4 `0x70` command.

**Bottom line for v4 spec sign-off:** v4 is ~30 % specified (3 of 10 commands fully detailed; the rest just listed); both reference firmwares have zero v4 capabilities; predefined-pattern flash storage is unbuilt and undesigned. Do not target v4 for near-term implementation. The v4 spec section is useful as a roadmap but needs ~7 missing per-command sections, a predefined-pattern catalog spec, Trigger/Gated-Persistent mode definitions, and resolution of the `0x70` collision before becoming implementable.

### Reconciliation: Panel Protocol v5 (run 2026-05-01)

v5 is a sketch in the source. No reconciliation possible — there are no opcodes assigned to the "interesting commands" bullets, no payload formats, no implementation references. Treat the v5 section as a roadmap rather than a specifiable protocol version. The 4-level / 256-level grayscale opcode ranges (`0x20…0x2F`, intended `0x40…0x4F`) are a parallel extension of the existing 2-level / 16-level encoding scheme; if any of those becomes implementation-ready, lift it into a proper version (v5 or whatever's next) at that point.

> **⚠ Flag — file-scope status mixing:** the file is being built up version-by-version (v1 first, then v2, then v3, then v4/v5/summary), each with sign-off. While that's in progress, the status line above will mix Specified (for landed versions) with `_not yet migrated_` for the rest. This is expected during Phase-1 development.

---

## v1 — G6 Panel Protocol

Based on `<will@iorodeo.com>`'s [G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit), here is an updated request for comments for version 1 of the protocol between controller and panels.

Thinking ahead, future versions could look similar to what is specified in [Version 2 (teaser)](#v2--g6-panel-protocol-v2-teaser), [Version 3 (teaser)](#v3--g6-panel-protocol-v3-teaser), or even [Version 4 and beyond](#v4-and-beyond), but all of those developments will depend on the things we can learn from v1.

Just to map out the space for commands, there is a preliminary list of commands in [Version Summary](#master-command-summary-v1v4), but all of this is subject to change.

### Message Format

All messages consist of:

- **Byte 0**: Header byte
- **Byte 1**: Command
- **Bytes 2–n**: Payload (command-dependent)

#### Header Byte (Byte 0)

The header byte structure:

- **Bit 7** (MSB): Parity bit (parity of entire message)
- **Bits 0–6**: Protocol version

For Protocol v1, the version bits are `0b0000001`, giving possible header values:

- `0x01` (`0b00000001`) — when parity bit = 0
- `0x81` (`0b10000001`) — when parity bit = 1

#### Parity Calculation

The parity bit (MSB of byte 0) is set such that the total count of '1' bits in the entire message (excluding the parity bit itself) modulo 2 equals the parity bit value. Specifically, it counts all '1' bits in:

- Bits 0–6 of byte 0 (version bits)
- All bits in byte 1 (command)
- All bits in bytes 2–n (payload)

The parity bit is set such that this count modulo 2 equals the parity bit value, providing basic parity-based error detection.

**Parity Examples:**

- 2-level oneshot (command `0x10`), all pixels=0, stretch=0 → header should be `0x01` (1 from version + 1 from command = 2 ones → parity 0)
- 2-level oneshot (command `0x10`), all pixels=0, stretch=1 → header should be `0x81` (1 from version + 1 from command + 1 from stretch = 3 ones → parity 1)
- 16-level oneshot (command `0x30`), all pixels=0, stretch=0 → header should be `0x81` (1 from version + 2 from command = 3 ones → parity 1)

#### Stretch Value

The stretch value is a single byte (0-255) that scales the brightness of all pixels in a pattern. This provides:

- **Dynamic brightness control**: Adjust pattern intensity without changing the pattern
- **High dynamic range**: Use low-bit patterns (e.g., 4-level) with stretch to achieve effective higher dynamic ranges
- **Efficient modulation**: Change brightness rapidly for temporal experiments
- **Adaptive stimuli**: Match brightness to experimental conditions or subject sensitivity

> **⚠ Flag — stretch semantics underspecified:** "scales the brightness of all pixels" is intuitive but not normative. Open questions: is the scaling linear (`displayed = pixel × stretch / 255`), gamma-corrected, or a BCM duty-cycle multiplier? Does stretch=0 mean "off" (multiplicative interpretation) or does it have some floor? How does stretch interact with the BCM bit-plane refresh in the v3 prototype? Reconcile against `g6_firmware_devel` (v1 baseline) and `G6_Panels_Test_Firmware` (BCM characterization).
>
> **🔴 Divergence (2026-05-01) vs `g6_firmware_devel @ 6944894`:** stretch is parsed from the wire and stored on the `Pattern` object, but `Display::show()` ([display.cpp:43–88](../../../g6_firmware_devel/panel/src/display.cpp)) **never reads `pat_.stretch()`**. So in v1 firmware, stretch has zero effect on what gets displayed. See [Current state § D3](#reconciliation-against-g6_firmware_devel--6944894-run-2026-05-01). Action: spec stays as-is for the wire format; firmware needs a ticket to wire stretch into the display loop.

#### Endianness and Bit Packing

little-endian for all multi-byte integers. Pack pixels MSB-first within each byte.

> **⚠ Flag — redundancy:** this rule is already stated in [`g6_00-architecture.md`](g6_00-architecture.md). Consider removing the duplicate in Phase 2 consolidation, or keep as a per-section reminder if helpful.

#### SPI framing

Each message SHALL be transmitted as exactly one SPI transaction, bounded by chip-select (CS). The message begins on CS falling edge and ends on CS rising edge. The controller and panel SHALL reset their message parsers on CS rising edge.

A message from the controller to the panel is defined by the "protocol commands". The panels return the header and command from the previously received message followed by an 8-bit checksum.

The controller SHALL clock exactly the number of bytes required by the command for that protocol version, but at least 3 bytes. Invalid messages are ignored and don't trigger a panel update.

**Message rejection behavior:**

If any validation fails (unsupported protocol version, unsupported command, incorrect message length, parity failure), the panel SHALL discard the message.

> **⚠ Flag — v2 forward note:** the "at least 3 bytes" floor is encoded in firmware as `MESSAGE_MINIMUM_SIZE = HEADER_SIZE (2) + PAYLOAD_MINIMUM_SIZE (1) = 3`. v2 commands `0x02`, `0x03`, `0x0F` have zero-byte payloads in the source spec — under the firmware's current rule those would need at least 1 dummy payload byte (since `PAYLOAD_MINIMUM_SIZE = 1`), or `PAYLOAD_MINIMUM_SIZE` needs to drop to 0. Decide during v2 migration.

### Implemented Commands

Version 1 of the protocol supports only three commands (controller → panel):

- `0x01` — Communication check
- `0x10` — Display 2-Level Grayscale (Oneshot)
- `0x30` — Display 16-Level Grayscale (Oneshot)

| Header (parity) | Header (version) | Cmd | Payload bytes | Total bytes | Name |
| :-: | :-: | :-: | :-: | :-: | :-- |
| 0\|1 | 1 | `0x01` | 200 | 202 | `COMM_CHECK` |
| 0\|1 | 1 | `0x10` | 51 (50 + stretch) | 53 | `DISP_2LVL_ONESHOT` |
| 0\|1 | 1 | `0x30` | 201 (200 + stretch) | 203 | `DISP_16LVL_ONESHOT` |

> **⚠ Flag — table column structure flattened from source:** the source table had a 2-row merged header (`Header` over `parity / version`) and a stray empty 6th column. Flattened to clean Markdown above. Verify equivalence: parity column is `0|1` (parity bit can be either), version column is `1` (v1 version bits = `0b0000001` = 1).

#### `0x01` — Communication check

Send a known message, display response. For example, upon reception of the command a specific part of the panel could light up. If it is interpreted correctly, a second part of the panel could light up for some time.

**Payload**: 200 bytes of known values — the byte sequence `0x00, 0x01, 0x02, …, 0xC7` (i.e., `payload[i] = i` for `i ∈ [0, 200)`).

**Example**:

`[0x01] [0x01] [0x00] [0x01] [0x02] … [0xC7]`

> **⚠ Flag — open: panel-side validation behavior:** with the canonical sequence pinned, the remaining open question is whether the panel should also *verify* the bytes match the expected sequence (rejecting mismatches), or whether it just echoes back the checksum and lets the host compare. Firmware currently does no payload-content validation beyond length/parity. Spec the verification policy explicitly.

#### `0x10` — Display 2-Level Grayscale (Oneshot)

Displays a 2-level (1-bit per pixel) pattern once.

**Payload**: 50 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x01] [0x10] [pixel data: 50 bytes] [stretch]`

#### `0x30` — Display 16-Level Grayscale (Oneshot)

Displays a 16-level (4-bit per pixel) pattern once.

**Payload**: 200 bytes of pattern data & 1 byte stretch value

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x01] [0x30] [pixel data: 200 bytes] [stretch]`

### Confirmation message

On CS falling edge, a panel returns the version, command, and a checksum from the previously received command.

When the panel receives a command, it stores the header, version, and calculates a 8-bit checksum of the payload. For invalid commands no information is stored, since they are ignored. This happens, for example, when the parity bit does not match the content, or when the message length does not match the command definition.

The next time the CS is active for more than 3 bytes, the panel sends this message (recalculating the parity bit). After sending it successfully, the temporary buffer is deleted: each confirmation message is only sent once.

If the panel buffer is empty, it returns `0x8100` (empty command "0").

We use an 8-bit (simple additive) checksum since this is faster to calculate than CRC, SHA, or other error detecting algorithms.

> **⚠ Flag — checksum algorithm naming inconsistency:** the prose says "8-bit (simple additive) checksum" but the [Pattern File Format tab](g6_04-pattern-file-format.md) uses an "XOR" checksum for the PAT-file body. Two different checksum algorithms in the same protocol family is fine if intentional, but worth noting. Confirm `g6_firmware_devel` implements additive (sum mod 256), not XOR, for panel confirmations.

> **⚠ Flag — "CS active for more than 3 bytes" trigger condition:** the rule is that the panel transmits its stored confirmation when the next CS transaction exceeds 3 bytes. But the "at least 3 bytes" rule above also says the controller clocks at least 3 bytes per message. So *every* valid message would trigger confirmation transmission — no discriminator. Question: is the trigger really `>3 bytes` (strict) so that a hypothetical 3-byte heartbeat could read empty buffer state without triggering confirmation send? Or is it `≥3 bytes`? Reconcile against `g6_firmware_devel`.

> **⚠ Flag — "0x8100" empty-buffer response is endianness-ambiguous:** is this a 16-bit value `0x8100` packed little-endian (so on the wire it's `0x00 0x81`)? Or is it `[header=0x81] [command=0x00]` as 2 separate bytes (so on the wire it's `0x81 0x00`)? The example block shows `CIPO: [0x81] [0x00]` which suggests the latter byte order. Recommend rewording to "returns header `0x81` followed by command `0x00`" to remove ambiguity.

**Example:**

```
COPI: [0x01] [0x10] [pixel data 1: 50 bytes]  [stretch 1]
CIPO: [0x81] [0x00]
…
COPI: [0x01] [0x30] [pixel data 2: 200 bytes] [stretch 2]
CIPO: [0x_1] [0x10] [checksum pixel data 1 + stretch]
…
COPI: [0x01] [0x30] [pixel data 3: 200 bytes] [stretch 3]
CIPO: [0x_1] [0x30] [checksum pixel data 2 + stretch]
```

`[0x_1]` is shorthand for "either `0x01` or `0x81`" depending on the parity bit recomputed for the confirmation message.

### Pixel Data Format

Pixels are transmitted in row-major order. For 2-level, bits are packed MSB-first, 8 pixels per byte. For 16-level, there are two pixels per byte (upper nibble first).

**Explicit Indexing**:

Let `k = row × 20 + col`; `row ∈ (0…19)`, `col ∈ (0…19)`, `k ∈ (0..399)`, row-major.

**2-level (1bpp)**:

```
byte_index   = k // 8
bit_in_byte  = 7 - (k % 8)              # MSB-first
pixel        = (payload[byte_index] >> bit_in_byte) & 1
```

**16-level (4bpp)**:

```
byte_index = k // 2
if k even → pixel = (payload[byte_index] >> 4) & 0x0F
if k odd  → pixel =  payload[byte_index]       & 0x0F
```

No per-row padding; the bitstream is continuous across row boundaries.

#### Example pixel ↔ LED mapping for panel v0.1

The arrangement of pixels (row, column) looks like this:

```
pixel[0,0],  pixel[0,1],  …, pixel[0,19],
pixel[1,0],  pixel[1,1],  …, pixel[1,19],
…
pixel[19,0], pixel[19,1], …, pixel[19,19]
```

The current G6 v0.1 hardware has LED designators in the following matrix:

```
D1   D21  D20  …  D341  D340  D360
D41  D61  D60  …  D381  D380  D400
D2   D22  D19  …  D342  D339  D359
…
D49  D69  D52  …  D389  D372  D392
D10  D30  D11  …  D350  D331  D351
D50  D70  D51  …  D390  D371  D391
```

For the full mapping, see [`g6_02-led-mapping.md`](g6_02-led-mapping.md).

We want `pixel[0,0]` to start at the bottom-left corner and `pixel[19,19]` to end at the top-right.

This means:

- `pixel[0,0]` corresponds to LED D50
  - 2-level: byte_index=0, bit_in_byte=7; bit 0
  - 16-level: byte_index=0, even; bits 0…3
- `pixel[0,1]` to LED D70
  - 2-level: byte_index=0, bit_in_byte=6; bit 1
  - 16-level: byte_index=0, odd; bits 4…7
- `pixel[19,18]` to LED 340
  - 2-level: byte_index=49, bit_in_byte=1; bit 398
  - 16-level: byte_index=199, even; bits 0…3
- `pixel[19,19]` to LED 360, and so on
  - 2-level: byte_index=49, bit_in_byte=0; bit 399
  - 16-level: byte_index=199, odd; bits 4…7

> **⚠ Flag — example pinned to v0.1 hardware:** current production is `panel_rp2354_20x20_v0p2` and `v0.3.0` is in draft; the v0.1 LED designator layout used in this example is not the production layout. The full LED mapping (`g6_02-led-mapping.md`) needs to either (a) carry per-revision tables and have this example annotate which revision the worked numbers refer to, or (b) supersede this v0.1 example with a v0.2 / v0.3 walkthrough. Decide once `g6_02-led-mapping.md` lands.

### Optional: Panel Error Display

While not essential for implementing the v1 commands described here, we expect it will be useful for G6 Panels to implement simple visual error indicators, similar to G3 implementation, to aid troubleshooting during development (and usage). When an error is detected, the panel displays a small predefined pattern representing an error index. A future-proof implementation could already use the command `0x70`. If Flash pattern storage and display are working well, then this should be the most convenient implementation.

Suggested error message format: with 20×20 pixels, have plenty of space for 2×2 characters (5×7 pixel size per char is typical), so suggested messages would be: "PE / 01 - 99" — `PE` = panel error on the top row, and the error code would be displayed on the lower row.

Example (or some other font library with maybe 8×8 glyphs would be better):

```
....................
....................
...####....#####....
...#...#...#........
...####....####.....
...#.......#........
...#.......#........
...#.......#####....
....................
....................
...###.....###......
..#...#...#...#.....
..#..##......#......
..#.#.#......##.....
..##..#......#......
..#...#...#...#.....
...###.....###......
....................
....................
....................
```

During implementation, `<will@iorodeo.com>` should decide which errors are most relevant, but some suggestions are:

- Unknown or uninterpretable command
- Payload length mismatch
- Checksum/parity failure
- Data timeout / incomplete message

To make this error visible — we will need to keep them displayed for a short interval, at least 500 ms. This could be done with a dedicated error message routine that repeats the same pattern. During this time the panel should receive but ignore incoming commands so that the error can be noticed.

This feature is not required for protocol v1 compliance but provides a quick, hardware-level diagnostic without needing serial debug output.

> **⚠ Flag — `0x70` collides with v4:** the suggestion to use command `0x70` for the error display puts it in command space that v4 reserves for "Display Predefined Pattern with Stretch (Oneshot)". Either the error display uses a different command code, or the v4 spec should explicitly carve out a slot for the error glyph (e.g., `predefined pattern 0` is the error glyph, indexed via the v4 `0x70` command). Reconcile when the v4 section lands.

> **⚠ Flag — error-display frame ASCII shows 2×2 chars not 5×7:** the source claims "5×7 pixel size per char is typical" but the ASCII glyphs in the example are roughly 5 columns wide × 7 rows tall arranged as 2×2 (4 chars total: P / E / digit / digit). Verify the pixel count by counting the `#` cells in the source glyph; the migration above preserved the source ASCII verbatim — note the asterisks (`\*`) in the source were Markdown escapes for `#`, which I've decoded.

---

## v2 — G6 Panel Protocol v2 (teaser)

Version 2 of the protocol extends v1 by adding PSRAM (Pseudo-Static RAM) support, enabling panels to store multiple patterns in memory and display them on demand. While protocol version 1 is already able to emulate all the commands G4 can support, protocol version 2 should be capable of handling higher framerates and might be a first useful version to release to the community.

> **⚠ Flag — version-bit value not stated in source:** v2 implies version bits `0b0000010` (giving headers `0x02` / `0x82`) — this is consistent with the example bytes used throughout v2's command examples but is never written down explicitly. Lift to normative spec text when the master command summary lands.

### Additional Commands (v2)

- `0x02` — Query diagnostics
- `0x03` — Reset diagnostic stats
- `0x0F` — Reset PSRAM
- `0x1F` — Write 2-Level Grayscale to PSRAM
- `0x3F` — Write 16-Level Grayscale to PSRAM
- `0x50` — Display PSRAM Index (Oneshot)

#### `0x02` — Query diagnostics

Get the diagnostics from the panel. We should circle back to this once v1 is implemented; current ideas from `<will@iorodeo.com>` include counting the number of bad bytes, short messages, or other error rates. Statistics could either be collected from `0x01` messages or from all messages sent since the last reset.

**Payload**: None (0 bytes)

**Example**:

`[0x02] [0x02]`

> **⚠ Flag — diagnostic data shape unspecified:** the spec says "get the diagnostics from the panel" without defining what the panel returns. Decide once v1 confirmation-message logic lands: is the response carried in the confirmation-message slot, or does the panel switch to a different return format? What fields (counters, error codes, last-error-byte index)? Action: spec the diagnostic record format before this command becomes implementable.

#### `0x03` — Reset diagnostic stats

Reset the diagnostic counter.

**Payload**: None (0 bytes)

**Example**:

`[0x82] [0x03]`

#### `0x0F` — Reset PSRAM

Clears all user-stored patterns from PSRAM, keeping only factory predefined patterns.

**Payload**: None (0 bytes)

**Example**:

`[0x02] [0x0F]`

> **⚠ Flag — example header `0x02` is wrong:** with v2 version bits `0b0000010` and command `0x0F = 0b00001111`, the popcount is 1 + 4 = 5 → parity = 1 → header should be `0x82`. Source says `0x02`. Fix during the next pass (same kind of transcription error as the v1 examples).

> **⚠ Flag — section heading vs body inconsistency:** source section heading reads "Reset RAM"; body and command-list say "Reset PSRAM". Migrated heading uses "Reset PSRAM" for consistency with the rest of the v2 section. Confirm intent.

**Purpose**: Reset the panel's PSRAM to a clean state, removing all patterns stored via commands `0x1F` and `0x3F`.

- Starting a new experimental session with fresh memory
- Ensuring a known initial state before loading new patterns

> **⚠ Flag — "factory predefined patterns" not yet specified:** "keeping only factory predefined patterns" implies a category of patterns that survives Reset PSRAM. v4 introduces predefined patterns explicitly (commands `0x70+`); but v2 itself does not specify them. Decide whether to drop the parenthetical here or carry it forward as a forward-reference to v4.

#### `0x1F` — Write 2-Level Grayscale to PSRAM

Writes a 2-level (1-bit per pixel) pattern to PSRAM for later retrieval.

**Payload**: 53 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)
- **Bytes 5–54**: Pattern data (50 bytes)
  - 20×20 pixels in row-major order
  - 1 bit per pixel (0=off, 1=on)
  - Total: 400 pixels / 8 = 50 bytes
- **Byte 55**: stretch value

**Example**:

`[0x02] [0x1F] [index: 3 bytes] [pixel data: 50 bytes] [stretch]`

**Purpose**: Store patterns in the panel's PSRAM instead of transmitting them every time. This reduces transmission overhead during high-speed pattern sequences and enables efficient pattern libraries.

> **⚠ Flag — index endianness unspecified:** "3 bytes, 24-bit integer" — is this little-endian (consistent with [`g6_00-architecture.md`](g6_00-architecture.md) "little-endian for all multi-byte integers")? Spec it explicitly per the architecture rule. Same flag applies to commands `0x3F` and `0x50`.

#### `0x3F` — Write 16-Level Grayscale to PSRAM

Writes a 16-level (4-bit per pixel) pattern to PSRAM for later retrieval.

**Payload**: 203 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)
- **Bytes 5–204**: Pattern data (200 bytes)
  - 20×20 pixels in row-major order
  - 4 bits per pixel (0–15 intensity levels)
  - Total: 400 pixels × 4 bits / 8 = 200 bytes
- **Byte 205**: stretch value

**Example**:

`[0x02] [0x3F] [index: 3 bytes] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x1F` but for higher grayscale resolution patterns. Allows storage of more complex visual stimuli with 16 distinct brightness levels.

#### `0x50` — Display PSRAM Index (Oneshot)

Displays a pattern that was previously stored in PSRAM using command `0x1F` or `0x3F`.

**Payload**: 4 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x02] [0x50] [index: 3 bytes]`

> **⚠ Flag — payload size mismatch:** "Payload: 4 bytes" but only "Bytes 2–4" (3 bytes of index) are listed. Either the payload is 3 bytes (matching the listed fields) and the "4 bytes" claim is wrong, or there's an unspecified 4th byte. The Master Command Summary in the source ([Panel Version Summary tab, lines 1042–1110]) lists this command's payload as "3 (idx)" — so the "4 bytes" here is most likely a transcription error and the payload is actually 3 bytes.

**Purpose**: Display a pre-stored pattern immediately (oneshot = display once). This provides:

- **Fast pattern switching**: Only 5 bytes need to be transmitted instead of 52–202 bytes
- **Efficient memory usage**: Store patterns once, reference them by index
- **Reduced bandwidth**: Critical for high-frequency pattern sequences

> **⚠ Flag — "5 bytes" inconsistent with "Payload: 4 bytes":** the Purpose says total transmission is 5 bytes (header + command + 3-byte index = 5), which matches a 3-byte payload, contradicting the "Payload: 4 bytes" claim above. Resolves the same ambiguity: payload is 3 bytes, total message is 5 bytes.

### Typical v2 Workflow

1. **Pre-load patterns into PSRAM**:

   ```
   [0x02] [0x1F] [0x00 0x00 0x00] [pattern 0 data…] [0xC0]   // stretch 192
   [0x02] [0x1F] [0x00 0x00 0x01] [pattern 1 data…] [0x05]   // stretch 5
   [0x02] [0x3F] [0x00 0x00 0x02] [pattern 2 data…] [0x20]   // stretch 32
   ```

2. **Display patterns by index during experiment**:

   ```
   [0x02] [0x50] [0x00 0x00 0x00]
   [0x02] [0x50] [0x00 0x00 0x01]
   [0x02] [0x50] [0x00 0x00 0x02]
   ```

> **⚠ Flag — workflow example headers can't be parity-verified:** the example bytes use `[0x02]` for every header, but parity correctness depends on the elided `pattern N data…` payloads. The headers are illustrative, not normatively-correct for arbitrary payloads. When concrete patterns are chosen for a worked example, recompute the parity bits.

## v3 — G6 Panel Protocol v3 (teaser)

Version 3 adds high-performance modes to the existing protocol. This takes advantage of the PSRAM and the additional trigger line, allowing synchronized displays with imaging setups. This release will enable a whole new set of experiments, precisely controlling the timing of visual stimuli to the rest of the experimental rigs.

> **⚠ Flag — version-bit value not stated in source:** v3 implies version bits `0b0000011` (giving headers `0x03` / `0x83`) — consistent with the example bytes used throughout v3 but never written down explicitly. Lift to normative spec text when the master command summary lands.

### Additional Commands (v3)

- `0x12` — Display 2-Level Grayscale (Gated)
- `0x13` — Display 2-Level Grayscale (Persistent)
- `0x32` — Display 16-Level Grayscale (Gated)
- `0x33` — Display 16-Level Grayscale (Persistent)
- `0x52` — Display PSRAM Index (Gated)
- `0x53` — Display PSRAM Index (Persistent)

> **⚠ Flag — `0x54` referenced in workflow but not in command list:** the "Gated-persistent display with external control" workflow example below uses command `0x54`, but `0x54` is not declared in the Additional Commands list above and has no per-command spec section. Either (a) `0x54` is a 4th display-mode variant ("Gated-Persistent": trigger-gated repeated display from PSRAM) that needs an explicit row in the command list and a per-command section, or (b) the workflow example is wrong and should use `0x53` (Persistent) or `0x52` (Gated). The v4 master command summary in the source spec confirms `0x64` and `0x74` are "Gated-Persistent" variants for PSRAM-with-stretch and predefined-pattern-with-stretch respectively — strongly suggesting `0x54` is the v3 equivalent and was simply omitted from the v3 command list. **Action:** add `0x54` (or whatever the correct opcode is) explicitly to the v3 command list and per-command sections, and document the Gated-Persistent display mode alongside the other three modes below.

### Display Modes

Protocol v3 introduces three display modes that control when and how patterns are displayed:

**Oneshot** (v1 default): Display the pattern once immediately.

**Gated**: High-performance mode in which the panel's display is gated by the rising edge on the external trigger line. The trigger signal gates the display on and off, enabling sub-frame synchronization with external devices such as two-photon microscope scanning — where the requirement is to only display when the imaging is not integrating fluorescent signals.

> _The precise details of how to best synchronize to fast external signals will be worked out once the timing of the G6 is better understood. The most relevant gating signal is ~10 μs pulses at 8 or 12 kHz (15–25% duty cycle). Possible implementations include asynchronous gating or synchronous gating tied to internal row/column update cycles, potentially gating a single display event (e.g., one row/column combination per trigger). The precise behavior is **to be determined**._

**Persistent**: Display the pattern continuously, repeating it over and over until another command is received. Useful for static backgrounds or continuous stimuli.

> **⚠ Flag — three modes listed, four implied:** the workflow examples use Oneshot (v1), Gated (v3), Persistent (v3), AND Gated-Persistent (v3, via `0x54`). The Display Modes section above only formally describes three (Oneshot, Gated, Persistent). Add a fourth entry: "**Gated-Persistent**: while the trigger line is HIGH the pattern displays repeatedly; while LOW the display is disabled. Pattern remains loaded across trigger transitions until a new command is received." Pair this with the v3 command list update mentioned in the previous flag. The v4 spec already follows this 4-mode pattern (Oneshot / Gated / Persistent / Gated-Persistent) per its `0x6X`/`0x7X` command groups.

#### `0x12` — Display 2-Level Grayscale (Gated)

Displays a 2-level (1-bit per pixel) pattern with each column activation gated by the external trigger signal.

**Payload**: 51 bytes of pattern data & stretch

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x03] [0x12] [pixel data: 50 bytes] [stretch]`

**Purpose**: High-performance synchronization where individual column activations are gated by high-frequency trigger signals. Critical for two-photon microscopy with resonant scanners, where visual stimuli must only be displayed during specific phases of the scan cycle.

#### `0x13` — Display 2-Level Grayscale (Persistent)

Displays a 2-level (1-bit per pixel) pattern continuously until a new command is received. This is similar to the default on G3 displays.

**Payload**: 51 bytes of pattern data & stretch

- 20×20 pixels in row-major order
- 1 bit per pixel (0=off, 1=on)
- Total: 400 pixels / 8 = 50 bytes

**Example**:

`[0x03] [0x13] [pixel data: 50 bytes] [stretch]`

**Purpose**: Display static or repeating patterns without needing to continuously send commands. Useful for backgrounds, fixation points, or continuous visual stimuli. The pattern repeats until another display command is received.

#### `0x32` — Display 16-Level Grayscale (Gated)

Displays a 16-level (4-bit per pixel) pattern with each column activation gated by the external trigger signal.

**Payload**: 201 bytes of pattern data

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x03] [0x32] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x12` but with 16-level grayscale for more complex visual stimuli.

> **⚠ Flag — `0x32` payload description omits stretch:** "Payload: 201 bytes of pattern data" suggests 201 bytes are *all* pattern data, but the breakdown only describes 200 bytes of pattern, and the example explicitly includes a `[stretch]` byte. Should read "Payload: 201 bytes (200 pattern + 1 stretch)" to match the convention used by `0x12` and `0x13` ("51 bytes of pattern data & stretch"). Same flag applies to `0x33` below. The total of 201 bytes is correct; only the descriptive wording is off.

#### `0x33` — Display 16-Level Grayscale (Persistent)

Displays a 16-level (4-bit per pixel) pattern continuously until a new command is received.

**Payload**: 201 bytes of pattern data

- 20×20 pixels in row-major order
- 4 bits per pixel (0–15 intensity levels)
- Total: 400 pixels × 4 bits / 8 = 200 bytes

**Example**:

`[0x03] [0x33] [pixel data: 200 bytes] [stretch]`

**Purpose**: Same as `0x13` but with 16-level grayscale for more complex visual stimuli.

#### `0x52` — Display PSRAM Index (Gated)

Displays a pattern from PSRAM with each column activation gated by the external trigger signal.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x03] [0x52] [index: 3 bytes]`

**Purpose**: High-performance mode combining PSRAM efficiency with gated display for two-photon microscopy synchronization.

#### `0x53` — Display PSRAM Index (Persistent)

Displays a pattern from PSRAM continuously until a new command is received.

**Payload**: 3 bytes

- **Bytes 2–4**: PSRAM index/location (3 bytes, 24-bit integer)

**Example**:

`[0x03] [0x53] [index: 3 bytes]`

**Purpose**: Display pre-stored patterns persistently, combining the benefits of PSRAM storage and continuous display.

### Typical v3 Workflows

**Two-photon microscopy with gated display**:

```
// Send pattern that will be gated by resonant scanner sync signal, stretch 5
[0x03] [0x32] [pattern data: 200 bytes] [0x05]
// All panels in an arena can be synchronized to a sub-frame trigger signal
// that turns the panels on and off
```

**Gated-persistent display with external control**:

```
// Pre-load pattern to PSRAM, stretch 5
[0x03] [0x1F] [0x00 0x00 0x00] [pattern data: 50 bytes] [0x05]
// Display pattern continuously, but only when trigger line is high
[0x03] [0x54] [0x00 0x00 0x00]
// Trigger HIGH -> pattern displays repeatedly
// Trigger LOW  -> display disabled
// Trigger HIGH -> pattern displays again
// …until new command received
```

> **⚠ Flag — the gated-persistent example mixes a v2 write into the v3 example flow:** the pre-load step uses `0x1F` (v2 Write 2-Level Grayscale to PSRAM) — that's correct since the same PSRAM is shared across protocol versions. The header byte `[0x03]` for the `0x1F` command signals v3 protocol but the command itself is from v2. This is fine if v3 panels accept v2 commands (i.e., higher protocol versions are supersets), but the spec doesn't explicitly state that. **Action:** add a "compatibility statement" to v3 (and v2) clarifying that higher-version panels MUST accept lower-version commands.

## v4 — G6 Panel Protocol v4 (teaser)

Version 4 introduces predefined patterns. Predefined patterns are widely used patterns such as all-on, checkerboards, etc.

> **⚠ Flag — version-bit value not stated in source:** v4 implies version bits `0b0000100` (giving headers `0x04` / `0x84`) — consistent with the example bytes used throughout v4 but never written down explicitly. Lift to normative spec text when consolidated.

### Additional Commands (v4)

- `0x60` — Display PSRAM Index with Stretch (Oneshot)
- `0x61` — Display PSRAM Index with Stretch (Trigger)
- `0x62` — Display PSRAM Index with Stretch (Gated)
- `0x63` — Display PSRAM Index with Stretch (Persistent)
- `0x64` — Display PSRAM Index with Stretch (Gated-Persistent)
- `0x70` — Display Predefined Pattern with Stretch (Oneshot)
- `0x71` — Display Predefined Pattern with Stretch (Trigger)
- `0x72` — Display Predefined Pattern with Stretch (Gated)
- `0x73` — Display Predefined Pattern with Stretch (Persistent)
- `0x74` — Display Predefined Pattern with Stretch (Gated-Persistent)

> **⚠ Flag — only 3 of 10 v4 commands have per-command spec sections.** The source documents `0x70` (Oneshot), `0x72` (Gated), and `0x73` (Persistent) for predefined patterns. The other 7 (`0x60`/`0x61`/`0x62`/`0x63`/`0x64` for PSRAM-index-with-stretch and `0x71`/`0x74` for predefined-pattern Trigger / Gated-Persistent variants) are only listed here. **Action:** add per-command sections for at least `0x60` (Oneshot), `0x63` (Persistent — used in workflow examples), and any `0x64`/`0x74` (Gated-Persistent — see flags below). The Trigger-mode variants `0x61`/`0x71` are even less defined: no Trigger mode is described in the Display Modes section of v3 or v4.

> **⚠ Flag — "Trigger" is a 4th display mode introduced in v4 with no description.** v3 defined Oneshot / Gated / Persistent and (implicitly via `0x54`) Gated-Persistent. v4 adds a "Trigger" mode (`0x61`, `0x71`) but never describes how Trigger differs from Gated. Hypothesis: Trigger fires the display once on the next trigger edge (one-shot-but-trigger-gated), while Gated continuously gates the display while the trigger line is HIGH. **Action:** add a Trigger entry to the Display Modes section of v3 (or define it here in v4) before any of `0x61`/`0x71` becomes implementable.

> **⚠ Flag — "Gated-Persistent" is now the 5th mode, still not described.** The v4 command list explicitly names `0x64` and `0x74` "Gated-Persistent". v3's workflow example used the corresponding `0x54` for PSRAM-index Gated-Persistent but didn't describe the mode. Consolidate the description with the v3 flag of the same name.

#### `0x70` — Display Predefined Pattern with Stretch (Oneshot)

Displays a predefined pattern (stored in panel flash memory) once with specified stretch value.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x70] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Access factory-loaded or pre-programmed patterns stored in panel flash memory. Useful for common patterns (calibration grids, test patterns, standard backgrounds) without requiring PSRAM upload. Stretch allows these base patterns to be displayed at different intensities.

> **⚠ Flag — `0x70` collides with the v1 error display suggestion.** v1 § Optional Panel Error Display suggests using `0x70` for the panel error glyph ("a future-proof implementation could already use the command 0x70"). v4 here uses `0x70` for "Display Predefined Pattern with Stretch (Oneshot)". Resolve: either move the error display to a different opcode, or reserve `predefined-pattern index 0` (or some sentinel index) as the "error glyph" slot indexed via this `0x70` command. Same flag as in v1.

#### `0x72` — Display Predefined Pattern with Stretch (Gated)

Displays a predefined pattern with stretch, gated by external trigger signal.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x72] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Gated display of predefined patterns. Useful for synchronized display of standard patterns during specific experimental phases.

#### `0x73` — Display Predefined Pattern with Stretch (Persistent)

Displays a predefined pattern continuously with stretch until new command received.

**Payload**: 4 bytes

- **Bytes 2–4**: Predefined pattern index (3 bytes, 24-bit integer)
- **Byte 5**: Stretch value (1 byte, 0–255)

**Example**:

`[0x04] [0x73] [index: 3 bytes] [stretch: 1 byte]`

**Purpose**: Persistent display of predefined patterns. Ideal for standard backgrounds or inter-trial displays that can be set once and left running.

> **⚠ Flag — predefined-pattern catalog not specified.** "Calibration grids, test patterns, standard backgrounds" are mentioned but no concrete catalog is given. Open questions: How many predefined slots? Which patterns are "factory-loaded" vs. user-installable? Is the pattern format identical to PSRAM-stored patterns? Where do they live (flash memory? a separate memory region)? How are they programmed (manufacturing, OTA, host command)? Answer before committing to v4 deployment.

### Typical v4 Workflows

**Brightness modulation experiment**:

```
// Pre-load base pattern at medium intensity
[0x04] [0x1F] [0x00 0x00 0x00] [pattern data: 50 bytes]

// Display same pattern at different brightnesses
[0x04] [0x60] [0x00 0x00 0x00] [0x40]   // 25% brightness
[0x04] [0x60] [0x00 0x00 0x00] [0x80]   // 50% brightness
[0x04] [0x60] [0x00 0x00 0x00] [0xFF]   // 100% brightness
```

**High dynamic range with low-bit patterns**:

```
// Use 2-level pattern (1-bit) but achieve HDR via stretch
[0x04] [0x1F] [0x00 0x00 0x00] [2-level pattern: 50 bytes]

// Display at various intensities for effective multi-level grayscale
[0x04] [0x60] [0x00 0x00 0x00] [0x11]   // Dim
[0x04] [0x60] [0x00 0x00 0x00] [0x55]   // Medium-low
[0x04] [0x60] [0x00 0x00 0x00] [0xAA]   // Medium-high
[0x04] [0x60] [0x00 0x00 0x00] [0xFF]   // Bright

// Achieves 4+ effective brightness levels with 50-byte patterns
```

**Using predefined patterns for calibration**:

```
// Display factory calibration grid at full brightness
[0x04] [0x70] [0x00 0x00 0x00] [0xFF]

// Display test pattern at 50% brightness
[0x04] [0x70] [0x00 0x00 0x01] [0x80]
```

**Adaptive brightness during experiment**:

```
// Start with bright stimulus
[0x04] [0x63] [0x00 0x00 0x00] [0xFF]

// Adapt to subject — reduce brightness mid-experiment
[0x04] [0x63] [0x00 0x00 0x00] [0x60]

// Pattern continues displaying at new brightness
```

> **⚠ Flag — `0x1F` write is being used through a `[0x04]` v4 header.** Same compatibility question as v3: does v4 accept v1/v2/v3 commands as a superset? The spec implies yes (the workflow examples mix versions freely) but never states it normatively. Resolve along with the same flag in v3.

> **⚠ Flag — workflow uses `0x60` and `0x63` but neither has a per-command spec section.** The first three workflows above use `0x60` (PSRAM-index-with-stretch Oneshot); the fourth uses `0x63` (Persistent). Both are listed in the Additional Commands list but are missing the per-command details (payload layout, example, purpose). Add per-command sections to make these workflows reproducible.

## v5 — G6 Panel Protocol v5 (sketch)

Add more grayscale levels, color support, and pattern modifiers.

- `0x20…0x2F` — use 4-level grayscales similar to `0x10…0x1F`
- `0x50…0x4F` — use 256-level grayscales similar to `0x10…0x1F`

> **⚠ Flag — `0x50…0x4F` is an inverted range (typo).** Almost certainly intended to be `0x40…0x4F` (256-level grayscale opcodes paralleling 2-level at `0x10…0x1F` and 16-level at `0x30…0x3F`). The pattern would be: `0x10` = 2-level, `0x20` = 4-level, `0x30` = 16-level, `0x40` = 256-level. (Skipping `0x00` and 8-level — unclear why; perhaps reserved for future or simply an artifact of the 1/2/4-bit pixel encoding choices.)

Other commands that might be interesting:

- Get pattern from PSRAM and display as 2, 4, 16, or 256 level pattern with new color lookup table. That way one could invert a 2-color pattern from memory by just sending 7 bytes payload.
- Get pattern from PSRAM but translate by x or y pixel.
- Get pattern from PSRAM and change contrast (either using brightest or darkest pixel as reference).
- Increase or decrease brightness in other ways than stretch.
- Scale pattern sizes (zoom in, zoom out).

> **⚠ Flag — v5 is a pure brainstorm, not a spec.** The "interesting commands" bullets above have no opcodes assigned, no payload formats, no examples. Treat v5 as a roadmap section, not a specifiable protocol version. Delete or formalize before consolidation. The precursor [G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) (will@iorodeo.com) raised the 4-level + LUT HDR idea explicitly — that's the closest historical reference for v5's color-LUT direction.

## Master command summary (v1–v4)

This table provides a complete reference of all commands across protocol versions v1–v4.

| Byte 0 (header) | Byte 1 (cmd) | Bytes 2+ (payload) | Description | Protocol version |
| :--: | :--: | :-- | :-- | :--: |
| `0x01` / `0x81` | `0x01` | 200 bytes | Communication check | v1 |
| `0x01` / `0x81` | `0x10` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Oneshot) | v1 |
| `0x01` / `0x81` | `0x30` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Oneshot) | v1 |
| `0x02` / `0x82` | `0x02` | None | Query diagnostic stats | v2 |
| `0x02` / `0x82` | `0x03` | None | Reset diagnostic stats | v2 |
| `0x02` / `0x82` | `0x0F` | None | Reset PSRAM (clear user patterns) | v2 |
| `0x02` / `0x82` | `0x1F` | 3 idx + 50 pattern + stretch | Write 2-Level Grayscale to PSRAM | v2 |
| `0x02` / `0x82` | `0x3F` | 3 idx + 200 pattern + stretch | Write 16-Level Grayscale to PSRAM | v2 |
| `0x02` / `0x82` | `0x50` | 3 idx | Display PSRAM Index (Oneshot) | v2 |
| `0x03` / `0x83` | `0x12` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Gated) | v3 |
| `0x03` / `0x83` | `0x13` | 51 bytes (50 pattern + stretch) | Display 2-Level Grayscale (Persistent) | v3 |
| `0x03` / `0x83` | `0x32` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Gated) | v3 |
| `0x03` / `0x83` | `0x33` | 201 bytes (200 pattern + stretch) | Display 16-Level Grayscale (Persistent) | v3 |
| `0x03` / `0x83` | `0x52` | 3 idx | Display PSRAM Index (Gated) | v3 |
| `0x03` / `0x83` | `0x53` | 3 idx | Display PSRAM Index (Persistent) | v3 |
| `0x04` / `0x84` | `0x60` | 3 idx + stretch | Display PSRAM Index with Stretch (Oneshot) | v4 |
| `0x04` / `0x84` | `0x62` | 3 idx + stretch | Display PSRAM Index with Stretch (Gated) | v4 |
| `0x04` / `0x84` | `0x63` | 3 idx + stretch | Display PSRAM Index with Stretch (Persistent) | v4 |
| `0x04` / `0x84` | `0x70` | 3 idx + stretch | Display Predefined Pattern with Stretch (Oneshot) | v4 |
| `0x04` / `0x84` | `0x72` | 3 idx + stretch | Display Predefined Pattern with Stretch (Gated) | v4 |
| `0x04` / `0x84` | `0x73` | 3 idx + stretch | Display Predefined Pattern with Stretch (Persistent) | v4 |

> **⚠ Flag — master summary is missing rows for several declared commands.** The v3 command list declared `0x12`/`0x13`/`0x32`/`0x33`/`0x52`/`0x53` (all present here) plus the implied `0x54` (NOT in this table). The v4 command list declared `0x60`/`0x61`/`0x62`/`0x63`/`0x64` and `0x70`/`0x71`/`0x72`/`0x73`/`0x74`, but this table only includes `0x60`/`0x62`/`0x63`/`0x70`/`0x72`/`0x73` — missing `0x61`/`0x64`/`0x71`/`0x74` (Trigger and Gated-Persistent variants). Either the table is incomplete, or those commands are aspirational and should be removed from the v4 command list. **Action:** decide which set is canonical and align the table with the per-version command lists.

> **⚠ Flag — payload-size convention conflict between table and per-command sections.** The table writes `0x10` payload as "51 bytes (50 pattern + stretch)" and `0x30` as "201 bytes (200 pattern + stretch)" — clean and consistent. But the per-command sections in the source v3 use "201 bytes of pattern data" wording (omitting stretch) for `0x32`/`0x33`. Same numeric total, different wording. Standardize on the table's "N bytes (M pattern + stretch)" format throughout.

> **⚠ Flag — v2 `0x1F` and `0x3F` payload counts conflict between v2 source and master summary.** v2 source said `0x1F` is "Payload: 53 bytes" (with byte ranges that actually summed to 54); master summary says "3 idx + 50 pattern + stretch" = 54. Likewise `0x3F`: v2 said 203, summary says 204. The summary's totals are correct — the v2 per-command "53"/"203" figures are off-by-one transcription errors. Decide on the canonical figures and fix the v2 sections to match.

**Notes:**

- **Byte 0 (Header)**: The two values shown (e.g., `0x01` / `0x81`) differ only in the MSB parity bit. The actual value depends on the parity of the entire message.
- **Protocol Version**: Encoded in bits 0–6 of Byte 0 (`0x01` = v1, `0x02` = v2, `0x03` = v3, `0x04` = v4).
- **Index**: 24-bit integer (3 bytes) specifying PSRAM or predefined pattern location.
- **Stretch**: 8-bit value (0–255) for brightness control.
- **Pattern Data**:
  - 2-level: 50 bytes (1 bit per pixel, 20×20 = 400 pixels)
  - 16-level: 200 bytes (4 bits per pixel, 20×20 = 400 pixels)

### Display Mode Summary

| Mode | Behavior | Use Case |
| :-- | :-- | :-- |
| **Oneshot** | Display pattern once immediately | Standard display, frame-by-frame control |
| **Gated** | Wait for first trigger, then gate display (high=show, low=hide) once | Sub-frame synchronization, two-photon microscopy |
| **Persistent** | Display pattern continuously until new command | Static backgrounds, continuous stimuli |

> **⚠ Flag — Display Mode Summary missing two modes.** The table here lists 3 modes (Oneshot, Gated, Persistent) but the v4 command list named 5: those plus **Trigger** (`0x61`, `0x71`) and **Gated-Persistent** (`0x64`, `0x74`). v3 also implicitly used a 4th mode via `0x54`. Either expand this table to 5 rows or restrict the v4 command list to 3 modes. **Action:** decide the canonical mode set.

> **⚠ Flag — "Gated" description is ambiguous.** "Wait for first trigger, then gate display (high=show, low=hide) once" — what does "once" mean? (a) The display gates HIGH/LOW for the duration of one trigger cycle then stops? (b) The display pattern is shown once, gated by trigger? The v3 § Display Modes describes Gated as "panel's display is gated by the rising edge on the external trigger line" with no notion of "once". Reconcile the two descriptions.

### Protocol Evolution

- **v1**: Basic oneshot display with stretch (2-level and 16-level grayscale)
- **v2**: PSRAM storage and indexed display (storage efficiency, fast pattern switching)
- **v3**: High-performance modes with trigger line (precise timing, synchronized display)
- **v4**: Predefined patterns
- **v5**: Additional grayscale levels, color support, pattern modifiers (future)

> **⚠ Flag — v3 evolution description is partial.** "High-performance modes with trigger line" describes Gated only; v3 also adds Persistent (which doesn't use the trigger line at all). Reword as "v3: Gated and Persistent display modes (trigger-line synchronization for two-photon microscopy; continuous display for static stimuli)".

---

## Open Questions / TBDs (v1)

1. **Stretch semantics underspecified.** Linear scale, gamma-corrected, BCM duty-cycle multiplier? What does stretch=0 mean? How does it interact with the BCM bit-plane refresh? Firmware currently parses stretch but does not apply it (see [Current state § D3](#reconciliation-against-g6_firmware_devel--6944894-run-2026-05-01)). Action: spec the scaling semantics; firmware ticket to wire stretch into the display loop.
2. **D1 — Checksum scope.** Spec says "of the payload"; firmware sums whole message including header + command bytes. Decide which is normative.
3. **D2 — Confirmation message implementation.** Specified, not yet implemented in `g6_firmware_devel`. Decide whether to keep spec as-is (firmware-pending) or reword to defer until firmware lands.
4. **D4 — `COMM_CHECK` visual response.** Spec aspirational ("could light up"); firmware callback empty. Make it normative or drop the sentence.
5. **D5 — LED-mapping layering.** Spec says "host owns LED mapping"; firmware also maps schematic→physical. Confirm two-stage model (host: logical→schematic; firmware: schematic→physical) and rewrite both this spec and [`g6_00-architecture.md`](g6_00-architecture.md).
6. **`COMM_CHECK` panel-side validation policy.** With the canonical sequence pinned, decide whether the panel must verify the bytes or merely echo back the checksum.
7. **Confirmation-message trigger: `>3` or `≥3` bytes?** As written, every valid message would trigger confirmation send (since "at least 3 bytes" applies to every message). Decide once confirmation message is implemented.
8. **"`0x8100`" empty-buffer response endianness.** Could be ambiguous between the 16-bit value `0x8100` packed LE (on-wire `0x00 0x81`) and "header `0x81`, command `0x00`" (on-wire `0x81 0x00`). The CIPO example block strongly suggests the latter. Action: reword as two-byte description.
9. **Checksum algorithm name conflict.** Panel-confirmation checksum is "additive" (sum mod 256); pattern-file checksum is "XOR". Confirm both intentional during [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) reconciliation.
10. **`0x70` command code collides with v4 predefined-pattern command.** Action: pick one (move error display to a different command code, or reserve `predefined-pattern index 0` as the error glyph slot in v4). Reconcile when v4 section lands.
11. **v2 forward note: zero-payload commands.** v2 commands `0x02`, `0x03`, `0x0F` have zero-byte payloads in the source spec but firmware enforces `PAYLOAD_MINIMUM_SIZE = 1`. Decide during v2 migration whether to drop the floor or add a dummy byte.
12. **Worked pixel-mapping example is pinned to panel v0.1 hardware.** Production is now v0.2; v0.3 is in draft. Decide whether [`g6_02-led-mapping.md`](g6_02-led-mapping.md) carries per-revision tables and this example annotates which revision, or if the example gets refreshed for v0.2/v0.3.
13. **Panel error display command-set decision.** The source explicitly defers to `<will@iorodeo.com>`: which errors are most relevant and what command code carries them. Action: track in `g6_firmware_devel` issues / discussions, then update spec.
14. **SPI mode / clock not yet specified.** Firmware uses CPOL=1, CPHA=1 (Mode 3), MSB-first, 30 MHz. Lift these into normative spec text for cross-platform interop.

## Cross-references

- [Source Google Doc, "Panel Version 1" tab](https://docs.google.com/document/d/17crYq4sdD1GhazOPS_Yi6UyGV6ugUy3WGnCWWw49r_0/edit#) — verbatim source for this section.
- [Precursor: G6 message format proposal](https://docs.google.com/document/d/1PTZqUxw04CUFtpy8vCtdnMF04zJVquuUo61HCXcoizs/edit) — origin of pattern-data row-major MSB-first convention.
- [`g6_00-architecture.md`](g6_00-architecture.md) — system architecture, host/controller/panel responsibilities, endianness.
- [`g6_02-led-mapping.md`](g6_02-led-mapping.md) — full pixel ↔ LED designator table for the worked example above.
- [`g6_04-pattern-file-format.md`](g6_04-pattern-file-format.md) — host-side panel-block formatting (parity pre-computation), checksum algorithm.
- [`g6_03-controller.md`](g6_03-controller.md) — controller-side framing, panel-set transmission, command dispatch.
- [`iorodeo/g6_firmware_devel`](https://github.com/iorodeo/g6_firmware_devel) — authoritative v1 panel firmware (reconciliation pending).
