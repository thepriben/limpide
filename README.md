#### *Limpide*

Strip EXIF metadata and convert HEIC to JPEG.

**Site: [thepriben.github.io/limpide](https://thepriben.github.io/limpide/)**

---

##### About

**Features**

- `strip-exif` — remove embedded metadata from an image (GPS, camera model, timestamps, etc.)
- `convert-heic` — convert a HEIC/HEIF file to JPEG

**Why open source**

The web app processes files in the browser. There is no upload endpoint, no database, and no server-side storage. Processing is implemented in `web/app.js` (canvas re-encode for EXIF, `heic2any` for HEIC) and can be reviewed directly. A Python CLI in `limpide/` provides the same functions for local or batch use.

##### Structure

| Path | Description |
|---|---|
| `web/` | Client-side UI (GitHub Pages) |
| `limpide/` | Python CLI (Pillow, pillow-heif) |

##### Web app

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
