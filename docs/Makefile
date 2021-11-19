


ABOUT:=$(shell mktemp -u)
GITREV:=$(shell git rev-parse HEAD)
CDATE:=$(shell date --rfc-3339=seconds)

.PHONY: clean all $(ABOUT)

all: Guidelines-Hardware.docx Guidelines-Hardware.pdf

$(ABOUT):
	@echo "Generating 'About document'"
	@echo ""  >> $@
	@echo "# About this document"  >> $@
	@echo ""  >> $@
	@echo "This document is a hard copy generated from the online documentation at <https://reiserlab.github.io/Modular-LED-Display/>. " >> $@ 
	@echo "Since changes are only done online, this document is unlikely to reflect the latest version of available documentation. " >> $@
	@echo "Find the most recent version of the document on the website under *Contact*{:.gui-txt} → *PCB Guidelines*{:.gui-txt}. " >> $@
	@echo "" >> $@
	@echo "This file was generated on $(CDATE) from git revision [\`$(GITREV)\`](https://github.com/reiserlab/Modular-LED-Display/tree/$(GITREV)). " >> $@
	@echo "" >> $@

# Special rules for generating the Guidelines
Guidelines-Hardware.docx: guidelines-hardware.md $(ABOUT)
	@echo "Generating DOCX"
	@cat guidelines-hardware.md $(ABOUT) | pandoc -o Guidelines-Hardware.docx -F ../assets/kramdownfilter.py --toc

Guidelines-Hardware.pdf: guidelines-hardware.md $(ABOUT)
	@echo "Generating PDF"
	@cat guidelines-hardware.md $(ABOUT) | pandoc -o Guidelines-Hardware.pdf -F ../assets/kramdownfilter.py --pdf-engine=lualatex --toc 

clean:
	rm -f Guidelines-Hardware.docx Guidelines-Hardware.pdf