"""Finalize an existing scraped snapshot with a redesign CSV.

Step 1 (scrape) can run without a redesign CSV and produces:
  - original.html
  - images.csv (downloaded by user, edited externally)

Step 2 (finalize) applies the user-provided CSV to original.html to produce
redesign.html and marks the project as ready in meta.json.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from scraper.apply_csv_redesign import apply_csv_to_snapshot


DEFAULT_FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Applique un CSV avant/après à un snapshot existant "
            "(frontend/public/snapshots/<slug>) et marque le projet prêt."
        )
    )
    parser.add_argument(
        "--slug",
        required=True,
        help="Identifiant du projet (dossier sous frontend/public/snapshots/).",
    )
    parser.add_argument(
        "--csv",
        required=True,
        help=(
            "Chemin vers le CSV de mapping "
            "(former_image_url, new_image_url)."
        ),
    )
    parser.add_argument(
        "--frontend-dir",
        default=str(DEFAULT_FRONTEND),
        help="Chemin vers le dossier frontend/ (par défaut: repo/frontend).",
    )
    return parser.parse_args()


def _count_csv_pairs(csv_path: Path) -> int:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        out = 0
        for row in reader:
            original = (
                (row.get("former_image_url") or "").strip()
                or (row.get("original_image_url") or "").strip()
                or (row.get("former_media_url") or "").strip()
                or (row.get("original_media_url") or "").strip()
                or (row.get("former_video_url") or "").strip()
                or (row.get("original_video_url") or "").strip()
            )
            processed = (
                (row.get("new_image_url") or "").strip()
                or (row.get("processed_image_url") or "").strip()
                or (row.get("new_media_url") or "").strip()
                or (row.get("processed_media_url") or "").strip()
                or (row.get("new_video_url") or "").strip()
                or (row.get("processed_video_url") or "").strip()
            )
            if original and processed:
                out += 1
        return out


def finalize_project(slug: str, csv_path: Path, frontend_dir: Path) -> dict:
    frontend_dir = frontend_dir.resolve()
    project_dir = frontend_dir / "public" / "snapshots" / slug
    if not project_dir.exists():
        raise FileNotFoundError(f"Projet introuvable: {project_dir}")

    original_html = project_dir / "original.html"
    redesign_html = project_dir / "redesign.html"
    meta_path = project_dir / "meta.json"
    if not original_html.exists():
        raise FileNotFoundError(f"Snapshot manquant: {original_html}")
    if not meta_path.exists():
        raise FileNotFoundError(f"Meta manquant: {meta_path}")

    print(f"[FINALIZE] Projet: {slug}")
    print(f"[FINALIZE] CSV: {csv_path}")
    apply_csv_to_snapshot(
        original_html_path=original_html,
        csv_path=csv_path,
        output_html_path=redesign_html,
    )
    pairs = _count_csv_pairs(csv_path)

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    if not meta.get("created_at"):
        meta["created_at"] = now
    meta.update(
        {
            "has_redesign": True,
            "csv_pairs": pairs,
            "status": "ready",
            "finalized_at": now,
        }
    )
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[FINALIZE] Redesign: {redesign_html}")
    print(f"[FINALIZE] Meta: {meta_path}")
    print(f"[FINALIZE] Paires CSV: {pairs}")
    print("\n=== Finalisation terminée ===")
    return meta


def main() -> None:
    args = parse_args()
    finalize_project(
        slug=args.slug,
        csv_path=Path(args.csv).expanduser().resolve(),
        frontend_dir=Path(args.frontend_dir),
    )


if __name__ == "__main__":
    main()
