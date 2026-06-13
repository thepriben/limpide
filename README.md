#### *Limpide — photos nettoyées, rien gardé*

Effacement EXIF et conversion HEIC → JPEG, avec une preuve vérifiable : **le site web traite tout dans le navigateur**, sans upload ni stockage. Le code est ouvert — on peut auditer chaque ligne.

---

##### Pourquoi « Limpide » ?

- **Limpide** = transparent (processus auditable) et net (métadonnées retirées) ;
- le site démontre qu'on ne garde rien à aucun point : pas de serveur de traitement, pas de base, pas de fichier temporaire distant.

##### Fonctions

| Outil | Rôle |
|---|---|
| **Site web** (`web/`) | EXIF + HEIC → JPEG, 100 % client-side |
| **CLI** (`limpide`) | Même logique en local, pour scripts et lots |

##### Site web (démo publique)

Ouvrir `web/index.html` ou publier sur GitHub Pages :

```
# depuis la racine du dépôt
python -m http.server 8080 --directory web
# → http://localhost:8080
```

Le traitement est dans `web/app.js` : canvas pour l'EXIF, `heic2any` pour le HEIC. Aucun `fetch` des fichiers utilisateur.

##### CLI

Prérequis : Python 3.10+

```
pip install -e .
```

```
limpide strip-exif photo.jpg
limpide strip-exif ./vacances/ -d ./vacances-clean/

limpide convert-heic IMG_0001.HEIC
limpide convert-heic ./iphone/ -d ./jpeg/
```

##### Tests

```
pip install -e ".[dev]"
pytest
```

##### Licence

Apache-2.0
