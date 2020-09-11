---
title: Generation 4
has_children: true
nav_order: 22
---

1. TOC
{:toc}

# Introduction

The 4th generation (G4 for short) of modular LED displays is capable of showing 16 bit stimuli with up to 500Hz for 16-level brightness scale and 1500Hz on a 2-level brightness scale. Different forms of arena boards can be used to place the 40×40mm² panels each with 16×16 LEDs in columns up to 4 panels in height. 

While the complexity and capability of the G4 displays has increased over previous generations, they are more accessible and easy to use through a set of advanced software tools. These "Display Tools" can be used to defined patterns and movements, arrange them into complex experimental protocols, and run data analysis on the results. These easy to use GUIs modify script which can be further customized by advanced users, should the experimental requirements go beyond what the current set of "Display Tools" supports.

# Setup

Setting up a G4 arena requires a one-time effort to get hardware, firmware, and software up and running. We describe this process in the Setup documentation.

## Difference to Generation 3

The main differences to the [Generation 3](/Generation 3) are the size of the panel (40×40mm² instead of 32×32mm² for G3), the use of Serial Peripheral Interface (SPI) instead of I²C, and synchronous controller driven updates, which means that patterns are only shown when the controller is sending data.

## Working principle from 10,000 feet

The general working principle of a G4 Arena is as follows: A dedicated software called "G4 Host" is waiting for description of stimuli. Read about how these stimuli are generated as part of the [Display Tool](#Display-Tools) documentation. The "G4 Host" sends this description of stimuli through the PCIe I/O card via several SPI channels to the arena board. The PCIe card is basically a Field-programmable Gate Array (FPGA) allowing for fast yet flexible communication between the computer and the arena. On the arena board the channels are distributed to different columns of panels. A column of panel can have up to four panels stacked on top of each other and typically an arena has up to twelve columns. Each of the panels consists of two different PCBs, the communication PCB and the driver PCB. The communication PCB has one microcontroller (MCU) handling the communication with the driver panel and the other panels in the column. The driver panel has four MCUs which are responsible for turning the LEDs on and off.

The FPGA on the PCIe card gets programmed through the "G4 Host" application. As long as the "G4 Host" is set up correctly and running on the computer, the PCIe card should be working. The arena boards are custom built for specific experiments, but do not contain programmable components. For the panel, each of the communication boards and each of the driver boards need to be programmed with specific firmware before they are installed on the arena.

# Overview of G4 Display Tools
{:#Display-Tools}

This document briefly describes the various software tools developed for this system. They require the [Hardware](docs/G4_Hardware_Setup.md) and [Software](docs/G4_Software_Setup.md) to be [working correctly](docs/G4_Verify.md). 

The "Display Tools" can be used to generate visual stimuli, run experiments, and analyze the acquired results. Some of the software tools described later in this document do not require a physical LED arena set up and attached to the computer in order to be used; for example, the Motion Maker scripts can be used to generate and visualize patterns without any G4 hardware attached, and the Data Analysis scripts only require the TDMS log files generated during an experiment in order to analyze and plot data. Other tools, such as PControl and the Protocol Designer scripts, will only be fully functional when connected to a G4 Display system.

## [Motion Maker](Display_Tools/Motion_Maker_G4/About Motion Maker.md)

This set of scripts and GUIs can be used to design patterns (primarily for displaying motion, rather than pictures of objects) on the G4 display. Patterns are generated using the Motion_Maker_G4.m script based on input parameters that describe the desired motion. These scripts output two types of pattern files: The first type is a .mat file which contains the created pattern matrix and all the pattern parameters so that it can be easily read back into MATLAB. The second type is a .pat file containing a binary vector of the pattern that can be quickly accessed by the Display Controller. Only the .pat file is necessary to be displayed on a G4 arena, though the .mat file is needed to be easily loaded back into MATLAB for viewing, debugging, or for creating experiments with the G4_Protocol_Designer (described later). See G4_Display_Tools\Motion_Maker_G4\About Motion Maker.docx for more details.

## [Function Maker](Display_Tools/Function_Maker_G4/About Function Maker.md)

This set of scripts and GUIs allow for the design and creation of analog output functions and position functions, to be used in conjunction with displaying patterns on a G4 display. Position functions control what frame of the selected pattern is displayed for every refresh cycle (when the display system is operating in position function mode), operating at a rate of either 500 or 1000 Hz (1-bit or 4-bit patterns, respectively). Analog output functions control the voltage of the analog output channels of the G4 system (accessed easily with the optional breakout box) in a way that is synchronized to the display refresh cycle, operating at 1000 Hz regardless of the pattern refresh rate. Similar to Motion_Maker_G4, functions are created using the Function_Maker_G4.m script based on input parameters that describe the desired function. These scripts output two types of files: The first type is a .mat file which contains the created function array and all the function parameters so that it can be easily read back into MATLAB. The second type is either a .afn (for analog output functions) or .pfn (for position functions) file containing a binary vector of the function that can be quickly accessed by the Display Controller.

## PControl

Developed by Jinyang Liu, PControl_G4 allows for communication between the G4 display system and MATLAB by establishing a TCP connection between the two. A communication channel can be opened using the connectHost function, and messages can be translated and sent to the display using Panel_com. Commands for displaying patterns and using functions in various modes can be sent, provided that an ‘experiment folder’ has been created and specified. Experiment folders can be made by manually selecting pre-made pattern and function files using the design_exp GUI. Running `PControl_G4` automatically connects to the G4 display and opens a window where an experiment folder can be specified and various commands can be sent, including commands for displaying the patterns included in the experiment folder. Finally, examples of custom-written patterns and functions are also included in this set of scripts.

## [Protocol Designer](Display_Tools/docs/G4_Designer_Manual.md)

Developed by [Lisa (Taylor) Ferguson](mailto:taylorl@janelia.hhmi.org), these scripts and GUIs allow for designing, visualizing, and running experimental protocols using patterns and functions that have already been created. An experimental structure can be created and visualized using the G4_Experiment_Designer GUI, where pre-made pattern and function files can be selected and organized. Experimental protocols can be validated within the GUI and saved as .g4p files. 

## [Experiment Conductor](Display_Tools/docs/G4_Conductor_Manual.md)

The "G4 Experiment Conductor GUI" can run experimental protocols and display information on the current experiment progress in real-time.

## Example Experiment Scripts

These scripts – using many of the functions described in the previous tools – demonstrate an entirely script-based solution for creating patterns, functions, and experiment folders, as well as creating and running experiments with the G4 system.

## Data Analysis

These scripts can be used to read data logged and acquired by the G4 display system into MATLAB. Each experiment (marked by `start log` and `stop log` commands) outputs a folder of log files in .TDMS format, which can be read and converted into a MATLAB struct using the `G4_TDMS_folder2struct` function. These log files contain data and timestamps corresponding to the frames displayed during that experiment as well as the commands received over TCP. Any active analog output and analog input channels are also logged by both voltage and corresponding timestamp. Additional scripts are included for further processing, analyzing, and plotting data from two example categories of experiments – a tethered fly walking on an air-suspended ball, and a tethered flying fly monitored with a wingbeat analyzer. An example of a full data analysis pipeline is shown in the `test_G4_Data_Analysis.m` script.




