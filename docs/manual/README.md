# Technical manual

A detailed manual of the whole codebase, written for someone who has never seen it: architecture, layers, data model,
business rules, API reference, UI, end-to-end flow, backups, build and install, how to change the code, and
troubleshooting.

| File                              | Language |
| --------------------------------- | -------- |
| `Eggs_App_Technical_Manual.pdf`   | English  |
| `Eggs_App_Manual_Tecnico.pdf`     | Spanish  |

The PDFs are generated. Edit the HTML in `source/`, never the PDFs.

## Rebuilding the PDFs

```sh
pip install playwright pypdf
python docs/manual/source/build.py        # both languages
python docs/manual/source/build.py en     # only English
```

It prints with Microsoft Edge or Google Chrome if one is installed; otherwise run `python -m playwright install chromium`
once. The version on the cover and in the footer is read from `<Version>` in `Directory.Build.props`.

## Source layout

- `source/es/` and `source/en/`: one HTML file per part (`p00_head.html` has the styles and the cover, then one file per
  chapter or group of chapters), joined in name order. Both languages have the same structure; change both together.
- Chapters are `<h1 class="chapter" id="c…">` and sections `<h2 id="c…-…">`; they make the table of contents, with
  page numbers found by rendering twice.
- Diagrams are inline SVG.

## Keeping it current

When a change alters what the manual describes (a rule, an endpoint, a screen, the build or install steps), update the
matching chapter in both languages and rebuild in the same pull request. The manual describes version 1.3.0 unless a
later change updated it.
