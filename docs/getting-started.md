---
title: "Getting Started"
nav_order: 5
has_children: true
has_toc: false
---

# How to get started

Depending on your background and on your goal, we try to provide different "Getting Started" guides. Please let us know if you find the helpful and [get in contact](../Contact.md) if you have ideas how to improve them.

## [Historic background](gs-historic-background.md)

- **Target audience**: Anyone
- **Prerequisites**: None
- **Provides**: Reading material
- **Expected outcome**: Understanding of experimental setups

Anyone interested in running experiments with modular LED displays will find some reading material here to learn about what these arenas have been used for and can be used for.

## [Aquiring the hardware](gs-getting-hardware.md)

- **Target audience**: Engineers supporting the setup process.
- **Prerequisites**: None
- **Provides**: List of steps to take with advanced reading list – roughly in sequential order.
- **Expected outcome**: Arena that can display basic patterns

For new systems, we currently recommend using Generation 4 modular displays as they are reasonably stable and provide the highest spatial and temporal resolution of the available systems.

## [Experiment Creation](../Generation 4/Display_Tools/docs/G4DisplayOverview.md)

- **Target audience**: Experimenter
- **Prerequisites**: Acquiring the hardware; Historic background (optional)
- **Provides**: Instructions to set up new experiment
- **Expected outcome**: Project files that can be used to run an experiment

Researchers that want to use modular LED displays to answer questions using a model animal can follow this guide to set up a new experiment. While some steps can be taken before a physical arena is available, its completion requires access to a complete setup.

## [Running an experiment](../Generation 4/Display_Tools/docs/G4Run_Overview.md)

- **Target audience**: Experimenter
- **Prerequisites**: Setting up the experiment; Historic background (optional)
- **Provides**: Instructions to run an existing experiment; troubleshooting
- **Expected outcome**: Recorded experimental data

During data collection, these guides act as reminders how to run the experiments and have been proven helpful in troubleshooting the system.

## [Analyzing the data](../Generation 4/Display_Tools/docs/DAtools_overview.md)

- **Target audience**: Experimenter; PI
- **Prerequisites**: Running an experiment
- **Provides**: Instruction for some quick data plots
- **Expected outcome**: Data sanity check

After running a set of experiments, these guides can help to generate some data plots to find out if the data recording was successful. Potentially they even help determine if the experiment shows the hypothesized effect.


{::comment}
FIXME: remove this
1. [Theory and Practice of Insect Flight Simulators](/Panel/Generation%203/Software/docs/g2-user-guide.html): The following three sections give a timeless overview of how to do fly experiments. The other sections are more geared towards Generation 2 and 3 arenas.
    1. [History and Principles of Operation](/Panel/Generation%203/Software/docs/g2-user-guide.html#history-and-principles-of-operation): The origins in the 1960s
    2. [Tethering Flies](/Panel/Generation%203/Software/docs/g2-user-guide.html#tethering-flies): How to get *Drosophila* to "cooperate" in these experiments
    3. [Optical Wingbeat Analyzer](/Panel/Generation%203/Software/docs/g2-user-guide.html#optical-wingbeat-analyzer): How to set up flight experiments with a bit of Hütchenology
2. For new systems, we currently recommend using [Generation 4 arenas](/Panel/Generation%204/Documentation/docs/components.html) as they are reasonable tested and stable. Read about [what you need](/Panel/Generation%204/Display_Tools/docs/G4_Hardware_Setup.html) to get started.
    1. The most recent [Arena board hardware description](/Panel/Generation%204/Arena/README.html)
    2. If you need to build the hardware, have a look at a description of the [G4 Panel](/Panel/Generation%204/Panel/README.html).
    3. Get the [Firmware](/Panel/Generation%204/Firmware/README.html) to [program the panels](/Panel/Generation%204/Display_Tools/G4%20Panel%20Programming/G4_Panel-programmer_instructions.html).
    4. [Verify that the setup is working](/Panel/Generation%204/Display_Tools/docs/G4_Verify.html)
3. There are [many excellent software tools](/Panel/Generation%204/Display_Tools/README.html) to set up your experiments. For example:
    1. Create [visual patterns](/Panel/Generation%204/Display_Tools/G4_Pattern_Generator/About%20Pattern%20Generator.html)
    2. Move these patterns with [functions](/Panel/Generation%204/Display_Tools/G4_Function_Generator/About%20Function%20Generator.html).
    3. [Set up your experiments](/Panel/Generation%204/Display_Tools/G4_Protocol_Designer/User-Instructions.html).
    4. [Run your experiments](/Panel/Generation%204/Display_Tools/G4_Protocol_Designer/User-Instructions.html#the-experiment-conductor).
    5. [Analyze your results](/Panel/Generation%204/Display_Tools/G4_Data_Analysis/Data_analysis_documentation.html).
{:/comment}