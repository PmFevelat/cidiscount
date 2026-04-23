"""Export CSV ordonné d'une catégorie pour retouche batch (background, ombres...).

Usage:
    python export_category_csv.py
    python export_category_csv.py --category "piscine et spa" --out output/piscine_spa_ordered.csv
    python export_category_csv.py --download  # télécharge aussi les images
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlretrieve


def slugify(value: str, max_len: int = 60) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:max_len] or "produit"


def suggested_filename(order: int, image_url: str, product_name: str) -> str:
    suffix = Path(urlparse(image_url).path).suffix or ".jpg"
    return f"{order:03d}_{slugify(product_name)}{suffix}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Exporte un CSV ordonné (haut->bas) pour une catégorie."
    )
    parser.add_argument(
        "--input",
        default="output/images.json",
        help="Fichier JSON produit par le scraper.",
    )
    parser.add_argument(
        "--category",
        default="piscine et spa",
        help="Nom exact de la catégorie à exporter (ex: 'piscine et spa').",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Chemin CSV de sortie (par défaut: output/<slug>_ordered.csv).",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Télécharge aussi les images dans output/export/<slug>/.",
    )
    parser.add_argument(
        "--download-dir",
        default=None,
        help="Dossier de téléchargement (par défaut: output/export/<slug>/).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).resolve()
    if not input_path.exists():
        raise SystemExit(f"Fichier introuvable: {input_path}")

    data = json.loads(input_path.read_text(encoding="utf-8"))

    target_category = args.category.strip().lower()
    records = [
        r for r in data
        if r.get("category_name", "").strip().lower() == target_category
    ]
    if not records:
        available = sorted({r.get("category_name", "") for r in data})
        raise SystemExit(
            f"Aucun enregistrement pour '{args.category}'. "
            f"Catégories disponibles: {available}"
        )

    # L'ordre haut -> bas suit image_index_in_category (déjà trié par top/left).
    records.sort(key=lambda r: r.get("image_index_in_category", 0))

    slug = slugify(args.category)
    out_path = Path(args.out) if args.out else Path(f"output/{slug}_ordered.csv")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    download_dir: Path | None = None
    if args.download:
        download_dir = (
            Path(args.download_dir)
            if args.download_dir
            else Path(f"output/export/{slug}")
        )
        download_dir.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "order",
        "filename",
        "local_path",
        "image_url",
        "product_name",
        "current_price",
        "old_price",
        "rating",
        "review_count",
        "product_url",
        "category_name",
    ]

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for order, record in enumerate(records, start=1):
            filename = suggested_filename(
                order=order,
                image_url=record.get("image_url", ""),
                product_name=record.get("product_name", f"produit-{order}"),
            )

            local_path = ""
            if download_dir is not None:
                target = download_dir / filename
                if not target.exists():
                    try:
                        urlretrieve(record["image_url"], target)
                        time.sleep(0.02)
                    except Exception as exc:
                        print(f"[WARN] Download failed pour {filename}: {exc}")
                        target = None
                if target is not None and target.exists():
                    local_path = str(target)

            writer.writerow(
                {
                    "order": f"{order:03d}",
                    "filename": filename,
                    "local_path": local_path,
                    "image_url": record.get("image_url", ""),
                    "product_name": record.get("product_name", ""),
                    "current_price": record.get("current_price", ""),
                    "old_price": record.get("old_price", ""),
                    "rating": record.get("rating", ""),
                    "review_count": record.get("review_count", ""),
                    "product_url": record.get("product_url", ""),
                    "category_name": record.get("category_name", ""),
                }
            )

    print(f"[OK] {len(records)} lignes écrites dans {out_path}")
    if download_dir is not None:
        print(f"[OK] Images téléchargées dans {download_dir}")


if __name__ == "__main__":
    main()
