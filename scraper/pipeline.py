"""End-to-end CLI:
  URL (+ optional user CSV) → snapshot + before/after ready for the frontend.

Outputs live inside frontend/public/snapshots/<slug>/. Each project carries its
own meta.json which the Next.js landing page scans to build the list of
existing projects.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from scraper.apply_csv_redesign import apply_csv_to_snapshot, load_mapping
from scraper.snapshot_site import SnapshotResult, slugify, snapshot_site


DEFAULT_FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Capture un site à partir d'une URL, applique un CSV de redesign "
            "(former_image_url → new_image_url), et dépose le tout "
            "dans le frontend pour le slider avant/après."
        )
    )
    p.add_argument("--url", required=True, help="URL de la page catalogue à capturer.")
    p.add_argument("--csv", default="", help="CSV avant/après (optionnel).")
    p.add_argument(
        "--slug",
        default="",
        help="Identifiant du snapshot (dossier sous frontend/public/snapshots/).",
    )
    p.add_argument(
        "--frontend-dir",
        default=str(DEFAULT_FRONTEND),
        help="Chemin vers le dossier frontend/ (par défaut: repo/frontend).",
    )
    p.add_argument("--headless", action="store_true", help="Chrome headless.")
    p.add_argument(
        "--max-scroll-steps",
        type=int,
        default=80,
        help="Nombre max d'étapes de scroll pour déclencher le lazy-load.",
    )
    p.add_argument("--scroll-pause", type=float, default=0.7)
    p.add_argument("--min-image-side", type=int, default=80)
    p.add_argument("--debug-scroll", action="store_true")
    return p.parse_args()


def run_pipeline(
    url: str,
    csv_path: str | None,
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

    effective_slug = slug or slugify(url.split("/", 3)[-1] if "://" in url else url)

    # Clean previous snapshot with same slug to avoid stale files.
    target_dir = snapshots_root / effective_slug
    if target_dir.exists():
        shutil.rmtree(target_dir)

    snapshot: SnapshotResult = snapshot_site(
        url=url,
        output_dir=snapshots_root,
        slug=effective_slug,
        headless=headless,
        max_scroll_steps=max_scroll_steps,
        scroll_pause=scroll_pause,
        min_image_side=min_image_side,
        debug_scroll=debug_scroll,
    )

    redesign_path = snapshot.html_path.with_name("redesign.html")
    csv_pairs_count = 0
    if csv_path:
        resolved_csv_path = Path(csv_path).expanduser().resolve()
        apply_csv_to_snapshot(
            original_html_path=snapshot.html_path,
            csv_path=resolved_csv_path,
            output_html_path=redesign_path,
        )
        csv_pairs_count = len(load_mapping(resolved_csv_path))
    else:
        # Without a CSV, the redesign is a copy of the original so the UI works.
        shutil.copyfile(snapshot.html_path, redesign_path)

    # Enrich per-project meta.json with pipeline-level info.
    existing_meta = json.loads(snapshot.meta_path.read_text(encoding="utf-8"))
    thumbnail_url = ""
    try:
        images = json.loads(snapshot.images_json_path.read_text(encoding="utf-8"))
        # Prefer product images: non-empty alt, has product_url, below the hero
        # area, large enough. This skips promo banners placed at top.
        for item in images:
            if not item.get("product_url"):
                continue
            if not (item.get("alt") or "").strip():
                continue
            if float(item.get("top", 0)) < 200:
                continue
            if float(item.get("width", 0)) < 150 or float(item.get("height", 0)) < 150:
                continue
            thumbnail_url = item.get("image_url", "")
            break
        if not thumbnail_url:
            for item in images:
                if item.get("product_url"):
                    thumbnail_url = item.get("image_url", "")
                    break
        if not thumbnail_url and images:
            thumbnail_url = images[0].get("image_url", "")
    except Exception:
        pass

    existing_meta.update(
        {
            "kind": "catalog",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "has_redesign": bool(csv_path),
            "csv_pairs": csv_pairs_count,
            "thumbnail_url": thumbnail_url,
            "status": "ready" if csv_path else "draft",
            "finalized_at": datetime.now(timezone.utc).isoformat()
            if csv_path
            else None,
        }
    )
    snapshot.meta_path.write_text(
        json.dumps(existing_meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n=== Terminé ===")
    print(f"Slug:             {existing_meta['slug']}")
    print(f"Snapshot HTML:    {snapshot.html_path}")
    print(f"Redesign HTML:    {redesign_path}")
    print(f"Images CSV:       {snapshot.images_csv_path}")
    print(f"Meta:             {snapshot.meta_path}")
    return existing_meta


def main() -> None:
    args = parse_args()
    run_pipeline(
        url=args.url,
        csv_path=args.csv or None,
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
