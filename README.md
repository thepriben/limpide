#### *Photo Privacy : effacement EXIF et conversion HEIC*

Outil en ligne de commande pour retirer les métadonnées EXIF des photos et convertir les fichiers HEIC/HEIF (iPhone, appareils Apple) vers JPEG.

---

##### Fonctions

- `strip-exif` : réencode une image sans conserver les métadonnées EXIF (JPEG, PNG, WebP, TIFF) ;
- `convert-heic` : convertit HEIC/HEIF vers JPEG.

##### Prérequis

- Python 3.10+

##### Installation

```
pip install -e .
```

##### Exemples

Supprimer les EXIF d'une photo :

```
photo-privacy strip-exif photo.jpg
photo-privacy strip-exif photo.jpg -o photo-sans-exif.jpg
photo-privacy strip-exif ./vacances/ -d ./vacances-clean/
```

Convertir un HEIC en JPEG :

```
photo-privacy convert-heic IMG_0001.HEIC
photo-privacy convert-heic IMG_0001.HEIC -o IMG_0001.jpg
photo-privacy convert-heic ./iphone/ -d ./jpeg/
```

Sans installation, via le module :

```
python -m photo_privacy strip-exif photo.jpg
python -m photo_privacy convert-heic photo.heic
```

##### Tests

```
pip install -e ".[dev]"
pytest
```

##### Licence

Apache-2.0
