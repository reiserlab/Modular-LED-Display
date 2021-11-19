---
title: Historic Background
nav_order: 1
parent: Getting Started
---

# Historic Background

In their publication ["A modular display system for insect behavioral neuroscience"](https://doi.org/10.1016/j.jneumeth.2007.07.019), Michael B. Reiser and Michael H. Dickinson introduce their system that is now know as "Generation 2". While the publication primarily focuses on the setup and data collection of this particular type of LED based flight arenas, the introduction gives a brief historic overview. This includes a link to Erich von Holst and Horst Mittelstaedt's 1950 publication of ["Das Reafferenzprinzip"](https://doi.org/10.1007/BF00622503) describing experiments that demonstrate the link between the central nervous system and peripheral neurons. It also lists other early uses of flight arenas, such as fixed patterns rotating around the insect as in [Karl Georg Götz' 1964](https://doi.org/10.1007/BF00288561) investigation of eye mutations, independent projections for each eye in [Karl Georg Götz' 1968](https://doi.org/10.1007/BF00272517) observation of motion perception, and earlier uses of LED arenas by [Strauss, Schuster, and Götz in 1997](https://jeb.biologists.org/content/200/9/1281).

As part of this current website, Mark Frye, Michael B. Reiser, and Michael H. Dickinson give another less formal introduction in [Theory and Practice of Insect Flight Simulators]({{site.baseurl}}/Generation%202/Arenas/docs/g2_user-guide.html). This document not only gives a historic overview of arenas, but also explains how to tether flies, and how to use an optical wingbeat analyzer. The last parts of the document describe the Panel Controller and other elements that were specific to the Generation 2 and Generation 3 arenas, but they also introduce terms that have been used since[^1].

To follow the history of the modular LED displays chronologically, you could dive into the detailed description of the [Generation 2]({{site.baseurl}}/Generation%202/Arenas/docs/g2_system.html) panel systems. That might only be of interest for historic reasons and if you are trying to fix an existing installation in your lab.

[Generation 3]({{site.baseurl}}/Generation%203/) arenas are still used in many places. The spatial and temporal resolution is not as high as in [Generation 4](g4_system.md) setups, but they come at a lower cost and appear to be slightly more robust. On the downside they are more difficult to use: Experiments need to be transferred to the arena on an SD card and it is missing all the [advanced]({{site.baseurl}}/Generation%204/Display_Tools/docs/pattern-generator.html) [tools]({{site.baseurl}}/Generation%204/Display_Tools/docs/function-generator.html) to [generate]({{site.baseurl}}/Generation%204/Display_Tools/docs/protocol-designer.html), [run]({{site.baseurl}}/Generation%204/Display_Tools/docs/experiment-conductor.html), and [analyze]({{site.baseurl}}/Generation%204/Display_Tools/docs/data-handling.html) experiments that [Generation 4](g4_system.md) has. So while there are good reasons to continue using existing [Generation 3]({{site.baseurl}}/Generation%203/) installations, we discourage you from building new ones.

## Repositories and file organization

![Link to the github repository this particular page is generated from](../assets/getting-started/web_footer.png){:.ifr}

The documentation for any of the generations is pulled from many different sources. Therefore, the most value for you could be the links to all the different repositories (see partial screenshot above). You will see a list of all repositories at the [home page]({{site.baseurl}}/#repositories). In addition and whenever you click on a menu, such as [Generation 4 → Assembly → Firmware]({{site.baseurl}}/Generation%204/Firmware/docs/) you will find a link on the bottom left of the page saying "This page is generated from …". A click on that link will get you directly to the linked github repository with all the potentially useful files. Beyond software, these repositories contain all the files you need to repair existing hardware, from schematics to gerber files ready to produce replacements for broken panels or arenas of different configurations.

---

[^1]: If you come across terms in newer documentations that are not introduced properly, your best guess is to look them up in this early guide, but please also [let us know about it]({{site.baseurl}}/Contact) and we will fix this.
