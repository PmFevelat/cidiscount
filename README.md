# Scraper images Cdiscount (Selenium)

Script Selenium pour:

- Ouvrir la page jardin Cdiscount.
- Détecter les cartes catégories.
- Ouvrir chaque catégorie.
- Scraper les images produits dans l'ordre vertical (haut vers bas).
- Indexer les images pour reproduire le même ordre ailleurs.
- Extraire les infos card produit (nom, prix, remise, avis, livraison quand dispo).

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Exécution de base (non-headless)

```bash
python3 cdiscount_scraper.py
```

Le mode non-headless est utilisé par défaut.

## Options utiles

```bash
python3 cdiscount_scraper.py \
  --max-categories 3 \
  --max-scrolls-per-category 120 \
  --min-scrolls-per-category 8 \
  --scroll-pause 0.7 \
  --debug-scroll \
  --category-filter "piscine|spa" \
  --download-images
```

- `--headless`: active le mode headless (optionnel).
- `--category-filter`: regex pour restreindre les catégories.
- `--download-images`: télécharge les images indexées.
- `--debug-scroll`: affiche les pas de scroll dans le terminal.
- `--min-scrolls-per-category`: force un nombre minimal de scrolls visibles.

## Sorties

Dans le dossier `output/`:

- `categories.json`: catégories détectées.
- `images.json`: images avec index global et index catégorie.
- `images.csv`: export tabulaire, prêt à être réutilisé.
- `downloads/` (si `--download-images`): images nommées par index.

## Remarques

- Le site Cdiscount charge des éléments dynamiquement; le script utilise des attentes explicites + scroll progressif.
- Les images sont triées par position à l'écran (verticale puis horizontale) pour préserver l'ordre visuel.
- Le script gère automatiquement un `chromedriver` compatible avec ta version de Chrome (évite les erreurs de mismatch).
