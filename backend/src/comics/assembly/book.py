#!/usr/bin/env python3
"""Final book generation for ComicsGen (PDF + EPUB).

Invoked as a child process:  python3 book.py <spec.json>

CBZ is produced in Node (zip of page PNGs); this script handles the formats that
rely on Python libraries: PDF (img2pdf, no quality recompression) and EPUB3
fixed-layout (ebooklib, one page per spine item).

spec.json schema:
{
  "images": ["/abs/001.png", "/abs/002.png", ...],   # ordered by prancha.number
  "title": "Fé Pública",
  "language": "pt-BR",
  "outputPdf": "/abs/output/book.pdf",    # optional
  "outputEpub": "/abs/output/book.epub"   # optional
}
"""
import json
import sys


def make_pdf(images, output_pdf):
    import img2pdf

    with open(output_pdf, "wb") as f:
        f.write(img2pdf.convert(images))


def make_epub(images, title, language, output_epub):
    from ebooklib import epub
    from PIL import Image

    book = epub.EpubBook()
    book.set_identifier("comicsgen-%s" % title)
    book.set_title(title)
    book.set_language(language or "en")
    # Fixed-layout (pre-paginated) rendition.
    book.add_metadata(None, "meta", "pre-paginated", {"property": "rendition:layout"})
    book.add_metadata(None, "meta", "auto", {"property": "rendition:orientation"})
    book.add_metadata(None, "meta", "both", {"property": "rendition:spread"})

    pages = []
    for i, path in enumerate(images):
        with Image.open(path) as im:
            w, h = im.size
        with open(path, "rb") as fh:
            data = fh.read()
        img_name = "images/%03d.png" % i
        book.add_item(
            epub.EpubItem(
                uid="img%03d" % i,
                file_name=img_name,
                media_type="image/png",
                content=data,
            )
        )
        page = epub.EpubHtml(uid="page%03d" % i, file_name="page%03d.xhtml" % i, lang=language)
        page.content = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml">\n'
            "<head><title>%d</title>"
            '<meta name="viewport" content="width=%d, height=%d"/>'
            "</head>\n"
            '<body style="margin:0;padding:0">'
            '<img src="%s" style="width:100%%;height:100%%" alt="page %d"/>'
            "</body></html>" % (i + 1, w, h, img_name, i + 1)
        )
        book.add_item(page)
        pages.append(page)

    book.add_item(epub.EpubNcx())
    nav = epub.EpubNav()
    book.add_item(nav)
    book.spine = pages
    book.toc = tuple(pages)
    epub.write_epub(output_epub, book)


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    images = spec["images"]
    title = spec.get("title", "Untitled")
    language = spec.get("language", "en")
    done = []
    if spec.get("outputPdf"):
        make_pdf(images, spec["outputPdf"])
        done.append("pdf")
    if spec.get("outputEpub"):
        make_epub(images, title, language, spec["outputEpub"])
        done.append("epub")
    print(json.dumps({"ok": True, "generated": done}))


if __name__ == "__main__":
    main()
