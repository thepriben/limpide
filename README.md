#### *Limpide*

Effacement des métadonnées EXIF et conversion HEIC → JPEG. Site web et CLI Python.

**Site : [thepriben.github.io/limpide](https://thepriben.github.io/limpide/)**

---

##### About

Limpide propose deux fonctions simples :

- **strip-exif** — retire les métadonnées embarquées dans une image (GPS, appareil, date, etc.) ;
- **convert-heic** — convertit un fichier HEIC/HEIF (iPhone, appareils Apple) en JPEG.

Le site web traite les fichiers **dans le navigateur** : rien n'est envoyé à un serveur, rien n'est stocké. Le code source est public ; le traitement est décrit dans `web/app.js` (canvas pour l'EXIF, `heic2any` pour le HEIC). Une CLI Python reprend les mêmes fonctions pour un usage local ou par lot.

##### Structure

| Composant | Rôle |
|---|---|
| `web/` | Interface sobre, 100 % client-side, déployée sur GitHub Pages |
| `limpide/` | CLI Python (Pillow, pillow-heif) |

##### Site web

Déployé automatiquement sur GitHub Pages à chaque push sur `main`.

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
limpide strip-exif ./dossier/ -d ./sortie/

limpide convert-heic photo.heic
limpide convert-heic ./dossier/ -d ./sortie/
```

##### Tests

```
pip install -e ".[dev]"
pytest
```

##### Licence

Apache-2.0
