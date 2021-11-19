---
title: Getting the hardware
parent: Getting Started
nav_order: 2
---

# Acquiring the hardware

This is a reminder and reading guide for how to get started setting up the most recent modular LED Display, currently [Generation 4](g4_system.md). It is basically a compact version of the text [Acquisition](g4_acquisition.md), which would be a good place to get started on more details.

Read more about earlier version in the sections [Generation 2]({{site.baseurl}}/Generation%203/Software/docs/g2-panels.html) and [Generation 3]({{site.baseurl}}/Generation%203/index.html).

Just a quick reminder if you have not looked at the chapter on [acquisition](g4_acquisition.md): An assembled G4 arena consists of of up 48 panels connected to two arena boards. The whole setup is controlled from a dedicated computer and signals can be recorded via an additional breakout box.

As opposed to the strategic approach in the [acquisition text](g4_acquisition.md) the current guide attempts to list items by turnaround times starting with what might take the longest time to acquire.

## Long turnaround items

The following parts take time to acquire as they will need to be custom built. This can take time (read: months).

- [Panel Driver PCB]({{site.baseurl}}/Generation%204/Panel/docs/driver.html#driver-v1). Get a few spare ones in addition to the number you need in your setup.
- The same number of [Panel Comm boards v0.3]({{site.baseurl}}/Generation%204/Hardware/docs/comm.html#comm-v0p3).
- Two [arena boards]({{site.baseurl}}/Generation%204/Hardware/docs/comm.html) per setup, one assembled as a bottom board, one as a top board.

All the above require time to verify the design and production files we provide. Not all manufacturers can produce the driver and the arena board. The production itself takes additional time, in our experience around one month. If something goes wrong, repeat.

## Medium turnaround items

Some of the PCBs are only required in smaller quantities, are less complicated designs, and are often quicker to get produced (read: weeks). In the best case order them in parallel to the other items, but since the quantity is much lower, you might want to choose a different manufacturer.

- [Arduino shield]({{site.baseurl}}/Generation%204/Firmware/docs/programmer.html#arduino-shield) for the programmer
- [Driver board shield]({{site.baseurl}}/Generation%204/Firmware/docs/programmer.html#driver-board-shield) for programmer
- [Comm board shield]({{site.baseurl}}/Generation%204/Firmware/docs/programmer.html#comm-board-shield) for programmer
- [Interconnect board]({{site.baseurl}}/Generation%204/Arena/docs/arena.html#interconnect) for the arena
- [Placeholder]({{site.baseurl}}/Generation%204/Hardware/docs/comm.html#placeholder) in case you want to skip a single panel in a column

## Off-the-shelf items

The turnaround times will depend on your supply chains, but should be fairly quick. Note, that the NI card and the computer will require a large part of the total system budget.

- National Instruments NI PCIe-7842R Card
- Computer with PCIe slot
- Arduino Uno
- Power supply
- VHDCI cables
- Breakout Box

# Assembly

Once you have all the components needed for a setup, you need to assemble the actual setup.

## Flash firmware

Each panel has five micro controller units (MCU) that need to be programmed. Using the programmer, you will need to [flash the firmware]({{site.baseurl}}/Generation%204/Firmware/docs/) on each of the driver boards as well as each communication board. Panels that come from the manufacturer are not preprogrammed and are not operational without this. For panels that you had stored or inherited from a colleague, this is not always necessary: the software has been stable for a long time. Please check the date on the latest firmware version for your setup and decide based on this, if you need to update it.

## Assemble columns and arena

Once the individual parts of the arena are ready to be used, assemble the panels from the driver and comm board. Then [assemble those panels into column]({{site.baseurl}}/docs/G4-Assembly.html#assemble-columns). Finally connect the assembled columns to the arena boards.

## Install software and initial operation

To test and operate the G4 arena, you need to [install the "Panel_Host" software]({{site.baseurl}}/docs/G4-Assembly.html#install-software). This pre-compiled application is responsible for the communication between the computer and the arena. For an initial test you can use this software to turn on all LEDs. In addition, you should install the Display Tools that provide a user friendly interface to the arena on top of the "Panel_Host" software.

# Troubleshooting

The G4 arena is a complex system where many things can go wrong. It is therefore very likely that you will need to [troubleshoot]({{site.baseurl}}/docs/G4-troubleshooting.html) your setup at several points in the process of setting it up and running it. The [troubleshooting guide]({{site.baseurl}}/docs/G4-troubleshooting.html) as well as some of the more detailed documents contain information on how to do this, but if you ever get stuck, don't hesitate to [get in contact]({{site.baseurl}}/Contact.html).

Once you have a working setup, you can continue the getting started guides with the description on [how to set up an experiment]({{site.baseurl}}/Generation%204/Display_Tools/docs/G4DisplayOverview.html)
