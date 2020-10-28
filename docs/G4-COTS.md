---
title: Off-the-shelf items
parent: Acquisition
grand_parent: Generation 4
nav_order: 9
---

1. TOC
{:toc}

# Computer
{:#computer}

The computer acts as a controller for the arena and we recommend the use of a dedicated machine for this task. Two applications, namely MATLAB and a Simulink based custom application, need to run in parallel on this machine. The faster this machine the better, but we cannot give a recommendation on what the lower limit is. Most recently we used Dell Precision 5820 Workstations, but other recent PC with a PCIe slot will most likely work as well. The communication between computer and arena is realized through a specialized I/O card.

# Multi I/O card
{:#rio-card}

This is a FPGA based reconfigurable high speed IO device which can deliver the required multiple SPI channels within the anticipated time constraints. In addition, a connected [breakout box](#breakout) allows easy recording several analog data channels through the same device that is used to record other experimental data.

The controller is implemented based on a National Instruments Multifunction Reconfigurable I/O device, specifically the [National Instruments PCIe-7842R](https://www.ni.com/en-us/support/model.pcie-7842.html). This card has 3 sockets of the "very-high-density cable interconnect" format (VHDCI). One connection will go to the [arena](../Generation 4/Arena/docs/arena.md) (eg through an [interconnect board](../Generation 4/Arena/docs/arena.md#interconnect)). Another one can be used with a [breakout box](#breakout).

Note that the card does not always work in all PCIe slots in all computers. In our test systems, the card worked in 2 out of 5 slots, most likely because these slots had too little PCI lanes.

# VHDCI cable(s)
{:#vhdci}

For the connection between PCIe card and interconnect board, you will need one [SHC68-68-RDIO](https://www.ni.com/en-us/shop/accessories/products/digital-cable.html?skuId=30215) cable. For the connection between the PCIe card and the [breakout box](#breakout) a [SHC68M-68F-RMIO](https://www.ni.com/en-us/support/model.shc68m-68f-rmio-cable.html) cable was recommended. Both use the same connector, but we could only get reliable results when using the cables in the described way.

# NI Breakout box
{:#breakout}

The breakout box takes a 68 pin VHDCI connection form the Multi I/O card as input and exposes some of those channels as BNC or D-sub connections.

{::comment}
TODO: needs to be confirmed

We are currently using connector blocks like the NI [BNC-2090A](http://sine.ni.com/nips/cds/view/p/lang/pt/nid/203462) inside a CA-1000 enclosure.
{:/comment}

# Arduino Uno
{:#arduino}

The programmer is currently built around an Arduino Uno. The are widely available, for example at [1](https://store.arduino.cc/usa/arduino-uno-rev3) and [2](https://www.digikey.com/short/zr4nd5). The Arduino will be used to program the panel MCUs.

# Power supply
{:#power-supply}

In the past we have had no problems with 5V 10A power supplies such as [this one](https://www.adafruit.com/product/658) for typical arenas with around 40 panels. Depending on your setup, power supply with more or less amperage should work. The connectors on G4 arenas use a 2.1mm power connector with a positive center.

To estimate the power requirement, here an back-of-the-envelope calculation for a typical arena: Depending on the choices on LEDs and resistors you made during the acquisition of the [driver boards](../Generation 4/Panel/docs/driver.md), a single LED typically draws between 10 and 20mA when turned on. Because of the line scan algorithm, not more than 8 LEDs per quadrant are powered on at any time, so not more than 32 per panel. Since we use up to 4 different SPI busses, up to 128 LEDs can be turned on at the same time. This amounts to less than 3A for the light.

With 5 ATMega328 per panel (4 on the [driver](../Generation 4/Panel/docs/driver.md), 1 on the [comm board](../Generation 4/Hardware/docs/comm.md)) and 48 panels, up to 240 ATmega328 need to be powered all the time. Assuming another 20mA per MCU, this amounts to roughly 5A. Together with the 3A for the LEDs this ends at around 8A, which explains why a 10A works well in most setups.

The initial developer of the system suggested to budget roughly 0.25A for each used panel, which arrives at a similar result for typical setups.



