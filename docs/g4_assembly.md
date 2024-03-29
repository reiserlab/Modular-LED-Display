---
title: Assembly
parent: Generation 4
nav_order: 1
has_children: true
has_toc: false
---

Before starting to assemble an arena, make sure you have [acquired the necessary parts](g4_acquisition.md).

# Build arena

## Flash firmware

The driver board has four and the comm board one additional micro controller. If you ordered 48 panels, then this step requires you to program 240 MCUs. Follow the the steps in the ["Firmware" document]({{site.baseurl}}/Generation%204/Firmware/docs), but be aware that this step can take some time. On the upside: you will only need to do this once.

## Assemble columns {#assemble-columns}

Once you programmed the MCUs, you can connect the driver and the comm board at their four 4×4 pin connectors. They should fit tightly and have a very sturdy connection. The edges of driver and comm board should overlap exactly, if one of the edges sticks out, then you connected it upside down.

Finalize the plan of your arena layout: not all columns need to be populated, in fact typical arenas have between 1 and 3 non-populated columns, for example to point cameras and other equipment into the arena. If you are leaving columns empty, they should be furthest away from the power connector on the arena bottom board. If you want to leave out single panels within a column, you can use the [placeholder panel]({{site.baseurl}}/Generation%204/Hardware/docs/comm.html#placeholder). That will give you a 21×35mm² cutout to point a camera or tool into the arena. Alternatively you can follow the wiring description in the [communication board page]({{site.baseurl}}/Generation%204/Hardware/docs/comm.html) if you need more space.

Once you planned your layout, connect roughly half of a column to the top arena, the other half to the bottom arena. For example, if you are planning to have a 3×11 arena, connect two rows of panels to the arena top board, and one to the bottom board. This makes the next step slightly easier (not easy) when you try to sandwich the columns between arena top and bottom board. Treat this step as a training session in dexterity and patience.

## Connect arena

Connect the arena to the interconnect board using the ribbon cable, and connect the interconnect board to the PCIe card (slot 1) using the [SHC68-68-RDIO](g4_off-the-shelf.md#vhdci-cables) cable. If you want to use the breakout box, you can connect it to the PCIe card (slot 0) with an [SHC68M-68F-RMIO](g4_off-the-shelf.md#vhdci-cables) cable.

Once you connect the power supply, the arena should be up and running. But you won't notice, since it doesn't receive any commands yet. So before powering it up, make sure to install the software.

# Install software {#install-software}

With the physical arena ready to go, you need to make sure that the software on you dedicated computer is correctly set up by following the [G4 Software Setup]({{site.baseurl}}/Generation%204/Display_Tools/docs/software_setup.html). Once the software is up and running, you can connect the power and verify that the panels are working by running the `all_on` command (see [Software Setup]({{site.baseurl}}/Generation%204/Display_Tools/docs/software_setup.html#verify)).
