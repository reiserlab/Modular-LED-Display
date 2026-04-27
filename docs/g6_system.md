---
title: Generation 6
nav_order: 30
permalink: /G6/
---

1. TOC
{:toc}

# Generation 6

Generation 6 (G6) is the current hardware and software branch for the Modular LED Display system. It is no longer just a placeholder: several G6 modules are now available under `Generation 6/*`, covering both hardware and tool development. Yet, all of those under heavy development. For a stable and well working system check out the Generation 4.

At the moment, the published G6 material is organized into a small set of practical modules. The main pieces now available are the arena hardware, the panel hardware, a historical test-arena branch, MATLAB tools, and web-based design tools.

## Available modules

| Module | Path | What it contains | Current role |
|---|---|---|---|
| **Arena** | `Generation 6/Arena/` | Main G6 arena backplane hardware | Primary published arena hardware |
| **Panels** | `Generation 6/Panels/` | G6 LED panel hardware | Primary published panel hardware |
| **Hardware** | `Generation 6/Hardware/` | Test-arena hardware branch | Historical development hardware |
| **maDisplayTools** | `Generation 6/maDisplayTools/` | MATLAB tools for patterns, configs, protocol execution, and deployment | Main MATLAB workflow |
| **webDisplayTools** | `Generation 6/webDisplayTools/` | Browser-based editors and viewers | Main web workflow |

## Hardware modules

### [Arena]({{site.baseurl}}/Generation%206/Arena/docs/arena.html)

The current G6 arena hardware is a **10-10 arena** built around a **Teensy 4.1** with **Ethernet** connectivity. It acts as the main backplane for the display, organizing the panel columns in a circular geometry while integrating controller, power, panel routing, and experiment I/O on one PCB.

For a new build, the practical recommendation at the moment is the latest production revision:

- `Generation 6/Arena/arena_10-10/arena_10-10_v1/production/v1p1r6/`

### [Panels]({{site.baseurl}}/Generation%206/Panels/docs/images/panels.html)

The G6 panels are **20x20 pixel** LED tiles built around the `panel_rp2354_20x20_*` design family. These are the repeated display modules that mount onto the arena backplane.

The newest published panel family in the repository is:

- `Generation 6/Panels/panel_rp2354_20x20_v0p3/`

For new hardware, the current default manufacturing package is:

- `Generation 6/Panels/panel_rp2354_20x20_v0p3/production/v0p3r1/`

### [Test Arena]({{site.baseurl}}/Generation%206/Hardware/docs/test-arena.html)

The `Generation 6/Hardware/` section currently documents a **test arena** branch. This hardware was intended to support firmware development for the arena, but it was never actually used. It is best treated as historical development material rather than part of the main recommended G6 build path.

Known versions include:

- Will Dickson v1.1
- Will Dickson v1.2
- Janelia v1.1

## Software modules

### maDisplayTools

`Generation 6/maDisplayTools/` is the MATLAB toolchain for working with G6 and related display generations. The repository describes it as supporting:

- pattern generation
- arena configuration
- SD card deployment
- TCP communication

Within the folder, the main functional areas are:

- `configs/` for arena and rig configuration
- `patternTools/` for pattern generation and visualization
- `g6/` for G6-specific encoding tools
- `experimentExecution/` for running protocols
- `controller/` for display communication
- `utils/` for configuration loading, validation, and deployment helpers

This is currently the main scripting and experiment-side software module under `Generation 6/*`.

### [webDisplayTools]({{site.baseurl}}/Generation%206/webDisplayTools/)

`Generation 6/webDisplayTools/` provides browser-based tools for design, visualization, and validation. Its published tools currently include:

- a pattern editor
- an arena layout editor
- a 3D arena viewer
- a pattern icon generator
- a G6 panel editor

The web tools are designed to stay consistent with the MATLAB reference workflow, and the repository includes validation tests comparing JavaScript calculations against MATLAB outputs.

## How the modules fit together

A practical way to think about the current G6 system is:

1. **Panels** provide the repeated 20x20 LED display tiles.
2. The **Arena** provides the backplane, controller integration, power distribution, and system wiring.
3. **maDisplayTools** provides the MATLAB workflow for arena configs, pattern generation, protocol handling, and deployment.
4. **webDisplayTools** provides browser-based design and visualization tools that complement the MATLAB workflow.
5. The **Test Arena** remains a historical development branch and is not the default starting point for a new system.

## Current status

Generation 6 is still an active development branch, but the repository now contains clearly identifiable modules rather than only placeholders. For most users starting with G6 today, the practical focus should be:

- the published **10-10 arena**
- the **RP2354-based 20x20 panels**
- the **maDisplayTools** MATLAB workflow
- the **webDisplayTools** browser workflow

That combination is the current public shape of the G6 system in this repository.
