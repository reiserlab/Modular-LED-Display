---
title: Getting the hardware
parent: Getting Started
nav_order: 2
---

# Acquiring the hardware

This is a reminder and reading guide for how to get started setting up the most recent modular LED Display, currently [Generation 4](../Generation 4). It is basically a compact version of the text [Acquisition](G4-Acquisition.md), which would be a good place to get started on more details.

Read more about earlier version in the sections [Generation 2](../Generation 3/Software/docs/g2-panels.md) and [Generation 3](../Generation 3/index.md).

Just a quick reminder if you have not looked at the chapter on [acquisition](G4-Acquisition.md): An assembled G4 arena consists of of up 48 panels connected to two arena boards. The whole setup is controlled from a dedicated computer and signals can be recorded via an additional breakout box.

As opposed to the strategic approach in the [acquisition text](G4-Acquisition.md) the current guide attempts to list items by turnaround times starting with what might take the longest time to acquire.

## Long turnaround items

The following parts take time to acquire as they will need to be custom built. This can take time (read: months).

- [Panel Driver PCB](../Generation 4/Panel/docs/driver.md#driver-v1). Get a few spare ones in addition to the number you need in your setup.
- The same number of [Panel Comm boards v0.3](../Generation 4/Hardware/docs/comm.md#comm-v0p3).
- Two [arena boards](../Generation 4/Hardware/docs/comm.md) per setup, one assembled as a bottom board, one as a top board.

All the above require time to verify the design and production files we provide. Not all manufacturers can produce the driver and the arena board. The production itself takes additional time, in our experience around one month. If something goes wrong, repeat.

## Medium turnaround items

Some of the PCBs are only required in smaller quantities, are less complicated designs, and are often quicker to get produced (read: weeks). In the best case order them in parallel to the other items, but since the quantity is much lower, you might want to choose a different manufacturer.

- [Arduino shield](../Generation 4/Firmware/docs/programmer.md#arduino-shield) for the programmer
- [Driver board shield](../Generation 4/Firmware/docs/programmer.md#driver-board-shield) for programmer
- [Comm board shield](../Generation 4/Firmware/docs/programmer.md#comm-board-shield) for programmer
- [Interconnect board](../Generation 4/Arena/docs/arena.md#interconnect) for the arena
- [Placeholder](../Generation 4/Hardware/docs/comm.md#placeholder) in case you want to skip a single panel in a column

## Off-the-shelf items

The turnaround times will depend on your supply chains, but should be fairly quick. Note, that the NI card and the computer will require a large part of the total system budget.

- National Instruments NI PCIe-7842R Card
- Computer with PCIe slot
- Arduino Uno
- Power supply
- VHDCI cables
- Breakout Box

{::comment}
TODO: Add assembly and troubleshooting

# Assembly

# Troubleshooting

{:/comment}