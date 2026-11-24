"""Builds the technical manual PDFs from the HTML in source/es and source/en.

    python docs/manual/source/build.py          # both languages
    python docs/manual/source/build.py en       # only English

Needs Python 3.10+ and:  pip install playwright pypdf
It prints with Microsoft Edge or Google Chrome if one is installed; otherwise run once:
    python -m playwright install chromium

The PDFs are written to docs/manual/. The version on the cover and in the footer comes from
<Version> in Directory.Build.props. Each part file (p00_head.html, p01_intro.html, ...) is joined in
name order; chapters are <h1 class="chapter" id="..."> and sections <h2 id="...">, which build the
table of contents. Pages are found by rendering once, then the PDF is rendered again with page numbers.
"""

import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from pypdf import PdfReader

SOURCE = Path(__file__).resolve().parent
MANUAL = SOURCE.parent
REPO = MANUAL.parent.parent

LANGUAGES = {
    "es": {"file": "Eggs_App_Manual_Tecnico.pdf", "chapter": "Capítulo", "contents": "Contenido",
           "footer": "Eggs App — Manual técnico"},
    "en": {"file": "Eggs_App_Technical_Manual.pdf", "chapter": "Chapter", "contents": "Contents",
           "footer": "Eggs App — Technical Manual"},
}


def read_version() -> str:
    props = (REPO / "Directory.Build.props").read_text(encoding="utf-8")
    match = re.search(r"<Version>([^<]+)</Version>", props)
    return match.group(1).strip() if match else "?"


def toc_entries(html: str, chapter_word: str):
    entries = []
    for level, hid, inner in re.findall(r'<h([12])[^>]*id="([^"]+)"[^>]*>(.*?)</h\1>', html, re.S):
        number = re.search(rf'<span class="num">{chapter_word} (\d+)</span>', inner)
        text = re.sub(r'<span class="num">.*?</span>', "", inner)
        text = re.sub(r"<[^>]+>", "", text).strip()
        entries.append((level, hid, (f"{number.group(1)}. " if number else "") + text))
    return entries


def toc_html(entries, pages, title):
    items = "".join(
        f'<li class="{"ch" if level == "1" else "sec"}"><span>{text}</span><span class="dots"></span>'
        f'<span class="pg">{pages.get(hid, "00")}</span></li>'
        for level, hid, text in entries)
    return f'<section class="toc"><h1>{title}</h1><ol>{items}</ol></section>'


def find_pages(pdf_path: Path, entries, chapter_word: str):
    # Letters and digits only: PDF text extraction is loose with spaces and punctuation.
    def squash(text):
        return re.sub(r"\W+", "", text).lower()

    pages_text = [squash(page.extract_text() or "") for page in PdfReader(pdf_path).pages]
    first_chapter = squash(f"{chapter_word} 1")
    start = next(i for i, text in enumerate(pages_text) if first_chapter in text and i > 1)
    found, current = {}, start
    for _, hid, text in entries:
        key = squash(re.sub(r"^\d+\. ", "", text))[:24]
        for i in range(current, len(pages_text)):
            if key in pages_text[i]:
                found[hid], current = i + 1, i
                break
    return found


async def launch(playwright):
    for channel in ("msedge", "chrome"):
        try:
            return await playwright.chromium.launch(channel=channel)
        except Exception:
            pass
    return await playwright.chromium.launch()


async def render(browser, html: str, out: Path, footer: str):
    page = await browser.new_page()
    await page.set_content(html, wait_until="load")
    await page.pdf(
        path=str(out), prefer_css_page_size=True, print_background=True, display_header_footer=True,
        header_template="<div></div>",
        footer_template=(
            '<div style="font-family:Inter,Segoe UI,sans-serif;font-size:8px;color:#6e788c;width:100%;'
            'padding:0 20mm;display:flex;justify-content:space-between">'
            f'<span>{footer}</span><span class="pageNumber"></span></div>'),
        outline=True, tagged=True)
    await page.close()


async def build(language: str, browser, version: str):
    settings = LANGUAGES[language]
    parts = sorted((SOURCE / language).glob("p*.html"))
    html = "".join(part.read_text(encoding="utf-8") for part in parts).replace("{{VERSION}}", version)
    entries = toc_entries(html, settings["chapter"])
    footer = f'{settings["footer"]} · v{version}'
    out = MANUAL / settings["file"]
    draft = MANUAL / f".draft-{language}.pdf"

    await render(browser, html.replace("<!--TOC-->", toc_html(entries, {}, settings["contents"])), draft, footer)
    pages = find_pages(draft, entries, settings["chapter"])
    draft.unlink()

    missing = [hid for _, hid, _ in entries if hid not in pages]
    if missing:
        print(f"[{language}] warning: no page found for {', '.join(missing)}")

    await render(browser, html.replace("<!--TOC-->", toc_html(entries, pages, settings["contents"])), out, footer)
    print(f"[{language}] {out} ({len(PdfReader(out).pages)} pages)")


async def main():
    wanted = sys.argv[1:] or list(LANGUAGES)
    version = read_version()
    async with async_playwright() as playwright:
        browser = await launch(playwright)
        for language in wanted:
            await build(language, browser, version)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
