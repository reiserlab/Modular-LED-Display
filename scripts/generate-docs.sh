#!/usr/bin/env bash
set -e

# Generate documentation from markdown using pandoc
# Usage: generate-docs.sh [docx|pdf|all]

TYPE="${1:-docx}"
DOCS_DIR="$(cd "$(dirname "$0")/../docs" && pwd)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$DOCS_DIR"

# Create temporary about section
ABOUT=$(mktemp)
trap "rm -f $ABOUT" EXIT

GITREV=$(git rev-parse HEAD)
CDATE=$(date --rfc-3339=seconds 2>/dev/null || date -Iseconds)

cat > "$ABOUT" << EOF

# About this document

This document is a hard copy generated from the online documentation at <https://reiserlab.github.io/Modular-LED-Display/>.
Since changes are only done online, this document is unlikely to reflect the latest version of available documentation.
Find the most recent version of the document on the website under *Contact*{:.gui-txt} → *PCB Guidelines*{:.gui-txt}.

This file was generated on $CDATE from git revision [\`$GITREV\`](https://github.com/reiserlab/Modular-LED-Display/tree/$GITREV).

EOF

# Generate documentation based on type
case "$TYPE" in
    docx)
        echo "Generating DOCX documentation..."
        cat guidelines_hardware.md "$ABOUT" | \
            pandoc -o Guidelines-Hardware.docx \
            -F "$REPO_ROOT/_data/kramdownfilter.py" \
            --toc
        echo "✓ Created Guidelines-Hardware.docx"
        ;;
    pdf)
        echo "Generating PDF documentation..."
        cat guidelines_hardware.md "$ABOUT" | \
            pandoc -o Guidelines-Hardware.pdf \
            -F "$REPO_ROOT/_data/kramdownfilter.py" \
            --pdf-engine=lualatex \
            --toc
        echo "✓ Created Guidelines-Hardware.pdf"
        ;;
    all)
        echo "Generating DOCX documentation..."
        cat guidelines_hardware.md "$ABOUT" | \
            pandoc -o Guidelines-Hardware.docx \
            -F "$REPO_ROOT/_data/kramdownfilter.py" \
            --toc
        echo "✓ Created Guidelines-Hardware.docx"

        echo "Generating PDF documentation..."
        cat guidelines_hardware.md "$ABOUT" | \
            pandoc -o Guidelines-Hardware.pdf \
            -F "$REPO_ROOT/_data/kramdownfilter.py" \
            --pdf-engine=lualatex \
            --toc
        echo "✓ Created Guidelines-Hardware.pdf"
        ;;
    *)
        echo "Usage: $0 [docx|pdf|all]"
        exit 1
        ;;
esac
