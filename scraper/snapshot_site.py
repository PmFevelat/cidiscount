"""Capture a faithful HTML snapshot of any catalog page.

The snapshot preserves the rendered DOM after JavaScript, rewrites image tags
to their resolved URLs (so that a later CSV-based substitution is trivial),
strips scripts to prevent client-side mutations, and injects a <base href>
pointing at the original page so external CSS / fonts / icons keep resolving.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

@dataclass
class SnapshotResult:
    url: str
    title: str
    html_path: Path
    images_csv_path: Path
    images_json_path: Path
    meta_path: Path
    image_count: int
    document_height: int
    document_width: int


COOKIE_BUTTON_XPATHS = [
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'tout accepter')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'accepter tout')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'accepter')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'j’accepte')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'j\\'accepte')]",
    "//button[@id='didomi-notice-agree-button']",
    "//button[contains(@class, 'didomi-continue-without-agreeing')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'continuer sans')]",
]


def _find_cached_chromedriver() -> Path | None:
    env_path = (os.environ.get("CHROMEDRIVER_PATH") or "").strip()
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.exists():
            return candidate.resolve()

    # webdriver-manager cache (macOS Apple Silicon path).
    cache_root = Path.home() / ".wdm" / "drivers" / "chromedriver" / "mac64"
    candidates: list[Path] = []
    if cache_root.exists():
        candidates.extend(cache_root.glob("*/chromedriver-mac-arm64/chromedriver"))

    # Optional project-local binary (if provided manually).
    project_candidate = (
        Path(__file__).resolve().parents[1] / "tools" / "chromedriver" / "chromedriver"
    )
    if project_candidate.exists():
        candidates.append(project_candidate)

    if not candidates:
        return None
    # Keep newest cache entry first.
    return max(candidates, key=lambda entry: entry.stat().st_mtime).resolve()


def make_driver(headless: bool) -> webdriver.Chrome:
    options = Options()
    options.page_load_strategy = "eager"
    options.add_argument("--window-size=1440,2200")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    )
    if headless:
        options.add_argument("--headless=new")

    cached_driver = _find_cached_chromedriver()
    if cached_driver:
        print(f"[DRIVER] Utilisation du driver local: {cached_driver}", flush=True)
        try:
            service = Service(executable_path=str(cached_driver))
            return webdriver.Chrome(service=service, options=options)
        except WebDriverException as exc:
            print(
                f"[DRIVER] Driver local incompatible ({exc}). Fallback auto-download...",
                flush=True,
            )

    print("[DRIVER] Résolution du driver via webdriver-manager...", flush=True)
    from webdriver_manager.chrome import ChromeDriverManager

    service = Service(executable_path=ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


def dismiss_popups(driver: webdriver.Chrome, timeout: int = 4) -> None:
    for xpath in COOKIE_BUTTON_XPATHS:
        try:
            element = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((By.XPATH, xpath))
            )
            element.click()
            time.sleep(0.3)
        except TimeoutException:
            continue
        except WebDriverException:
            continue


def progressive_scroll(
    driver: webdriver.Chrome,
    max_steps: int,
    pause: float,
    debug: bool,
) -> None:
    """Scroll down to bottom, step by step, to trigger lazy-loaded images.

    Stagnation is measured on scroll position (not page height): the page
    height often doesn't change when lazy images swap placeholders for real
    images, but the scroll position will stop advancing once we hit the
    bottom of the document.
    """
    prev_y = -1
    stuck_at_bottom = 0
    for step in range(max_steps):
        height = driver.execute_script(
            "return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);"
        )
        driver.execute_script(
            "window.scrollBy({ top: Math.floor(window.innerHeight * 0.85), "
            "behavior: 'auto' });"
        )
        time.sleep(pause)
        y = driver.execute_script("return window.scrollY + window.innerHeight;")
        at_bottom = y >= height - 4
        advanced = y > prev_y + 2
        if debug:
            print(
                f"[SCROLL] step={step+1}/{max_steps} y={int(y)} h={int(height)} "
                f"bottom={at_bottom} advanced={advanced}"
            )
        prev_y = y
        if at_bottom:
            stuck_at_bottom += 1
        else:
            stuck_at_bottom = 0
        if stuck_at_bottom >= 2:
            break
        if not advanced and not at_bottom:
            # Could be a sticky overlay blocking scroll — try a harder jump.
            driver.execute_script(
                "window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });"
            )
            time.sleep(pause)
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(0.4)


# JavaScript that freezes the current DOM into a self-contained snapshot:
# - resolves every <img src>/srcset to the currently-loaded URL
# - optionally keeps scripts for interactive snapshots (PDP carousel, etc.)
# - injects <base href> so relative URLs (CSS / fonts / icons) keep working
# - removes known overlay blockers (cookie banners, fullscreen dialogs, etc.)
FREEZE_DOM_JS = r"""
const baseUrl = window.location.href;
const keepScripts = Boolean(arguments[0]);

// 1–2) For static catalog snapshots we normalize <img>/<picture> so CSV swaps are easy.
// For interactive PDP snapshots (keepScripts) we must NOT mutate the DOM: React / SPA
// hydration re-runs on the saved HTML and breaks if attributes differ from what bundles expect.
if (!keepScripts) {
    document.querySelectorAll('img').forEach((img) => {
        const candidate = img.currentSrc
            || img.getAttribute('src')
            || img.getAttribute('data-src')
            || img.getAttribute('data-lazy-src')
            || img.getAttribute('data-original')
            || '';
        img.removeAttribute('srcset');
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy-src');
        img.removeAttribute('data-original');
        img.removeAttribute('loading');
        if (candidate) {
            try {
                img.setAttribute('src', new URL(candidate, baseUrl).href);
            } catch (e) {
                img.setAttribute('src', candidate);
            }
        }
    });
    document.querySelectorAll('picture source').forEach((s) => s.remove());
}

// 3) Remove <noscript>. Scripts can be kept for interactive snapshots.
document.querySelectorAll('noscript').forEach((n) => n.remove());
if (!keepScripts) {
    document.querySelectorAll('script').forEach((n) => n.remove());
}

// 4) Remove common cookie / consent overlays.
const overlaySelectors = [
    '#didomi-host',
    '#didomi-popup',
    '[id^="didomi-"]',
    '[class*="cookie" i]',
    '[class*="consent" i]',
    '[id*="consent" i]',
    '[class*="modal" i][class*="overlay" i]',
];
overlaySelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
        try { el.remove(); } catch (e) {}
    });
});

// 5) Re-enable body scroll in case an overlay locked it.
document.documentElement.style.overflow = '';
document.body.style.overflow = '';
document.documentElement.style.position = '';
document.body.style.position = '';

// 6) Inject <base href> as first child of <head>.
let base = document.querySelector('base');
if (!base) {
    base = document.createElement('base');
    document.head.insertBefore(base, document.head.firstChild);
}
base.setAttribute('href', baseUrl);
base.setAttribute('target', '_blank');

// 7) Inline all currently loaded CSS rules.
// Some e-commerce CDNs block stylesheet requests from localhost snapshots
// (403/WAF), so we keep a self-contained styled HTML.
try {
    const cssChunks = [];
    for (const sheet of Array.from(document.styleSheets || [])) {
        try {
            const rules = sheet.cssRules;
            if (!rules || !rules.length) continue;
            let cssText = '';
            for (const rule of Array.from(rules)) {
                cssText += rule.cssText + '\n';
            }
            if (cssText.trim()) cssChunks.push(cssText);
        } catch (e) {
            // Ignore unreadable sheets (cross-origin/CORS protected).
        }
    }
    if (cssChunks.length) {
        let inlineStyle = document.getElementById('__snapshot_inline_styles__');
        if (!inlineStyle) {
            inlineStyle = document.createElement('style');
            inlineStyle.id = '__snapshot_inline_styles__';
            document.head.appendChild(inlineStyle);
        }
        inlineStyle.textContent = cssChunks.join('\n');
    }
} catch (e) {
    // Best effort only.
}

return {
    html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
    title: document.title || '',
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
};
"""


# JavaScript that returns every visible <img> with its absolute position,
# ordered top→bottom, left→right. We keep only images large enough to be
# plausible product visuals (min dimensions) and resolve URLs to absolute.
COLLECT_IMAGES_JS = r"""
const minSide = arguments[0] || 80;
const baseUrl = window.location.href;
const items = [];
const imgs = [...document.querySelectorAll('img')];
for (const img of imgs) {
    const raw = img.currentSrc
        || img.getAttribute('src')
        || img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-original')
        || '';
    if (!raw) continue;
    let src;
    try { src = new URL(raw, baseUrl).href; } catch (e) { continue; }
    if (!/^https?:\/\//i.test(src)) continue;
    const rect = img.getBoundingClientRect();
    const w = rect.width || img.naturalWidth || 0;
    const h = rect.height || img.naturalHeight || 0;
    if (w < minSide || h < minSide) continue;
    const top = rect.top + window.scrollY;
    const left = rect.left + window.scrollX;
    const anchor = img.closest('a[href]');
    const product_url = anchor
        ? new URL(anchor.getAttribute('href'), baseUrl).href
        : '';
    items.push({
        src,
        alt: (img.getAttribute('alt') || '').trim(),
        top,
        left,
        width: w,
        height: h,
        product_url,
    });
}
// De-dup by src keeping first occurrence (topmost).
const seen = new Set();
const deduped = [];
for (const it of items) {
    if (seen.has(it.src)) continue;
    seen.add(it.src);
    deduped.push(it);
}
deduped.sort((a, b) => a.top - b.top || a.left - b.left);
return deduped;
"""


def slugify(value: str) -> str:
    lowered = value.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or "snapshot"


def snapshot_site(
    url: str,
    output_dir: Path,
    slug: str | None = None,
    headless: bool = False,
    max_scroll_steps: int = 60,
    scroll_pause: float = 0.7,
    min_image_side: int = 80,
    debug_scroll: bool = False,
    ready_timeout: int = 25,
) -> SnapshotResult:
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)
    try:
        print(f"[SNAPSHOT] Ouverture: {url}")
        driver.get(url)
        WebDriverWait(driver, ready_timeout).until(
            lambda d: d.execute_script("return document.readyState") in {"interactive", "complete"}
        )
        dismiss_popups(driver)
        WebDriverWait(driver, ready_timeout).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img"))
        )

        print("[SNAPSHOT] Scroll progressif pour lazy-load...")
        progressive_scroll(driver, max_scroll_steps, scroll_pause, debug_scroll)
        dismiss_popups(driver, timeout=2)

        print("[SNAPSHOT] Collecte des images (ordre top→bottom)...")
        raw_images = driver.execute_script(COLLECT_IMAGES_JS, min_image_side) or []
        print(f"[SNAPSHOT] {len(raw_images)} image(s) retenue(s).")

        print("[SNAPSHOT] Gel du DOM et extraction du HTML...")
        frozen: dict[str, Any] = driver.execute_script(FREEZE_DOM_JS, False)
        html = frozen["html"]
        title = frozen.get("title", "")
        doc_width = int(frozen.get("width", 1440))
        doc_height = int(frozen.get("height", 2000))

    finally:
        driver.quit()

    final_slug = slug or slugify(title) or "snapshot"
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
            "product_url": item.get("product_url", ""),
        }
        for idx, item in enumerate(filtered_images)
    ]
    product_like = [
        row
        for row in images_records_all
        if row.get("product_url")
        and float(row.get("top", 0.0)) >= 100
        and float(row.get("width", 0.0)) <= 800
        and float(row.get("height", 0.0)) <= 800
    ]
    if product_like:
        export_records = product_like
    else:
        export_records = [row for row in images_records_all if row.get("product_url")]
        if not export_records:
            export_records = images_records_all

    images_json_path = site_dir / "images.json"
    images_json_path.write_text(
        json.dumps(images_records_all, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Public CSV exposed in the modal for downstream image generation:
    # - order
    # - former_image_url (current site image)
    # - new_image_url (left empty, to be filled later)
    images_csv_path = site_dir / "images.csv"
    import csv as _csv

    with images_csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = _csv.DictWriter(
            f,
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

    print(f"[SNAPSHOT] OK → {site_dir}")
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
