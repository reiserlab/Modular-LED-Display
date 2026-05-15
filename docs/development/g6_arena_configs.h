/*
 * g6_arena_configs.h — controller-side panel map keyed by Arena ID.
 *
 * STATUS: stepping-stone, hand-maintained.
 *
 * Canonical sources of truth:
 *   - Per-arena geometry + registered IDs:
 *       Generation 6/maDisplayTools/configs/arena_registry/  (README, index.yaml)
 *       Generation 6/maDisplayTools/configs/arenas/G6_*.yaml
 *   - Per-arena hardware topology (SPI bus + CS GPIO per column):
 *       TBD sibling hardware YAML (codegen plan); for now mirrored by hand here
 *       against g6_07-arena-firmware-interface.md § SPI region-to-bus mapping
 *       + § Pin assignments.
 *
 * This file will be replaced by a generated artifact (Python codegen in
 * maDisplayTools/tools/) once the sibling hardware YAML and the codegen
 * script land. Until then, keep this in sync with both YAML sources by hand.
 *
 * All anticipated G6 hardware uses 2 SPI buses; the struct accommodates more
 * but only `num_spi_buses == 2` is exercised today.
 *
 * Lookup: Arena ID is the 6-bit field at pattern-header bytes 4-5
 *         (see g6_04-pattern-file-format.md). Use g6_lookup_arena().
 */
#ifndef G6_ARENA_CONFIGS_H
#define G6_ARENA_CONFIGS_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint8_t panel_row;     /* 0-based row in arena grid */
    uint8_t panel_col;     /* 0-based column in arena grid */
    uint8_t spi_bus;       /* 0 = SPI (B0), 1 = SPI1 (B1) */
    uint8_t cs_gpio;       /* Teensy silk-label pin number (e.g. 0 = D0) */
    uint8_t cs_sub_index;  /* 0..3, position in the column's J3/J5 daisy chain */
} G6PanelMapEntry;

typedef struct {
    uint8_t                 arena_id;       /* 0..63 */
    const char             *display_name;   /* matches maDisplayTools registry `name` */
    uint8_t                 row_count;      /* full grid rows (= num_rows in registry YAML) */
    uint8_t                 col_count;      /* full grid cols (= num_cols; matches pattern-header byte 9) */
    uint8_t                 num_spi_buses;
    uint8_t                 panel_count;    /* installed panels = length of panels[] */
    const G6PanelMapEntry  *panels;
} G6ArenaConfig;

/*
 * Arena ID 1 — G6_2x10 (2 rows × 10 cols, full, 360° coverage).
 * Registry: Generation 6/maDisplayTools/configs/arenas/G6_2x10.yaml
 *
 * Hardware: arena_10-10 (v1.1.7). Bus B0 serves cols 0..4 (P1..P5); bus B1
 * serves cols 5..9 (P6..P10). Each column has 4 CS GPIOs (CS0..CS3) provisioned
 * in hardware; this 2-row arena uses CS0 (panel_row=0) and CS1 (panel_row=1)
 * only. Same Teensy CS GPIOs gate the corresponding column on each bus.
 */
static const G6PanelMapEntry g6_G6_2x10_panels[] = {
    /* col 0 (P1, B0) */
    {0, 0, 0,  0, 0}, {1, 0, 0,  2, 1},
    /* col 1 (P2, B0) */
    {0, 1, 0,  5, 0}, {1, 1, 0,  6, 1},
    /* col 2 (P3, B0) */
    {0, 2, 0,  9, 0}, {1, 2, 0, 10, 1},
    /* col 3 (P4, B0) */
    {0, 3, 0, 28, 0}, {1, 3, 0, 29, 1},
    /* col 4 (P5, B0) */
    {0, 4, 0, 32, 0}, {1, 4, 0, 23, 1},
    /* col 5 (P6, B1) — same CS GPIOs as col 0 */
    {0, 5, 1,  0, 0}, {1, 5, 1,  2, 1},
    /* col 6 (P7, B1) */
    {0, 6, 1,  5, 0}, {1, 6, 1,  6, 1},
    /* col 7 (P8, B1) */
    {0, 7, 1,  9, 0}, {1, 7, 1, 10, 1},
    /* col 8 (P9, B1) */
    {0, 8, 1, 28, 0}, {1, 8, 1, 29, 1},
    /* col 9 (P10, B1) */
    {0, 9, 1, 32, 0}, {1, 9, 1, 23, 1},
};

static const G6ArenaConfig g6_arena_configs[] = {
    {
        .arena_id      = 1,
        .display_name  = "G6_2x10",
        .row_count     = 2,
        .col_count     = 10,
        .num_spi_buses = 2,
        .panel_count   = sizeof(g6_G6_2x10_panels) / sizeof(g6_G6_2x10_panels[0]),
        .panels        = g6_G6_2x10_panels,
    },
    /*
     * Registered in maDisplayTools but skipped here until hardware exists:
     *   ID 2: G6_2x8of10   — same arena_10-10 hardware as G6_2x10, panel mask removes cols 0+9.
     *                        Add to this table when controller firmware needs to drive it.
     *   ID 3: G6_3x12of18  — hardware does not exist (would need a different bus topology).
     */
};

static inline const G6ArenaConfig *g6_lookup_arena(uint8_t arena_id) {
    for (size_t i = 0; i < sizeof(g6_arena_configs) / sizeof(g6_arena_configs[0]); ++i) {
        if (g6_arena_configs[i].arena_id == arena_id) return &g6_arena_configs[i];
    }
    return NULL;
}

#endif /* G6_ARENA_CONFIGS_H */
