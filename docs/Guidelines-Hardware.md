---
title: PCB Guidelines
parent: Contact
nav_order: 98
---

# PCB Guidelines

This document suggests what form files related to PCB design should be submitted and then hosted on the hardware related repositories for Modular LED Displays. While it is open for discussion, please follow the current suggestion as closely as possible for consistency across different repositories and hardware generations.

In general, it should be sufficient to follow the [checklist](#checklist). Each list item links to a text where more details are provided in case there is something unclear.

## Checklist

We would appreciate the following files to be submitted each time. If you submit these files to us when you also send them to the manufacturer, there should be almost no additional work required. If you want to send intermediate versions between hardware revisions, we can use the repositories to keep track of that, too.

- [Schematic drawing](#schematics) (e.g., `*.pdf`)
- [PCB Design](#design)  (e.g., `*.brd` for OrCAD or `*.kicad_pcb` for KiCad)
- Gerber files (e.g., `*.art` for OrCAD or `*.gbr` for KiCad)
- drill file (e.g., `*.drl` for OrCAD and KiCad)
- Bill of Materials (e.g., `*.csv` or `*.xlsx`)
- Invoice or price estimate (e.g., `*.pdf` or text)
- Design this was based on

While the above files should be available for each hardware revision, some of the files below are nice-to-have, but not crucial. Like the manufacturers' feedback, others depend on the assembler and can take different forms (e.g., emails, screenshots, update files) and follow different schedules. Others, like photos and renderings, are purely for improving the documentation.

- placement file (e.g., `*.txt`)
- feedback from manufacturer
- [Schematics Design](#schematics) (e.g., `*.sch` for Cadence and KiCad)
- [suggestion for a version number](#version)
- alternative license
- rendering of boards
- photo of produced board
- suggestion for improving the documentation

## EDA Design
{:#design}

Two different toolsets are being used to develop PCBs for the Modular LED Display, namely OrCAD and KiCad. While the [generated output files](#fabrication-files) follow industry standards and are reasonably similar to each other, the design files (or "sources") are not interchangeable. The design files for a display component are only available for one of the two toolsets.

Please base your iterative improvements on files from the repositories. When you submit a new design, please specify the starting point for your edits. Everything necessary to edit the design in that particular tool can be tracked in the repository. This can also include project files such as the `*.pro` files for a KiCad project.

Both toolsets divide the design process into the schematic design phase and the PCB design. 

### Schematic design
{:#schematics}

The focus of the repositories is on the production of Modular LED Displays and, therefore, the PCB design. Yet, to understand the PCB design, it is necessary to track changes in the schematics. Therefore some visualization of the schematic drawing should be provided every time something has changed. In the past, these schematics were shown through documents such as `*.pdf` files, but other images like `*.png` files can be OK, too. Some type of schematic drawing or a reference to the schematic previously used is required.

Since these files are generated from schematic design files, it can help track the schematic designs in the repositories as well. Both tools, OrCAD and (old versions of) KiCad, use the file extension `*.sch` for the schematic design files, while recent versions of KiCad switched to `*.kicad_sch`. Some of the designs can consist of several schematic files or additional library files containing details for used electrical components. Please provide all files necessary for opening the schematic. As a user of your toolset, you probably know best which files are required. 

The handover between the schematic design and the PCB design is, among others, a netlist file. Since the netlist can be generated from a valid schematic design file, it is unnecessary to keep track of these files in the repositories.

### PCB design

The purpose of the repositories and documentation is to enable other labs to produce their own Modular LED Displays. Different manufacturers and assemblers of PCBs might require slightly different versions of the fabrication files. Therefore it is necessary to share the PCB design files so that these labs can generate fabrication files according to their assembly houses. At this time (2020), some manufacturers also start accepting design files, for example, from KiCad to export the fabrication files in the exact format they need. So even if you decide not to share the schematic design files and only want to provide a schematic drawing instead, a shared PCB design file will make life easier for everyone.

For the two toolchains that have been used in the past, the PCB design file for OrCAD uses `*.brd` as a file extension while KiCad uses `*.kicad_pcb` at this stage. For example, the G4 panel driver starting with version 1, has been developed in OrCAD while the panel communication board is being developed in KiCAD. Consequently, the [driver board's repository](https://github.com/floesche/Panel-G4-Hardware) is used to track the latest design iteration in the OrCAD file format as a `*.brd` file. Similarly, the [comm board's repository](https://github.com/floesche/panels_g4_hardware/tree/master/atmega328/four_panel/20mm_matrix/ver3/comm/) contains the latest design iteration in a KiCad file format that uses the extension `*.kicad_pcb`.

Some designs might require additional files; please make sure to share all files that are necessary to open the PCB design file. For example, footprints of other components can be in a `*.kicad_mod` file.

## Fabrication files

"Fabrication files" is a set of files sufficient to produce the PCBs. The EDA tools generate the files from the PCB design files. Although file types are, in general, defined by industry standards, there are small differences between manufacturers and tools. OrCAD and KiCad support different settings for each of the generated files. It would be tedious to explain the various options. Instead, we list some best practices that create something similar to the lowest common denominator and have proven to work so far. We hope to improve these descriptions over time.

### Gerber files

Files in the [Gerber format](https://www.ucamco.com/en/gerber) describe the different layers of a PCB in a vector format. By now, all manufacturers can work with the "Extended Gerber format RS-274X". The Gerber format is ASCII based, which is well suited to track changes through git. The standard file extension is `*.grb`, and KiCad produces such files through the *File*{:.gui-txt} → *Plot*{:.gui-txt} menu. OrCAD generates RS-274X files with the extension `*.art`, which can easily be renamed – either on our side or the manufacturer side.

Both tools generate one file per layer, for example, copper layers, the solder paste layers on front and back, and the silkscreen. Some designs use additional files describe the edge cuts or the application of adhesives. For a four-layer PCB, this means that up to eleven Gerber files are produced (4×copper, front + back silkscreen, front + back solder paste, front + back adhesive, and edge cuts).

There is no standard for how the files are named. Therefore the manufacturers require a description of the order of files and other parameters such as board thickness and distance between layers. This is either done through an additional file often called `Assembly.art` (for OrCAD) or a human-readable JSON file with the extension `*-job.gbrjob` (for KiCAD).

#### KiCad

The following screenshot shows which options have worked well in the past. Noteworthy are the coordinate format that sets the unit to mm with a precision of 4 before and 6 digits after the comma. Make sure to select the X2 format and generate a job file.

![KiCad plot settings that work well](../assets/KiCad_plot-grb.png)

### Drill files

Drill files are not as well standardized as the Gerber files. Nevertheless, the Excellon drill format with the extension `*.drl` is widely supported and can be generated through OrCAD and KiCad. Similar to the Gerber files, Excellon drill files are ASCII based file formats, which makes tracking of changes through git easy. The CAD commands generally follow the gerber syntax, but there are a few differences and exceptions.

Emphasizing all features of the file format would be tedious, but there are a few settings that seem to work better than others. Specifically, many manufacturing machines don't support the relatively new "repeat code" which makes the file shorter but computation on the manufacturing machines more complex. For example, the command `R50X004` would repeatedly drill a hole 50 times along the X-axis 4mm apart. Functionally this is the same as specifying all 50 locations. On the other hand, most CAM drills support the automatic selection of the correct drill, so they can be specified in the file header instead of a description in an external text.

#### OrCAD

In summary, for OrCAD, the following settings have worked well. Note that *Auto tool select*{:.gui-txt} is selected and *Repeat codes*{:.gui-txt} is not, which is different from the default. The drilling should also be done by layer pair, which defines the starting and end layer for the drill, instead of generating a separate drill file for each layer.

![OrCAD NC Drill settings](../assets/OrCAD_drill.png)

In addition to the above options, OrCAD works best with setting the following *Parameters…*{:.gui-btn}. The format should have a precision of *3*{:.gui-txt} before and *3*{:.gui-txt} after the comma. The coordinates should be *Absolute*{:.gui-txt} and *Metric*{:.gui-txt} and the *Enhanced Excellon format*{:.gui-txt} should be selected. No zero suppression or one of the trailing or leading suppression should all work well.

![OrCAD NC Drill settings](../assets/OrCAD_drill-parameters.png)

#### KiCad

In KiCAD, a similar result can be achieved by selecting the *Excellon*{:.gui-txt} file format with *PTH and NPTH in single file*{:.gui-txt}, an *Absolute Drill Origin*{:.gui-txt} and *Drill Units*{:.gui-txt} in *Millimeters*{:.gui-txt}. In this case, the screenshot shows how to keep all zeroes, which will be the only structural difference to the file generated in OrCAD with the options shown above.

![KiCad drill file options](../assets/KiCad_plot-drl.png)

### Bill of Materials

The Bill of Materials (BOM) is a spreadsheet that matches the component names from design with actual physical components. Similarly to the drill files, there is no standard, but there are several recommendations and best practices. In general, `*.csv` and `*.xlsx` files are accepted, and we use both across the repositories.

Arguably the most crucial feature of a BOM are descriptive headers: the manufacturer will open the file and then try to match columns to the expected fields with as little manual intervention and margin for error as possible.

## Invoice

# Versioning
{:#version}

The file versioning loosely follows [Semantic Versioning](https://semver.org/). Within a generation, the version number has two components, for example [comm-v0.3](../Generation 4/Hardware/docs/comm.md#comm-v0p3). This is short hand for [Modular LED Display communication board version 4.0.3](../Generation 4/Hardware/docs/comm.md#comm-v0p3).

Components are considered incompatible between generations; hence the generation acts as the "MAJOR" version.

Each component of the Modular LED Display follows its own "MINOR" versioning, for example, functional improvements on the arena board does not require to change the version of drivers or other components. Since many of a display generations' repositories are independent of each other, the generation number does not need to be specified. Within the "Panels G4 Hardware" repository, the major version 4 is implicit, so that "version 0.3" automatically becomes 4.0.3.

Small changes, such as incremental improvements to design files or altered fabrication files that are based on the same design files, are acknowledged through the "PATCH" number. In the example above, the version 4.0.3 is the 3rd patch of version 0 within generation 4 of the Modular LED Displays.

# License

Files on the repositories are published under the [CERN Open Hardware License weakly reciprocal version 2.0 (CERN-OHL-W)](http://cern.ch/cern-ohl) and / or the [Creative Commons Attribution ShareAlike 4.0 International (CC BY-SA 4.0)](http://creativecommons.org/licenses/by-sa/4.0/) licenses. If you require another license, send a request along with your submission.
