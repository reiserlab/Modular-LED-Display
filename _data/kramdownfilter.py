#!/usr/bin/env python
import re

from pandocfilters import toJSONFilter

# simple pandoc filter that removes attributes defined in kramdown style (eg {:.class})

inkramdownattribute = False


def kramdown(k, v, fmt, meta):
    global inkramdownattribute
    if k == "Str":
        if re.search(r"\{:", v):
            inkramdownattribute = True
        if inkramdownattribute and re.search(r"\}", v):
            inkramdownattribute = False
            return []
    if inkramdownattribute:
        return []


if __name__ == "__main__":
    toJSONFilter(kramdown)
