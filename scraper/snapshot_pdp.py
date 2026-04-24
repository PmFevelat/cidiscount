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
    ensure_on_target_url,
    make_driver,
    progressive_scroll,
    slugify,
)


COLLECT_PDP_IMAGES_JS = r"""
const minSide = arguments[0] || 80;
const baseUrl = window.location.href;

// ── Helpers ──────────────────────────────────────────────────────────────────
function textHint(el) {
  if (!el) return '';
  const attrs = ['id', 'class', 'role', 'aria-label', 'data-testid', 'data-test-id', 'data-qa'];
  return attrs.map(a => (el.getAttribute && el.getAttribute(a)) || '').join(' ').toLowerCase();
}

function absUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw, baseUrl).href;
    return /^https?:\/\//i.test(u) ? u : null;
  } catch { return null; }
}

// ── Pass 0 : JSON-LD Product (highest confidence, return immediately) ─────────
try {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(script.textContent || ''); } catch { continue; }
    const nodes = [].concat(data, (data && data['@graph']) || []).filter(Boolean);
    for (const node of nodes) {
      const types = [].concat(node['@type'] || []).map(String);
      if (!types.some(t => /^(schema:)?Product$/i.test(t))) continue;
      const rawImgs = [].concat(node.image || []);
      const urls = rawImgs
        .map(i => (typeof i === 'string' ? i : (i.url || i.contentUrl || '')))
        .map(absUrl).filter(Boolean);
      if (urls.length > 0) {
        return urls.map((src, i) => ({
          src, alt: String(node.name || ''),
          top: i * 10, left: 0, width: 800, height: 800,
          in_carousel: true, score: 999,
        }));
      }
    }
  }
} catch (_e) {}

// ── Identify product container (zone around h1 with price/cart) ────────────
let productContainer = null;
const h1 = document.querySelector('h1');
if (h1) {
  let el = h1.parentElement;
  for (let d = 0; d < 10 && el && el !== document.body; d++, el = el.parentElement) {
    const hint = textHint(el);
    if (/\b(product|pdp|detail|fiche|item-page|pip|product-page)\b/i.test(hint)) {
      productContainer = el; break;
    }
    const hasPrice = el.querySelector('[class*="price" i],[itemprop="price"],[class*="prix" i],[class*="amount" i]');
    const hasCart  = el.querySelector('[class*="add-to-cart" i],[class*="basket" i],[class*="panier" i],[class*="buy-box" i],[class*="add_to_cart" i]');
    if (hasPrice && hasCart) { productContainer = el; break; }
    if ((hasPrice || hasCart) && d >= 3) { productContainer = el; break; }
  }
}

// ── Exclusion zones (recommendation / cross-sell sections) ──────────────────
const EXCL_WORDS = ['similar','recommend','related','aimerez','associé','frequently','cross.sell','upsell','also.viewed','complément','suggestion','other.product'];
const exclEls = new Set();
for (const el of document.querySelectorAll('[class],[id],[data-testid],[aria-label]')) {
  const hint = textHint(el);
  if (EXCL_WORDS.some(w => new RegExp(w, 'i').test(hint))) exclEls.add(el);
}
function isExcluded(img) {
  let cur = img.parentElement;
  while (cur && cur !== document.body) {
    if (exclEls.has(cur)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function inProductZone(img) {
  if (!productContainer) return false;
  return productContainer.contains(img);
}

// ── Pass 1 : Visible images ───────────────────────────────────────────────────
const carouselRegex = /(carousel|slider|swiper|slick|gallery|thumb|thumbnail|product-media|product-image|viewer)/i;
const nextPrevRegex = /(next|prev|suivant|précédent|gauche|droite|arrow|forward|backward)/i;
const items = [];

for (const img of [...document.querySelectorAll('img')]) {
  const raw = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src')
    || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || '';
  const src = absUrl(raw);
  if (!src) continue;

  const style = window.getComputedStyle(img);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

  const rect = img.getBoundingClientRect();
  const w = rect.width || img.naturalWidth || 0;
  const h = rect.height || img.naturalHeight || 0;
  if (w < minSide || h < minSide) continue;

  const top  = rect.top  + window.scrollY;
  const left = rect.left + window.scrollX;

  const carouselHost = img.closest(
    '[class*="carousel" i],[class*="slider" i],[class*="swiper" i],' +
    '[class*="gallery" i],[class*="viewer" i],' +
    '[id*="carousel" i],[id*="slider" i],[id*="gallery" i],' +
    '[aria-label*="carousel" i],[aria-label*="gallery" i],' +
    '[data-testid*="carousel" i],[data-testid*="gallery" i]'
  );
  const host = carouselHost || img.parentElement;
  const hostHint = textHint(host);
  const imgHint  = textHint(img);

  const inCarousel   = Boolean(carouselHost) || carouselRegex.test(hostHint) || carouselRegex.test(imgHint);
  const hasNavigation = host
    ? [...host.querySelectorAll('button,[role="button"],[aria-label],[class],[id]')]
        .some(el => nextPrevRegex.test(textHint(el)))
    : false;

  let score = 0;
  if (inProductZone(img)) score += 150;   // strong: inside identified product area
  if (isExcluded(img))    score -= 300;   // strong: inside recommendation zone
  if (inCarousel)         score += 100;
  if (hasNavigation)      score +=  45;
  if (top < 1800)         score +=  20;
  if (w >= 180 && h >= 180) score += 10;

  items.push({ src, alt: (img.getAttribute('alt') || '').trim(), top, left, width: w, height: h, in_carousel: inCarousel, score });
}

// ── Pass 2 : Hidden gallery slides inside product container ──────────────────
// Captures other views that are in carousel DOM but off-screen / hidden.
const seen1 = new Set(items.map(i => i.src));
if (productContainer) {
  const carouselSel =
    '[class*="carousel" i],[class*="slider" i],[class*="swiper" i],[class*="gallery" i],[class*="viewer" i]';
  for (const carousel of productContainer.querySelectorAll(carouselSel)) {
    for (const img of carousel.querySelectorAll('img')) {
      const raw = img.getAttribute('src') || img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.currentSrc || '';
      const src = absUrl(raw);
      if (!src || seen1.has(src)) continue;
      const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0');
      const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0');
      if (w < 150 || h < 150) continue;
      seen1.add(src);
      items.push({ src, alt: (img.getAttribute('alt') || '').trim(), top: -1, left: -1, width: w, height: h, in_carousel: true, score: 120 });
    }
  }
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


MARK_PDP_GALLERY_JS = r"""
(function(urls) {
  var seen = {};
  document.querySelectorAll('img').forEach(function(img) {
    var src = img.currentSrc || img.src || img.getAttribute('src') || '';
    if (!src) return;
    var srcBase = src.split('?')[0];
    var matchIdx = -1;
    for (var i = 0; i < urls.length; i++) {
      if (seen[i]) continue;
      if (urls[i] === src || urls[i].split('?')[0] === srcBase) { matchIdx = i; break; }
    }
    if (matchIdx === -1) {
      var fn = srcBase.split('/').pop();
      if (fn) {
        for (var i = 0; i < urls.length; i++) {
          if (seen[i]) continue;
          if (urls[i].split('/').pop().split('?')[0] === fn) { matchIdx = i; break; }
        }
      }
    }
    if (matchIdx !== -1) {
      img.setAttribute('data-pdp-img', String(matchIdx));
      seen[matchIdx] = true;
    }
  });
})(arguments[0]);
"""

_PDP_GALLERY_CTRL = """\
<script id="__pdp_gallery_ctrl__">
!function(){
  var imgs=Array.from(document.querySelectorAll('[data-pdp-img]'))
    .sort(function(a,b){return +a.getAttribute('data-pdp-img')- +b.getAttribute('data-pdp-img');});
  if(imgs.length<2)return;
  var urls=imgs.map(function(i){return i.src||i.getAttribute('src')||'';});
  var main=imgs[0];
  imgs.slice(1).forEach(function(img){
    img.style.setProperty('display','none','important');
    var p=img.parentElement;
    if(p&&p!==document.body&&Array.from(p.children).every(function(c){return c===img||getComputedStyle(c).display==='none';}))
      p.style.setProperty('display','none','important');
  });
  var idx=0,n=urls.length;
  function go(d){
    idx=(idx+d+n)%n;
    main.src=urls[idx];
    main.removeAttribute('srcset');
    cnt.textContent=(idx+1)+' / '+n;
  }
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:999px;display:flex;align-items:center;gap:16px;padding:10px 22px;box-shadow:0 4px 24px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  function mkBtn(t,d){var b=document.createElement('button');b.textContent=t;b.style.cssText='background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0;line-height:1;';b.onclick=function(){go(d);};return b;}
  var cnt=document.createElement('span');
  cnt.style.cssText='color:#fff;font-size:13px;min-width:42px;text-align:center;';
  cnt.textContent='1 / '+n;
  bar.appendChild(mkBtn('‹',-1));bar.appendChild(cnt);bar.appendChild(mkBtn('›',1));
  document.body.appendChild(bar);
}();
</script>"""


def _inject_pdp_gallery_controller(html: str) -> str:
    pos = html.lower().rfind("</body>")
    if pos == -1:
        return html + _PDP_GALLERY_CTRL
    return html[:pos] + _PDP_GALLERY_CTRL + "\n" + html[pos:]


def _normalize_alt(alt: str) -> str:
    return re.sub(r"\s+", " ", (alt or "").strip().lower())


def _select_product_gallery_images(
    images_records_all: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not images_records_all:
        return []

    # 0) JSON-LD images (score==999): fully trusted, return as-is.
    ld_json = [row for row in images_records_all if row.get("score", 0) >= 999]
    if ld_json:
        return ld_json[:30]

    # 1) Product-zone carousel (score>=220 = in_product_zone+in_carousel+above_fold).
    #    These are high-confidence images from the identified product area.
    product_zone = [row for row in images_records_all if row.get("score", 0) >= 220]
    if product_zone:
        product_zone.sort(key=lambda r: (r["top"], r["left"]))
        return product_zone[:30]

    # 2) Grandes images "hero" dans la zone haute, groupées par alt ou position.
    large_above_fold = [
        row for row in images_records_all
        if row["top"] <= 1800 and row["width"] >= 220 and row["height"] >= 220
        and row.get("score", 0) >= 0  # exclude negatively-scored recommendation images
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
                    row for row in large_above_fold
                    if _normalize_alt(str(row.get("alt", ""))) == dominant_alt
                ]
                if selected:
                    selected.sort(key=lambda row: (row["top"], row["left"]))
                    return selected

        # Pas d'alt dominant: bande la plus haute de grosses images.
        max_area = max(row["width"] * row["height"] for row in large_above_fold)
        min_top = min(row["top"] for row in large_above_fold)
        selected = [
            row for row in large_above_fold
            if abs(row["top"] - min_top) <= 160
            and (row["width"] * row["height"]) >= max_area * 0.45
        ]
        if selected:
            selected.sort(key=lambda row: (row["top"], row["left"]))
            return selected

    # 3) Carrousel explicite avec taille stricte (fallback).
    strict_carousel = [
        row for row in images_records_all
        if row["is_carousel"]
        and row["top"] <= 1800
        and row["width"] >= 180
        and row["height"] >= 180
        and row.get("score", 0) >= 0
    ]
    if strict_carousel:
        min_top = min(row["top"] for row in strict_carousel)
        selected = [row for row in strict_carousel if abs(row["top"] - min_top) <= 220]
        selected.sort(key=lambda row: (row["top"], row["left"]))
        return selected

    # 4) Top fold, sans petites vignettes.
    top_fold = [
        row for row in images_records_all
        if row["top"] <= 2200 and row["width"] >= 120 and row["height"] >= 120
        and row.get("score", 0) >= 0
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
        ensure_on_target_url(driver, url, ready_timeout, "PDP après modales")
        WebDriverWait(driver, ready_timeout).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img"))
        )

        print("[PDP] Scroll progressif pour charger la galerie produit...", flush=True)
        progressive_scroll(driver, max_scroll_steps, scroll_pause, debug_scroll)
        dismiss_popups(driver, timeout=2)
        ensure_on_target_url(driver, url, ready_timeout, "PDP après scroll")

        print(
            "[PDP] Collecte des images principales (carrousel prioritaire)...",
            flush=True,
        )
        raw_images = driver.execute_script(COLLECT_PDP_IMAGES_JS, min_image_side) or []
        print(f"[PDP] {len(raw_images)} image(s) détectée(s).", flush=True)

        # Compute selected images before freeze so we can mark them in the live DOM.
        filtered_images = [
            item
            for item in raw_images
            if str(item.get("src", "")).lower().startswith(("http://", "https://"))
        ]
        images_records_all = [
            {
                "order": i + 1,
                "image_url": item["src"],
                "alt": item.get("alt", ""),
                "top": float(item.get("top", 0.0)),
                "left": float(item.get("left", 0.0)),
                "width": float(item.get("width", 0.0)),
                "height": float(item.get("height", 0.0)),
                "is_carousel": bool(item.get("in_carousel", False)),
                "score": float(item.get("score", 0.0)),
            }
            for i, item in enumerate(filtered_images)
        ]
        export_records = _select_product_gallery_images(images_records_all)

        if export_records:
            selected_urls = [row["image_url"] for row in export_records]
            driver.execute_script(MARK_PDP_GALLERY_JS, selected_urls)
            print(
                f"[PDP] {len(selected_urls)} image(s) marquée(s) pour le contrôleur galerie.",
                flush=True,
            )

        print("[PDP] Gel du DOM et extraction du HTML...", flush=True)
        frozen: dict[str, Any] = driver.execute_script(FREEZE_DOM_JS, True)
        html = frozen["html"]
        title = frozen.get("title", "")
        doc_width = int(frozen.get("width", 1440))
        doc_height = int(frozen.get("height", 2400))
        html = _inject_pdp_gallery_controller(html)
    finally:
        driver.quit()

    fallback_slug = slugify(title or url)
    final_slug = slug or f"pdp-{fallback_slug}"
    site_dir = output_dir / final_slug
    site_dir.mkdir(parents=True, exist_ok=True)

    html_path = site_dir / "original.html"
    html_path.write_text(html, encoding="utf-8")

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
