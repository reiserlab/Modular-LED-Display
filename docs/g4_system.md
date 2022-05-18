---
title: Generation 4
has_children: true
has_toc: false
nav_order: 22
permalink: /g4/
---

1. TOC
{:toc}

# Introduction

The Modular LED Display Generation 4 (G4 for short) is capable of refresh rates of up to 500Hz with 256 brightness levels. Just turning individual LEDs on and off increases the refresh to 1500Hz. Arranging panels in a 12×4 grid, G4 can concurrently drive up to 48 panels. Each panel has 16×16 LEDs on a 40×40mm² footprint. G4 is faster and has a higher pixel density compared to previous generations.

G4 Modular LED Displays are more user friendly than earlier generations. An [extensive set of software tools](#Display-Tools) supports the user in generating stimuli, running experiments, and analyzing results. They can run the arenas from a host computer either through convenient tools or for more direct manipulation, through an API. No need to transfer protocols and stimuli via SD card, as it used to be in previous generations. This improves usability, development speed, and debugging.

# Acquisition and Assembly

The "modularity" aspect of the LED displays allows flexibility in setting up experiments. This gives you fine-grained control over setting up your experiments, but true to the Peter Parker principle [^1], this requires a more detailed understanding than an out-of-the-box system. Consequently, you need to choose which parts to use since not every hardware and software components are necessary for all setups – they might not be compatible with each other.

The section addressing acquisition allows you to gain the knowledge of which components are useful for which use cases. This section also guides you through acquiring the hardware. Whether you have no previous knowledge, or you realize at some point that pieces of hardware are missing, this is the section where you can find these types of answers.

Once you know what you want and you have the components in your lab, the assembly section explains in much detail how to build a working setup from these modules. At the end of this section you should have a G4 arena where you can turn LEDs on and off. We hope this section to be useful for people who just worked through the acquisition section. Hopefully it is also interesting for experienced users who have the components in their drawers and want to set up or verify an experimental rig.

# Overview of G4 Display Tools {#Display-Tools}

This document briefly describes the various software tools developed for this system. They require the [Hardware and Software](g4_assembly.md) to be [working correctly](g4_troubleshooting.md).

The "Display Tools" can be used to generate visual stimuli, run experiments, and analyze the acquired results. Some of the software tools described later in this document do not require a physical LED arena set up and attached to the computer in order to be used; for example, the [Pattern Generator](#pattern-generator) can be used to generate and visualize patterns without any G4 hardware attached, and the Data Analysis scripts only require the TDMS log files generated during an experiment in order to analyze and plot data. Other tools, such as PControl and the Protocol Designer scripts, will only be fully functional when connected to a G4 Display system.

## [Pattern Generator]({{site.baseurl}}/Generation%204/Display_Tools/docs/pattern-generator.html)

This set of scripts and GUIs can be used to design patterns (primarily for displaying pattern, rather than pictures of objects) on the G4 display. Patterns are generated using the `G4_Pattern_Generator_gui.m` script based on input parameters that describe the desired pattern. These scripts output two types of pattern files: The first type is a .mat file which contains the created pattern matrix and all the pattern parameters so that it can be easily read back into MATLAB. The second type is a .pat file containing a binary vector of the pattern that can be quickly accessed by the Display Controller. Only the .pat file is necessary to be displayed on a G4 arena, though the .mat file is needed to be easily loaded back into MATLAB for viewing, debugging, or for creating experiments with the [G4 Protocol Designer](#protocol-designer).

## [Function Generator]({{site.baseurl}}/Generation%204/Display_Tools/docs/function-generator.html)

This set of scripts and GUIs allow for the design and creation of analog output functions and position functions, to be used in conjunction with displaying patterns on a G4 display. Position functions control what frame of the selected pattern is displayed for every refresh cycle (when the display system is operating in position function mode), operating at a rate of either 500 or 1000 Hz (1-bit or 4-bit patterns, respectively). Analog output functions control the voltage of the analog output channels of the G4 system (accessed easily with the optional breakout box) in a way that is synchronized to the display refresh cycle, operating at 1000 Hz regardless of the pattern refresh rate. Similar to [G4_Pattern_Generator](#pattern-generator), functions are created using the `G4_Function_Generator_gui.m` script based on input parameters that describe the desired function. These scripts output two types of files: The first type is a .mat file which contains the created function array and all the function parameters so that it can be easily read back into MATLAB. The second type is either a .afn (for analog output functions) or .pfn (for position functions) file containing a binary vector of the function that can be quickly accessed by the Display Controller.

## PControl

Developed by Jinyang Liu, PControl_G4 allows for communication between the G4 display system and MATLAB by establishing a TCP connection between the two. A communication channel can be opened using the `connectHost()` function, and messages can be translated and sent to the display using `Panel_com`. Commands for displaying patterns and using functions in various modes can be sent, provided that an *experiment folder*{:.gui-txt} has been created and specified. Experiment folders can be made by manually selecting pre-made pattern and function files using the [Protocol Designer](#protocol-designer). Running `PControl_G4` automatically connects to the G4 display and opens a window where an experiment folder can be specified and various commands can be sent, including commands for displaying the patterns included in the experiment folder. Finally, examples of custom-written patterns and functions are also included in this set of scripts.

## [Protocol Designer]({{site.baseurl}}/Generation%204/Display_Tools/docs/protocol-designer.html)

Developed by [Lisa (Taylor) Ferguson](mailto:taylorl@janelia.hhmi.org), these scripts and GUIs allow for designing, visualizing, and running experimental protocols using patterns and functions that have already been created. An experimental structure can be created and visualized using the G4_Experiment_Designer GUI, where pre-made pattern and function files can be selected and organized. Experimental protocols can be validated within the GUI and saved as .g4p files.

## [Experiment Conductor]({{site.baseurl}}/Generation%204/Display_Tools/docs/experiment-conductor.html)

The "G4 Experiment Conductor GUI" can run experimental protocols and display information on the current experiment progress in real-time.

## Example Experiment Scripts

These scripts – using many of the functions described in the previous tools – demonstrate an entirely script-based solution for creating patterns, functions, and experiment folders, as well as creating and running experiments with the G4 system.

## [Data Analysis]({{site.baseurl}}/Generation%204/Display_Tools/docs/data-handling.html)

These scripts can be used to read data logged and acquired by the G4 display system into MATLAB. Each experiment (marked by `start log` and `stop log` commands) outputs a folder of log files in .TDMS format, which can be read and converted into a MATLAB struct using the `G4_TDMS_folder2struct` function. These log files contain data and timestamps corresponding to the frames displayed during that experiment as well as the commands received over TCP. Any active analog output and analog input channels are also logged by both voltage and corresponding timestamp. Additional scripts are included for further processing, analyzing, and plotting data from two example categories of experiments – a tethered fly walking on an air-suspended ball, and a tethered flying fly monitored with a wingbeat analyzer. An example of a full data analysis pipeline is shown in the `test_G4_Data_Analysis.m` script.

---

[^1]: ["With great power there must also come great responsibility"](https://en.wikipedia.org/wiki/With_great_power_comes_great_responsibility), a historic proverb popularized by Stan Lee in "Spider-Man"
