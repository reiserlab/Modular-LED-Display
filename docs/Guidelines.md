---
title: Guidelines
parent: Contact
nav_order: 98
---

# Documentation guidelines

Layout and form are secondary aspects of this page whose primary goal is to bundle existing documentation in one place. Still, we are grateful for [any hints on how to improve any aspect of it](../Contact.md). The headers, text, and images follow standard layout conventions. Important parts like **notes** or **warnings** are highlighted by **bold** text. Monospaced font with a gray background is used for code snippets and file paths. For example, `clear; disp("Hello World");` would be code and `/home/reiserlab/Documents` or `C:\Users\Reiserlab\Documents\` would describe directories.

When we describe the interaction with graphical user interfaces (GUI), we use a gray background with colored text for any element shown on the screen. For example, *Refresh Rate: 1000Hz*{:.gui-txt} means that we refer to the text "Refresh Rate: 1000Hz" displayed on a GUI. If we write about clickable buttons, then *OK*{:.gui-btn} would be an example for a confirmation button.


## How is the page created?

All documentation you see on this page is generated from Markdown documents. Markdown is a simple text-based way of structuring text documents. This means you can read these Markdown documents in any text editor or on GitHub without additional software. The markup should be intuitive and not distract you from reading, for example, if you want to *emphasize* a word, you just put an asterisk before and after the word like so: \**emphasize*\*. If you want to make it **bold**, put two asterisks: \*\***bold**\*\*. That is unintrusive and potentially even intuitive. 

The advantage besides easily generating websites from it is that it reduces the software stack required to read and write documentation. What this means: If you spot an error, you can also directly edit (for example) [this file]({{ site.github. repository_url }}/edit/master/docs/Guidelines.md) on GitHub or use [many other ways](../Contact) to make us aware of your suggestion.

## Basic elements

The Markdown documents are parsed into the simple, but hopefully functional layout of this webpage. The following example of a Markdown generates headers, links, and images:

```markdown
# Header Level 1

This is some text with a [link to the Reiser Lab website](https://www.janelia.org/lab/reiser-lab).

## Header Level 2

1. Markdown is easy to read, even if not parsed
2. for example, this is an ordered list
3. followed by an image: 

![A modular display system for insect behavioral neuroscience](assets/Reiser2008.png)

```

This page uses [kramdown](https://kramdown.gettalong.org/) to generate HTML from the Markdown files. If you have any more exciting ideas on how to format your text, for example using tables, syntax highlighting for code blocks, or blockquotes, then have a look at [kramdown's excellent documentation](https://kramdown.gettalong.org/syntax.html) – or just let us know what you want to do.

# Your repo on this page

If you want your git repository included in the page, then please [get in contact](../Contact). We could then discuss which menu item would be best fitting your code, hardware, or documentation. Here are some hints on how to prepare your documentation for this page. In this documentation, we use the following terms:

- **Repository**: This is where your code and documentation lives. The repository can be owned by anyone; we don't need special access to a repository to integrated the documentation into the *Display Site*.
- **Display Site** or **this site** or **display website**: The website that lives at <https://reiserlab.github.io/Modular-LED-Display>. This is the generated output of the *Display Repository*.
- **Display Repository**: The GitHub repository <https://github.com/reiserlab/Modular-LED-Display> from which the *Display Site* is generated. It contains links to other repositories (currently {{site.data.repos | size}} different ones)

The workflow of publishing documentation on the *Display Site* is as follows: 
1. Write down documentation and store it in a repository.
2. We need to integrate your *repository* once into the *Display Repository*. 
3. Whenever documentation in any of the linked repositories is updated, we can publish a new *Display Site* from it.

## File and file location in repositories

The documentation needs to be written in Markdown (or HTML, but here we focus on Markdown). Once a repository is integrated into the *Display Repository*, HTML files for the *Display Site* are generated by [Jekyll](https://jekyllrb.com/) as part of the [GitHub pages](https://pages.github.com/) system. Markdown is easy to write and read without any special software.

The Markdown files can be stored anywhere in your repository, wherever you prefer your documentation to be. During the *Display Site* publishing process, Jekyll will discover any text file with the file extension `.md` and integrate it into the *site*. Nevertheless, a good practice is to have a dedicated documentation path inside your project, for example `./docs`. Images and other binary files could be located in `./assets` (also see the [suggestion](#example-project) further down on this page). Following that suggestion, or at least having a limited number of directories with documentation, will also allow us to make the publishing process faster and less error-prone by explicitly excluding other paths, for example, with code and binary files, from the website. 

Any text file with the extension `.md` will generate some kind of output. To make it look pretty and to use images, links, and code blocks, refer to the Markdown documentation on the [kramdown website](https://kramdown.gettalong.org/syntax.html). The integration into the navigation of the *Display Website* is achieved through a prepended section called Frontmatter.

**Frontmatter** is a part at the beginning of the Markdown file separated from the rest by `---`. The frontmatter itself follows a YAML syntax, which in this case, basically means a key-value pair separated by a <kbd>:</kbd>+<kbd>SPACE</kbd>. For the *Display Repository*, the frontmatter is used to describe how the page is represented in the navigation menu. Here an example:

```markdown
---
title: How-to Guide
parent: Software
grand_parent: Generation 3
has_children: true
nav_order: 2
---

# Generation 3 Software

Here comes some text.
```

In this case, the page will have the name *How-to Guide* on the menu. It will be a submenu item of the *Software* menu item, a submenu item of *Generation 3* itself. All sibling menu items will be in ascending order of the value assigned to `nav_order`. If `has_children` is specified and set to `true`, then this page can have child pages as well. In this case, a child would need to specify `parent: How-to Guide` and `grand_parent: Software`.

File names can be different from titles on the menu, and the physical location of a file can also be different from where it is shown in the menu. Suppose you want to exclude a specific file from the *Display Site*, for example, LICENSE or README files that are intended for the GitHub repository page, but not for the *Display Site*. In that case, you can specify `nav_exclude: true` and Jekyll will ignore this file. The current website is built with these six different YAML items in the frontmatter. You don't need to specify all of them all the time, just use the useful ones.

## Special Layout

We accept some non-standard syntax for the Markdown files to influence the *Display Site* layout. Most of the following tricks build on the kramdown syntax `{:}` for adding arguments to an HTML element:

If you want an image only to span part of the page and float on the right side of the text, you could specify something like this:

```markdown
![alternate text](assets/my-image.png){: width="30%" .float-right}

This is some text that will be shown on the left side of the image.

# Next header{:.clear}

![alternate text](assetss/my-image.png){:.ifr .pop}

The above header will not float anymore. Consequently the second image
is never shown floating besides the first one.

The `.ifr` class lets the image float at the right with 30% width 
and `.pop` allows a click to zoom in.
```

In the example above, a `width="30%"` argument will be added to the HTML `<img>` tag. Also, `.float-right` technically adds the class to the image that lets the image float on the right side. Adding the class `{:.clear}` to a following element ends the float (at the latest) by that element. The shorthand class name `.ifr` positions an image floating on the right and with a maximum width of 30% of the text width. Also, the class `.pop` allows the user of the website to click on the image to see a zoomed version.

Two additional classes `gui-txt` and `gui-btn` are currently used to highlight text as something printed on a (MATLAB) GUI, or as something clickable like a button or menu. For example:

```markdown
Once you click *OK*{:.gui-btn}, you will see the *X: 25ms*{:.gui-txt} in the main window
```

The above Markdown will look like this on the *Display Site*: Once you click *OK*{:.gui-btn}, you will see the *X: 25ms*{:.gui-txt} in the main window

# Hacks and tips

## Markdown files only on GitHub, not on display site

Files with the extension `.mdown` are ignored by Jekyll for the generation of the *Display Site* but are rendered correctly as Markdown by GitHub. Therefore, instead of specifying the frontmatter with `nav_exclude: true` inside `README.md`, which might generate unwanted output on the GitHub repository, the file `README.mdown` will look good on the GitHub repository but be ignored on the *Display Site*. 

## Example project

An example project structure, based on [Good enough practices in scientific computing](https://doi.org/10.1371/journal.pcbi.1005510) and constraints of the current documentation process, could follow this directory setup:

```
├── assets
│   ├── example-plot.png
│   ├── example-report.pdf
│   └── screenshot-main-gui.png
├── data
├── docs
│   ├── getting-started.md
│   ├── index.md
│   ├── technical-guide.md
│   └── user-guide.md
├── src
│   ├── 01_your.m
│   ├── 02_source.m
│   └── 03_code.m
├── LICENSE.mdown
└── README.mdown
```

In this case, the license and readme file would be visible on the GitHub project, but not be part of the *Display Site*. All the documentation would live inside `./docs` as `*.md` files with supporting binary files in the `./assets` folder. `source`, `data`, and any other additional directories could easily be excluded from being published on the *Display Site*.