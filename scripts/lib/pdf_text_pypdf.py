#!/usr/bin/env python3
"""Extract one PDF page per JSON array element. strict=False tolerates broken XRef (pypdf)."""
import json
import sys
import warnings

warnings.filterwarnings("ignore")

try:
    from pypdf import PdfReader
except ImportError:
    sys.stderr.write("pypdf required: pip3 install --user pypdf\n")
    sys.exit(2)


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: pdf_text_pypdf.py <file.pdf>"}))
        sys.exit(1)
    path = sys.argv[1]
    reader = PdfReader(path, strict=False)
    pages = [(page.extract_text() or "") for page in reader.pages]
    json.dump(pages, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
