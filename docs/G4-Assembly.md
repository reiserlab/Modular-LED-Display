---
title: Assembly
parent: Generation 4
nav_order: 1
has_children: true
has_toc: false
---

Before starting to assemble an arena, make sure you have [acquired the necessary parts](G4-Acquisition.md).

# Build arena

## Flash firmware
{:.clear}

The driver board has four and the comm board one additional micro controller. If you ordered 48 panels, then this step requires you to program 240 MCUs. Follow the the steps in the ["Firmware" document](../Generation 4/Firmware/docs), but be aware that this step can take some time. On the upside: you will only need to do this once.

## Assemble columns

Once you programmed the MCUs, you can connect the driver and the comm board at their four 4×4 pin connectors. They should fit tightly and have a very sturdy connection. The edges of driver and comm board should overlap exactly, if one of the edges sticks out, then you connected it upside down.

Finalize the plan of your arena layout: not all columns need to be populated, in fact typical arenas have between 1 and 3 non-populated columns, for example to point cameras and other equipment into the arena. If you are leaving columns empty, they should be furthest away from the power connector on the arena bottom board. If you want to leave out single panels within a column, you can use the [placeholder panel](../Generation 4/Hardware/docs/comm.md#placeholder). That will give you a 21×35mm² cutout to point a camera or tool into the arena. Alternatively you can follow the wiring description in the [communication board page](../Generation 4/Hardware/docs/comm.md) if you need more space.

Once you planned your layout, connect roughly half of a column to the top arena, the other half to the bottom arena. For example, if you are planning to have a 3×11 arena, connect two rows of panels to the arena top board, and one to the bottom board. This makes the next step slightly easier (not easy) when you try to sandwich the columns between arena top and bottom board. Treat this step as a training session in dexterity and patience.

## Connect arena

Connect the arena to the interconnect board using the ribbon cable, and connect the interconnect board to the PCIe card (slot 1) using the [SHC68-68-RDIO](G4-COTS.md#vhdci-cables) cable. If you want to use the breakout box, you can connect it to the PCIe card (slot 0) with an [SHC68M-68F-RMIO](G4-COTS.md#vhdci-cables) cable.

Once you connect the power supply, the arena should be up and running. But you won't notice, since it doesn't receive any commands yet. So before powering it up, make sure to install the software.

# Install software
{:.clear}

With the physical arena ready to go, you need to make sure that the software on you dedicated computer is correctly set up. Once the software is up and running, you can connect the power.

After the hardware and software setup is complete, try to start "Panel_Host". At this point you should be able to send an *all on*{:.gui-txt} command through the application to check if the panels turn on. If that works, open MATLAB and run PControl_G4. Make sure that you "allow network access" to the g4host.exe.

Two windows will open: a LabVIEW window followed by a MATLAB GUI. Once the PControl_G4 MATLAB GUI has opened, click on the *arena*{:.gui-txt} tab and click *all on*{:.gui-btn}. If all LEDs on the arena turn on, then the system has been set up successfully. Otherwise and most likely you will need to trouble shoot system.
