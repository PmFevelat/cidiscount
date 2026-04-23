"""Capture a product page (PDP) snapshot focused on gallery/carousel images."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from scraper.snapshot_site import (
    FREEZE_DOM_JS,
    SnapshotResult,
    dismiss_popups,
    make_driver,
    progressive_scroll,
    slugify,
)


COLLECT_PDP_IMAGES_JS = r"""
const minSide = arguments[0] || 80;
const baseUrl = window.location.href;

function textHint(el) {
  if (!el) return '';
  const parts = [];
  const attrs = ['id', 'class', 'role', 'aria-label', 'data-testid', 'data-test-id'];
  for (const attr of attrs) {
    const value = el.getAttribute && el.getAttribute(attr);
    if (value) parts.push(value);
  }
  return parts.join(' ').toLowerCase();
}

const carouselRegex = /(carousel|slider|swiper|slick|gallery|thumb|thumbnail|product-media|product-image)/i;
const nextPrevRegex = /(next|prev|suivant|precedent|gauche|droite|arrow)/i;
const items = [];

for (const img of [...document.querySelectorAll('img')]) {
  const raw = img.currentSrc
    || img.getAttribute('src')
    || img.getAttribute('data-src')
    || img.getAttribute('data-lazy-src')
    || img.getAttribute('data-original')
    || '';
  if (!raw) continue;

  let src;
  try { src = new URL(raw, baseUrl).href; } catch (_e) { continue; }
  if (!/^https?:\/\//i.test(src)) continue;

  const style = window.getComputedStyle(img);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    continue;
  }

  const rect = img.getBoundingClientRect();
  const w = rect.width || img.naturalWidth || 0;
  const h = rect.height || img.naturalHeight || 0;
  if (w < minSide || h < minSide) continue;

  const top = rect.top + window.scrollY;
  const left = rect.left + window.scrollX;

  const carouselHost = img.closest(
    '[class*="carousel" i], [class*="slider" i], [class*="swiper" i], ' +
    '[class*="gallery" i], [id*="carousel" i], [id*="slider" i], [id*="gallery" i], ' +
    '[aria-label*="carousel" i], [aria-label*="gallery" i], [data-testid*="carousel" i], [data-testid*="gallery" i]'
  );
  const host = carouselHost || img.parentElement;
  const hostHint = textHint(host);
  const imgHint = textHint(img);

  const inCarousel = Boolean(carouselHost) || carouselRegex.test(hostHint) || carouselRegex.test(imgHint);
  const navButtons = host
    ? [...host.querySelectorAll('button, [role="button"], [aria-label], [class], [id]')]
    : [];
  const hasNavigation = navButtons.some((el) => nextPrevRegex.test(textHint(el)));

  let score = 0;
  if (inCarousel) score += 100;
  if (hasNavigation) score += 45;
  if (top < 1800) score += 20;
  if (w >= 180 && h >= 180) score += 10;

  items.push({
    src,
    alt: (img.getAttribute('alt') || '').trim(),
    top,
    left,
    width: w,
    height: h,
    in_carousel: inCarousel,
    score,
  });
}

items.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);

const seen = new Set();
const deduped = [];
for (const item of items) {
  if (seen.has(item.src)) continue;
  seen.add(item.src);
  deduped.push(item);
}

return deduped;
"""


def _normalize_alt(alt: str) -> str:
    return re.sub(r"\s+", " ", (alt or "").strip().lower())


def _select_product_gallery_images(
    images_records_all: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not images_records_all:
        return []

    # 1) Priorité absolue: grandes images "hero" dans la zone PDP haute.
    large_above_fold = [
        row
        for row in images_records_all
        if row["top"] <= 1800 and row["width"] >= 220 and row["height"] >= 220
    ]
    if large_above_fold:
        alt_counts: dict[str, int] = {}
        for row in large_above_fold:
            key = _normalize_alt(str(row.get("alt", "")))
            if key:
                alt_counts[key] = alt_counts.get(key, 0) + 1

        if alt_counts:
            dominant_alt, count = max(alt_counts.items(), key=lambda kv: kv[1])
            if count >= 2:
                selected = [
                    row
                    for row in large_above_fold
                    if _normalize_alt(str(row.get("alt", ""))) == dominant_alt
                ]
                if selected:
                    selected.sort(key=lambda row: (row["top"], row["left"]))
                    return selected

        # Si pas d'alt dominant, on prend la bande la plus haute de grosses images.
        max_area = max(row["width"] * row["height"] for row in large_above_fold)
        min_top = min(row["top"] for row in large_above_fold)
        selected = [
            row
            for row in large_above_fold
            if abs(row["top"] - min_top) <= 160
            and (row["width"] * row["height"]) >= max_area * 0.45
        ]
        if selected:
            selected.sort(key=lambda row: (row["top"], row["left"]))
            return selected

    # 2) Fallback: carrousel explicite mais avec taille minimale stricte.
    strict_carousel = [
        row
        for row in images_records_all
        if row["is_carousel"]
        and row["top"] <= 1800
        and row["width"] >= 180
        and row["height"] >= 180
    ]
    if strict_carousel:
        min_top = min(row["top"] for row in strict_carousel)
        selected = [row for row in strict_carousel if abs(row["top"] - min_top) <= 220]
        selected.sort(key=lambda row: (row["top"], row["left"]))
        return selected

    # 3) Dernier recours: top fold en excluant les petites vignettes.
    top_fold = [
        row
        for row in images_records_all
        if row["top"] <= 2200 and row["width"] >= 120 and row["height"] >= 120
    ]
    top_fold.sort(key=lambda row: (row["top"], row["left"]))
    if top_fold:
        return top_fold[:20]

    return images_records_all[:20]


def snapshot_pdp(
    url: str,
    output_dir: Path,
    slug: str | None = None,
    headless: bool = False,
    max_scroll_steps: int = 45,
    scroll_pause: float = 0.6,
    min_image_side: int = 70,
    debug_scroll: bool = False,
    ready_timeout: int = 25,
) -> SnapshotResult:
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print("[PDP] Initialisation du navigateur Chrome...", flush=True)
    driver = make_driver(headless=headless)
    print("[PDP] Navigateur prêt.", flush=True)
    try:
        print(f"[PDP] Ouverture: {url}", flush=True)
        driver.get(url)
        WebDriverWait(driver, ready_timeout).until(
            lambda d: d.execute_script("return document.readyState")
            in {"interactive", "complete"}
        )
        dismiss_popups(driver)
        WebDriverWait(driver, ready_timeout).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img"))
        )

        print("[PDP] Scroll progressif pour charger la galerie produit...", flush=True)
        progressive_scroll(driver, max_scroll_steps, scroll_pause, debug_scroll)
        dismiss_popups(driver, timeout=2)

        print(
            "[PDP] Collecte des images principales (carrousel prioritaire)...",
            flush=True,
        )
        raw_images = driver.execute_script(COLLECT_PDP_IMAGES_JS, min_image_side) or []
        print(f"[PDP] {len(raw_images)} image(s) détectée(s).", flush=True)

        print("[PDP] Gel du DOM et extraction du HTML...", flush=True)
        # Keep scripts for PDP snapshots so the product carousel stays interactive.
        frozen: dict[str, Any] = driver.execute_script(FREEZE_DOM_JS, True)
        html = frozen["html"]
        title = frozen.get("title", "")
        doc_width = int(frozen.get("width", 1440))
        doc_height = int(frozen.get("height", 2400))
    finally:
        driver.quit()

    fallback_slug = slugify(title or url)
    final_slug = slug or f"pdp-{fallback_slug}"
    site_dir = output_dir / final_slug
    site_dir.mkdir(parents=True, exist_ok=True)

    html_path = site_dir / "original.html"
    html_path.write_text(html, encoding="utf-8")

    filtered_images = [
        item
        for item in raw_images
        if str(item.get("src", "")).lower().startswith(("http://", "https://"))
    ]
    images_records_all = [
        {
            "order": idx + 1,
            "image_url": item["src"],
            "alt": item.get("alt", ""),
            "top": float(item.get("top", 0.0)),
            "left": float(item.get("left", 0.0)),
            "width": float(item.get("width", 0.0)),
            "height": float(item.get("height", 0.0)),
            "is_carousel": bool(item.get("in_carousel", False)),
            "score": float(item.get("score", 0.0)),
        }
        for idx, item in enumerate(filtered_images)
    ]

    export_records = _select_product_gallery_images(images_records_all)

    images_json_path = site_dir / "images.json"
    images_json_path.write_text(
        json.dumps(images_records_all, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    images_csv_path = site_dir / "images.csv"
    with images_csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["order", "former_image_url", "new_image_url"],
        )
        writer.writeheader()
        for idx, row in enumerate(export_records, start=1):
            writer.writerow(
                {
                    "order": idx,
                    "former_image_url": row["image_url"],
                    "new_image_url": "",
                }
            )

    meta_path = site_dir / "meta.json"
    meta_path.write_text(
        json.dumps(
            {
                "slug": final_slug,
                "kind": "pdp",
                "url": url,
                "title": title,
                "document_width": doc_width,
                "document_height": doc_height,
                "image_count": len(export_records),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"[PDP] OK → {site_dir}")
    return SnapshotResult(
        url=url,
        title=title,
        html_path=html_path,
        images_csv_path=images_csv_path,
        images_json_path=images_json_path,
        meta_path=meta_path,
        image_count=len(export_records),
        document_height=doc_height,
        document_width=doc_width,
    )
