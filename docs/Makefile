
.PHONY: clean

# Special rules for generating the Guidelines
Guidelines-Hardware.docx: Guidelines-Hardware.md
	pandoc -o Guidelines-Hardware.docx -F ../assets/kramdownfilter.py --toc  Guidelines-Hardware.md 

Guidelines-Hardware.pdf: Guidelines-Hardware.md
	pandoc -o Guidelines-Hardware.pdf -F ../assets/kramdownfilter.py --pdf-engine=lualatex --toc  Guidelines-Hardware.md

clean:
	rm -f Guidelines-Hardware.docx Guidelines-Hardware.pdf