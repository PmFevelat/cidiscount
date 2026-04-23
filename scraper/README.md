# Scraper générique — snapshot + redesign

Capture une page catalogue, produit un snapshot HTML fidèle, extrait les
images dans l'ordre vertical, et applique un CSV `avant/après` pour
remplacer les URLs d'images.

## Installation

Depuis la racine du repo :

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Pipeline complet

```bash
source .venv/bin/activate
python3 -m scraper.pipeline \
  --url "https://fr.shopping.rakuten.com/nav/jardin_piscine-spa/f2/piscine-gonflable" \
  --csv "/chemin/vers/avant_apres.csv" \
  --slug rakuten-piscine-gonflable
```

Sorties dans `frontend/public/snapshots/<slug>/` :

- `original.html` — HTML rendu de la page, images résolues, scripts retirés, `<base href>` injecté
- `redesign.html` — même HTML, URLs d'images remplacées d'après le CSV
- `images.csv` / `images.json` — liste ordonnée des images (top → bottom)
- `meta.json` — titre, dimensions du document, nombre d'images

## Scraper seul (sans redesign)

```bash
python3 -m scraper.pipeline --url "https://..." --slug mon-snapshot
```

## Formats CSV

```csv
order,former_image_url,new_image_url
1,https://site.com/img/abc.jpg,
2,https://site.com/img/def.jpg,
...
```

Le CSV produit après scraping contient `new_image_url` vide (à remplir plus
tard). Pour la finalisation, le CSV attendu est le même format, avec la
colonne `new_image_url` complétée.

Compatibilité conservée : l'ancien format
`original_image_url,processed_image_url` fonctionne toujours.

## Pourquoi cette approche ?

- **Fidélité visuelle** : on garde le CSS/fonts du site via `<base href>`.
  L'iframe rend le HTML exactement comme le navigateur l'a vu.
- **Isolation** : les iframes isolent le CSS du site capturé de celui du
  frontend Next.js — aucune collision possible.
- **Slider inchangé** : `BeforeAfterSlider` clip deux iframes au lieu de deux
  sous-arbres React, avec la même mécanique de `clip-path`.
- **Remplacement robuste** : fait sur le HTML brut au moment de la capture,
  pas au runtime. Pas de re-rendering JS qui annule nos changements.
