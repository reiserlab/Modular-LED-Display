---
title: Guidelines
nav_order: 98
---

# Documentation guidelines


The intention of this page is to communicate. The headers, text, and images follow standard layout conventions. Important parts like **notes** or **warnings** are highlighted by **bold** text. Monospaced font with gray background is used for code snippets and file paths. For example, `clear; disp("Hello World");` would be code and `/home/reiserlab/Documents` or `C:\Users\Reiserlab\Documents\` would describe directories.

When we describe the interaction with graphical user interfaces (GUI), we use a gray background with colored text for any element that should be shown on the screen. For example, *Refresh Rate: 1000Hz*{:.gui-txt} means, that we refer to the text "Refresh Rate: 1000Hz" shown on a GUI. If we talk about button that can be clicked, then *OK*{:.gui-btn} would be an example for a confirmation button.


## How is the page created?

All documentation you see on this page is generate from markdown documents. Markdown is a simple text based way of structuring text documents. This means, you can read these markdown documents in any text editor or on github without additional software. The markup should be intuitive and not distract you from reading, for example if you want to *emphasize* a word, you just put an asterisk before and after the word like so: \*emphasize\*. If you want to make it **bold**, put two asterisk. That is unintrusive and potentially even intuitive. 

The advantage besides easily generating websites from it is, that it reduces the software stack required to read and write documentation. What this means: If you spot an error, you can also directly edit (for example) [this file]({{ site.github. repository_url }}/edit/master/Guidelines.md) on github or use [many other ways](Contact) to make us aware of your suggestion.

## Basic elements

The markdown documents are parsed into the simple, but hopefully functional layout of this webpage. The following example of a markdown generates headers, links, and images:

```markdown
# Header Level 1

This is some text with a [link to the Reiser Lab website](https://www.janelia.org/lab/reiser-lab).

## Header Level 2

1. markdown is easy to read, even if not parsed
2. for example, this is an ordered list
3. followed by an image: 

![A modular display system for insect behavioral neuroscience](assets/Reiser2008.png)

```

This page uses [kramdown](https://kramdown.gettalong.org/) to generate html from the markdown files. If you have any more exciting ideas how to format your text, for example using tables, syntax highlighting for code blocks, or blockquotes, then have a look at [kramdown's excellent documentation](https://kramdown.gettalong.org/syntax.html) – or just let us know what you want to do.

# You repo on this page

If you want your git repository included in the page, then please [get in contact](Contact). We could then discuss which menu item would be best fitting your code, hardware, or documentation. Here are some hints on how to prepare your documentation for this page. In this documentation we use the following terms:

- **Repository**: This is where your code and documentation lives. The repository can be owned by anyone, we don't need special access to a repository to integrated the documentation into the *Panel Site*.
- **Panel Site** or **this site** or **panel website**: The website that lives at <https://floesche.github.io/Panel>. This is the generated output of the *Panel Repository*.
- **Panel Repository**: The github repository <https://github.com/floesche/Panel> from which the *Panel Site* is generated. It contains links to other repositories (currently {{site.data.repos | size}} different ones)

The workflow of publishing documentation on the *Panel Site* is as follows: 
1. Write down documentation and store it in a repository.
2. We need to integrate your *repository* once into the *Panel Repository*. 
3. Whenever documentation in any of the linked repositories is updated, we can publish a new *Panel Site* from it.

## File and file location in repositories

The documentation needs to be written in Markdown (or HTML, but here we focus on Markdown). Once a repository is integrated into the *Panel Repository*, html files for the *Panel Site* are generated jekyll as part of the github pages system. Markdown is easy to write and read without any special software.

The Markdown files can be stored anywhere in your repository, wherever you prefer your documentation to be. During the publishing process of the *Panel Site*, jekyll will discover any text file with the file extension `.md` and integrate it into the *site*. Nevertheless, a good practice is to have a dedicated documentation path inside your project, for example `./docs`. Following that suggestion, or at least having a limited number of directories with documentation, will also allow us to make the publishing process faster and less error prone by explicitely excluding other paths, for example with code and binary files, from the website. 

Any text file with the extension `.md` will generate some kind of output. To make it look pretty and if you want to use images, links, and code blocks, refer to the Markdown documenttion on the [kramdown website](https://kramdown.gettalong.org/syntax.html). The integration into the navigation of the *Panel Website* is achieved through additional element called Front Matter.

**Front matter** is a part at the beginning of the Markdown file separated from the rest by `---`. The front matter itself follows a YAML syntax, which in this case basically means a key-value pair separated by a <kbd>:</kbd>+<kbd>SPACE</kbd>. For the *Panel Repository* the front matter is used to describe how the page is represented in the navigation menu. Here an example:

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

In this case, a the page will have the name *How-to Guide* in the menu. It will be a submenu item of the *Software* menu item, a submenu item of *Generation 3* itself. All sibling menu items will be in ascending order of the value assigned to `nav_order`. If `has_children` is specified and set to `true`, then this page can have child pages as well. In this case, a child would need to specify `parent: How-to Guide` and `grand_parent: Software`.

File names can be different from titles in the menu, and the physical location of a file can also be different from where it is shown in the menu. If you want to explude a certain file from the *Panel Site*, for example LICENSE or README files that are intended for the github repository page, but not for the *Panel Site*, you can specify `nav_exclude: true` and jekyll will ignore this file. The current website is built with these six different YAML items in the front matter. You don't need to specify all of them all the time, just use the ones that are useful.

## Special Layout

We accept some non-standard syntax for the Markdown files to have influence on the *Panel Site* layout. Most of the following tricks build on the kramdown syntax `{:}` for adding arguments to an html element:

If you want an image to only span part of the page and to float on the right side of the text, you could specify something like this:

```markdown

![alternate text](assets/my-image.png){: width="30%" .float-right}

This is some text that will be shown on the left side of the image. 

# Next header{:.clear}

The above header will not float anymore.
```

In the example above, a `width="30%"` argument will be added to the html `<img>` tag. Also, `.float-right` technically adds the class to the image that lets the image float on the right side. Adding the class `{:.clear}` to a following element ends the float (at the latest) by that element.

Two additional classes `gui-txt` and `gui-btn` are currently used to highlight text as something printed on a (MATLAB) GUI, or as something clickable like a button or menu. For example:

```markdown
Once you click *OK*{:.gui-btn}, you will see the *X: 25ms*{:.gui-txt} in the main window
```

The above markdown will look like this on the *Panel Site*: Once you click *OK*{:.gui-btn}, you will see the *X: 25ms*{:.gui-txt} in the main window