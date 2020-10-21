#!/usr/bin/env python
from pandocfilters import toJSONFilter
import re

inkramdownattribute = False

def kramdown(k, v, fmt, meta):
    global inkramdownattribute
    if k == 'Str':
        if re.search("\{:", v):
            inkramdownattribute = True
        if inkramdownattribute and re.search("\}", v):
            inkramdownattribute = False
            return []
    if inkramdownattribute:
        return []

if __name__ == "__main__":
    toJSONFilter(kramdown)