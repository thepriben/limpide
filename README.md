#### *Limpide*

View EXIF metadata, strip it from images, and convert HEIC to JPEG.

**Site: [thepriben.github.io/limpide](https://thepriben.github.io/limpide/)**

---

##### About

Limpide is a small, open-source toolkit for image metadata and format conversion.

**Web app** (browser, no upload)

- **View EXIF** — inspect embedded metadata (camera, GPS, dates, etc.)
- **Strip EXIF** — remove camera EXIF, GPS, ICC color profile, and JFIF metadata
- **HEIC to JPEG** — convert Apple HEIC/HEIF files

Processing runs entirely in the browser. There is no upload endpoint, no database, and no server-side storage. The logic lives in `web/app.js` and can be reviewed directly.

**CLI** (Python, local or batch)

- `strip-exif` — remove EXIF from JPEG, PNG, WebP, TIFF
- `convert-heic` — convert HEIC/HEIF to JPEG

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
