#### *Limpide*

Strip EXIF metadata and convert HEIC to JPEG. Web app and Python CLI.

**Live site: [thepriben.github.io/limpide](https://thepriben.github.io/limpide/)**

---

##### About

Limpide provides two functions:

- **strip-exif** — remove embedded metadata from an image (GPS, camera model, timestamps, etc.) ;
- **convert-heic** — convert a HEIC/HEIF file (iPhone, Apple devices) to JPEG.

The web app processes files **in the browser**: nothing is uploaded, nothing is stored. Source code is public; processing lives in `web/app.js` (canvas for EXIF, `heic2any` for HEIC). A Python CLI offers the same features for local or batch use.

##### Structure

| Component | Role |
|---|---|
| `web/` | Minimal client-side UI, deployed on GitHub Pages |
| `limpide/` | Python CLI (Pillow, pillow-heif) |

##### Web app

Deployed automatically to GitHub Pages on every push to `main`.

```
python -m http.server 8080 --directory web
```

##### CLI

Python 3.10+

```
pip install -e .
```

```
limpide strip-exif photo.jpg
limpide strip-exif ./folder/ -d ./output/

limpide convert-heic photo.heic
limpide convert-heic ./folder/ -d ./output/
```

##### Tests

```
pip install -e ".[dev]"
pytest
```

##### License

Apache-2.0
