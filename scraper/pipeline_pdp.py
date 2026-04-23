"""Two-step PDP pipeline:
1) scrape PDP and export CSV template
2) finalize later with CSV via scraper.finalize_project
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from scraper.snapshot_pdp import snapshot_pdp


DEFAULT_FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Capture une page PDP, extrait les images principales (carrousel) "
            "et prépare le projet pour finalisation CSV."
        )
    )
    parser.add_argument("--url", required=True, help="URL de la page PDP.")
    parser.add_argument(
        "--slug",
        default="",
        help="Identifiant du snapshot (dossier sous frontend/public/snapshots/).",
    )
    parser.add_argument(
        "--frontend-dir",
        default=str(DEFAULT_FRONTEND),
        help="Chemin vers le dossier frontend/ (par défaut: repo/frontend).",
    )
    parser.add_argument("--headless", action="store_true", help="Chrome headless.")
    parser.add_argument(
        "--max-scroll-steps",
        type=int,
        default=45,
        help="Nombre max d'étapes de scroll pour déclencher le lazy-load.",
    )
    parser.add_argument("--scroll-pause", type=float, default=0.6)
    parser.add_argument("--min-image-side", type=int, default=70)
    parser.add_argument("--debug-scroll", action="store_true")
    return parser.parse_args()


def run_pdp_pipeline(
    url: str,
    slug: str | None,
    frontend_dir: Path,
    headless: bool,
    max_scroll_steps: int,
    scroll_pause: float,
    min_image_side: int,
    debug_scroll: bool,
) -> dict:
    frontend_dir = Path(frontend_dir).resolve()
    snapshots_root = frontend_dir / "public" / "snapshots"
    snapshots_root.mkdir(parents=True, exist_ok=True)

    effective_slug = (slug or "").strip()
    if effective_slug:
        target_dir = snapshots_root / effective_slug
        if target_dir.exists():
            shutil.rmtree(target_dir)

    snapshot = snapshot_pdp(
        url=url,
        output_dir=snapshots_root,
        slug=effective_slug or None,
        headless=headless,
        max_scroll_steps=max_scroll_steps,
        scroll_pause=scroll_pause,
        min_image_side=min_image_side,
        debug_scroll=debug_scroll,
    )

    redesign_path = snapshot.html_path.with_name("redesign.html")
    shutil.copyfile(snapshot.html_path, redesign_path)

    existing_meta = json.loads(snapshot.meta_path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    thumbnail_url = ""
    try:
        images = json.loads(snapshot.images_json_path.read_text(encoding="utf-8"))
        if images:
            thumbnail_url = images[0].get("image_url", "")
    except Exception:
        pass

    existing_meta.update(
        {
            "kind": "pdp",
            "created_at": now,
            "has_redesign": False,
            "csv_pairs": 0,
            "thumbnail_url": thumbnail_url,
            "status": "draft",
            "finalized_at": None,
        }
    )
    snapshot.meta_path.write_text(
        json.dumps(existing_meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n=== PDP prête ===")
    print(f"Slug:             {existing_meta['slug']}")
    print(f"Snapshot HTML:    {snapshot.html_path}")
    print(f"Redesign HTML:    {redesign_path}")
    print(f"Images CSV:       {snapshot.images_csv_path}")
    print(f"Meta:             {snapshot.meta_path}")
    return existing_meta


def main() -> None:
    args = parse_args()
    run_pdp_pipeline(
        url=args.url,
        slug=args.slug or None,
        frontend_dir=Path(args.frontend_dir),
        headless=args.headless,
        max_scroll_steps=args.max_scroll_steps,
        scroll_pause=args.scroll_pause,
        min_image_side=args.min_image_side,
        debug_scroll=args.debug_scroll,
    )


if __name__ == "__main__":
    main()
