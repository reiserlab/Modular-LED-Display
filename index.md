---
title: Home
nav_order: 1
---
# Modular LED Displays

[![A modular display system for insect behavioral neuroscience](docs/assets/Reiser2008.png){: width="40%" .float-right}](https://doi.org/10.1016/j.jneumeth.2007.07.019)

LED-based systems offer a high level of control over the presentation of stimuli to model organisms. We are documenting the ["modular display system for insect behavioral neuroscience"](https://doi.org/10.1016/j.jneumeth.2007.07.019) and its derivatives on this website. We identify major revisions to the systems as "Generations." Here we focus on [Generation 3]({{site.baseurl}}/G3) and [Generation 4](docs/g4_system.md), with a brief outlook to [Generation 5](docs/g5_system.md).

In the past 15 years of development, various authors and developers documented progress in various publications and locations. This page has two major goals: First, it is an attempt to collect these technical details and user guides in a single site. This part of the documentation takes the form of a data dump, but please feel encouraged to get in touch with your questions, ideas for improvement, or your experience differs from the description. Second, this page attempts to provide an infrastructure for active developers and users to document the arenas and their use with the least effort. We generate this page from a hand full of code repositories. If you wrote documentation about the LED systems, related tools, or applications, please [reach out](Contact), and we try to integrate additional information.

Many researchers worldwide use [Generation 3]({{site.baseurl}}/G3) systems, but no further development goes into this generation. At Janelia, we migrated several rigs to [Generation 4](docs/g4_system.md) arenas and describe them in the preprint ["A high-speed, modular display system for diverse neuroscience applications"](https://doi.org/10.1101/2022.08.02.502550), and methods papers are in preparation. Presently, we are working on making the G4 system more easy to replicate, but also work on a new generation. Stay tuned or [get in contact](Contact.md) if you want to know more.

# Repositories

This page includes documentation from the following repositories:

{% for repo in site.data.repos %}

- [{{repo.path}}]({{repo.url}}){% if repo.upstream %} (forked from [this upstream]({{repo.upstream}})) {% endif %}
{% endfor %}

