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
from urllib.parse import parse_qsl, urlencode, urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# Plafond par page catalogue (lazy-load lourd, iframe trop grande sinon).
MAX_CATALOG_IMAGES_DEFAULT = 50

# Pauses: assez courtes pour rester crédibles, sans pattern « bot » trop mécanique.
POST_READY_STATE_SETTLE_S = 0.78
AFTER_URL_REOPEN_SETTLE_S = 0.52
POST_SCROLL_TO_TOP_S = 0.28
SCROLL_PAUSE_DEFAULT = 0.55


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


# Fermeture de modales hors cookies (murs de connexion, interstitiels, etc.).
MODAL_CLOSE_XPATHS = [
    "//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'fermer')]",
    "//*[@role='button' and (contains(., 'Fermer') or contains(., 'fermer'))]",
    "//button[contains(., 'Plus tard') or contains(., 'plus tard')]",
    "//a[contains(., 'Plus tard') or contains(., 'plus tard')]",
    "//button[contains(., 'Non merci') or contains(., 'non merci')]",
    "//a[contains(., 'Continuer en navigation') or contains(., 'continuer sans')]",
    "//*[(self::button or self::a) and (@aria-label='Fermer' or @aria-label='fermer' or @aria-label='Close' or @aria-label='close')]",
    "//button[contains(@class, 'close') and not(contains(@class, 'search'))]",
]

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
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
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


def _apply_stealth_scripts(driver: webdriver.Chrome) -> None:
    """Réduit la détection « automation » (certains sites ouvrent un login en headless)."""
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": (
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                )
            },
        )
    except WebDriverException:
        pass


def press_escape(driver: webdriver.Chrome, times: int = 3) -> None:
    try:
        body = driver.find_element(By.TAG_NAME, "body")
        for _ in range(times):
            body.send_keys(Keys.ESCAPE)
            time.sleep(0.22)
    except WebDriverException:
        pass


def dismiss_modals(
    driver: webdriver.Chrome, per_xpath_timeout: float = 1.2, rounds: int = 2
) -> None:
    """Ferme interstitiels / murs de compte (souvent absents en navigation manuelle)."""
    for _ in range(rounds):
        press_escape(driver, times=2)
        for xpath in MODAL_CLOSE_XPATHS:
            try:
                el = WebDriverWait(driver, per_xpath_timeout).until(
                    EC.element_to_be_clickable((By.XPATH, xpath))
                )
                el.click()
                time.sleep(0.4)
            except TimeoutException:
                continue
            except WebDriverException:
                continue


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


def _url_fingerprint(u: str) -> tuple[str, str, str]:
    """Hôte (sans www), chemin, query triée — pour comparer l’URL demandée et l’URL active."""
    p = urlparse((u or "").strip())
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = p.path or "/"
    if path != "/":
        path = path.rstrip("/")
    if not path:
        path = "/"
    q = urlencode(sorted(parse_qsl(p.query, keep_blank_values=True)))
    return host, path, q


def urls_match_target(target: str, current: str) -> bool:
    """True si l’URL courante est la même ressource que `target` (hôte, chemin, query)."""
    a = (target or "").split("#", 1)[0].strip()
    b = (current or "").split("#", 1)[0].strip()
    if not a or not b:
        return a == b
    return _url_fingerprint(a) == _url_fingerprint(b)


def ensure_on_target_url(
    driver: webdriver.Chrome,
    target_url: str,
    ready_timeout: int,
    label: str = "",
) -> None:
    """Après modales / captcha, certains sites repassent sur l’accueil : on revient sur l’URL initiale."""
    want = (target_url or "").split("#", 1)[0]
    suffix = f" {label}" if label else ""
    for attempt in range(3):
        try:
            cur = (driver.current_url or "").split("#", 1)[0]
        except WebDriverException:
            return
        if urls_match_target(want, cur):
            if attempt:
                print(
                    f"[SNAPSHOT] URL cible confirmée{suffix} (après {attempt} réouverture(s)).",
                    flush=True,
                )
            return
        if attempt >= 2:
            print(
                f"[SNAPSHOT] AVERTISSEMENT{suffix}: URL active différente de la cible. "
                f"Actuel: {cur} | attendu: {want}",
                flush=True,
            )
            return
        print(
            f"[SNAPSHOT] Réouverture URL cible{suffix} (écart: {cur} → cible)…",
            flush=True,
        )
        try:
            driver.get(want)
        except WebDriverException as exc:
            print(f"[SNAPSHOT] Échec navigation: {exc}", flush=True)
            return
        WebDriverWait(driver, ready_timeout).until(
            lambda d: d.execute_script("return document.readyState")
            in {"interactive", "complete"}
        )
        time.sleep(AFTER_URL_REOPEN_SETTLE_S)
        dismiss_popups(driver, timeout=2)
        dismiss_modals(driver, per_xpath_timeout=0.4, rounds=1)
        press_escape(driver, times=2)


def progressive_scroll(
    driver: webdriver.Chrome,
    max_steps: int,
    pause: float,
    debug: bool,
    *,
    min_image_side: int | None = None,
    max_deduped_images: int | None = None,
) -> None:
    """Scroll down to bottom, step by step, to trigger lazy-loaded images.

    Stagnation is measured on scroll position (not page height): the page
    height often doesn't change when lazy images swap placeholders for real
    images, but the scroll position will stop advancing once we hit the
    bottom of the document.

    Si ``max_deduped_images`` est défini (catalogue), on s'arrête dès qu'assez
    d'images uniques (même critère que la collecte) sont présentes, pour ne pas
    parcourir toute la page inutilement.
    """
    prev_y = -1
    stuck_at_bottom = 0
    for step in range(max_steps):
        if max_deduped_images and min_image_side is not None:
            try:
                n = len(
                    driver.execute_script(COLLECT_IMAGES_JS, min_image_side) or []
                )
            except WebDriverException:
                n = 0
            if n >= max_deduped_images:
                if debug:
                    print(
                        f"[SCROLL] early stop: {n} image(s) unique(s) >= "
                        f"{max_deduped_images}",
                        flush=True,
                    )
                break
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
    time.sleep(POST_SCROLL_TO_TOP_S)


# Lazy-load / LQIP : src data-URI, vrais fichiers en srcset, data-srcset (WS, Shopify…),
# <picture><source>, descripteurs w et x. Même logique : gel, collecte, prune.
IMG_URL_RESOLUTION_JS = r"""
function bestFromSrcsetString(raw) {
    if (!raw || !String(raw).trim()) return "";
    let best = "";
    let bestScore = -1;
    const parts = String(raw).split(",");
    for (let i = 0; i < parts.length; i++) {
        const segs = parts[i].trim().split(/\s+/).filter(Boolean);
        if (!segs.length) continue;
        const u0 = segs[0];
        let abs;
        if (u0.startsWith("//")) abs = "https:" + u0;
        else if (/^https?:\/\//i.test(u0)) abs = u0;
        else continue;
        let score = 0;
        if (segs[1]) {
            const d = segs[1].toLowerCase();
            if (/^\d+w$/.test(d)) score = parseInt(d.slice(0, -1), 10) || 0;
            else {
                const xm = d.match(/^(\d+(?:\.\d+)?)x$/i);
                if (xm) score = Math.round(parseFloat(xm[1]) * 1000);
            }
        }
        if (score === 0) score = 1 + i * 0.01;
        if (score >= bestScore) { bestScore = score; best = abs; }
    }
    return best;
}
function isDataOrBlob(u) {
    return !u || u.startsWith("data:") || u.startsWith("blob:");
}
function combinedSrcsetForImg(img) {
    const bits = [];
    const push = (v) => { if (v && String(v).trim()) bits.push(String(v).trim()); };
    push(img.getAttribute("srcset"));
    push(img.getAttribute("data-srcset"));
    push(img.getAttribute("data-lazy-srcset"));
    push(img.getAttribute("data-src-set"));
    const pic = img.closest("picture");
    if (pic) {
        pic.querySelectorAll("source").forEach((s) => {
            push(s.getAttribute("srcset"));
            push(s.getAttribute("data-srcset"));
            push(s.getAttribute("data-lazy-srcset"));
        });
    }
    return bits.join(", ");
}
function extraLazyHttp(img, baseUrl) {
    const names = [
        "data-src", "data-lazy-src", "data-original", "data-ll-src",
        "data-url", "data-full", "data-large", "data-zoom",
    ];
    for (let n = 0; n < names.length; n++) {
        const v = img.getAttribute(names[n]);
        if (!v || isDataOrBlob(v)) continue;
        if (/^https?:\/\//i.test(v)) return v;
        if (v.startsWith("//")) return "https:" + v;
        try {
            const h = new URL(v, baseUrl).href;
            if (/^https?:\/\//i.test(h)) return h;
        } catch (e) {}
    }
    return "";
}
function pickProductImageUrl(img, baseUrl) {
    const fromSet = bestFromSrcsetString(combinedSrcsetForImg(img));
    const cur = img.currentSrc || "";
    const attrSrc = img.getAttribute("src") || "";
    if (fromSet && (isDataOrBlob(attrSrc) || isDataOrBlob(cur))) return fromSet;
    if (!isDataOrBlob(cur) && /^https?:\/\//i.test(cur)) return cur;
    if (!isDataOrBlob(attrSrc) && /^https?:\/\//i.test(attrSrc)) return attrSrc;
    if (fromSet) return fromSet;
    const lazy = extraLazyHttp(img, baseUrl);
    if (lazy) return lazy;
    if (!isDataOrBlob(attrSrc) && attrSrc) {
        try { return new URL(attrSrc, baseUrl).href; } catch (e) { return attrSrc; }
    }
    return "";
}
"""


# JavaScript that freezes the current DOM into a self-contained snapshot:
# - resolves every <img src>/srcset to the currently-loaded URL
# - optionally keeps scripts for interactive snapshots (PDP carousel, etc.)
# - injects <base href> so relative URLs (CSS / fonts / icons) keep working
# - removes known overlay blockers (cookie banners, fullscreen dialogs, etc.)
FREEZE_DOM_JS = (
    r"""
const baseUrl = window.location.href;
const keepScripts = Boolean(arguments[0]);

"""
    + IMG_URL_RESOLUTION_JS
    + r"""
// 1–2) Catalog: normaliser <img>/<picture> ; PDP interactive : ne pas toucher (keepScripts).
if (!keepScripts) {
    document.querySelectorAll('img').forEach((img) => {
        let chosen = pickProductImageUrl(img, baseUrl);
        if (!chosen) {
            const fb = (img.getAttribute('src') || img.currentSrc || '').trim();
            if (fb) chosen = fb;
        }
        img.removeAttribute('srcset');
        img.removeAttribute('data-srcset');
        img.removeAttribute('data-lazy-srcset');
        img.removeAttribute('data-src-set');
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy-src');
        img.removeAttribute('data-original');
        img.removeAttribute('loading');
        if (chosen) {
            try {
                img.setAttribute('src', new URL(chosen, baseUrl).href);
            } catch (e) {
                img.setAttribute('src', chosen);
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

// 4b) Modales d’authentification / compte (souvent restées en headless).
try {
  document.querySelectorAll('[role="dialog"], dialog').forEach((el) => {
    const t = (el.textContent || '').slice(0, 800);
    if (
      /compte|connecter|connexion|adresse e-mail|cr[ée]er un compte|m'identifier|m'inscrire|s'inscrire|inscription|identifiant|mot de passe|continuer avec google|continuer avec apple|pay\s*pal/i.test(
        t
      )
    ) {
      try { el.remove(); } catch (e) {}
    }
  });
} catch (e) {}

// 5) Re-enable body scroll in case an overlay locked it.
document.documentElement.style.overflow = '';
document.body.style.overflow = '';
document.documentElement.style.position = '';
document.body.style.position = '';

// 5b) CDNs e-commerce (ex. Williams-Sonoma) bloquent souvent les <img> si
// le Referer n’est pas leur propre site — en iframe /snapshots/ sur localhost
// on obtient des tuiles vides. « no-referrer » aligne le comportement sur
// l’onglet de navigation.
(function () {
    let m = document.getElementById('__snap_referrer__');
    if (!m) {
        m = document.createElement('meta');
        m.id = '__snap_referrer__';
        m.setAttribute('name', 'referrer');
        m.setAttribute('content', 'no-referrer');
        document.head.insertBefore(m, document.head.firstChild);
    }
    document.querySelectorAll('img').forEach((img) => {
        try {
            img.setAttribute('referrerpolicy', 'no-referrer');
        } catch (e) {}
    });
})();

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

// 8) Fix carousel/slider positions so product images are visible in the iframe
// without JavaScript. Common carousels (Hooper, Swiper, Slick, Glide, Splide)
// freeze their track transform in an arbitrary scroll state. Resetting to
// translate(0,0) makes the first slide (which holds the product image in clone-based
// infinite-scroll carousels) visible inside the overflow:hidden container.
try {
    const carouselFix = document.createElement('style');
    carouselFix.id = '__carousel_position_fix__';
    carouselFix.textContent = (
        '.hooper-track,.swiper-wrapper,.slick-track,' +
        '.glide__slides,.splide__list,.flickity-slider' +
        '{transform:translate(0,0)!important;transition:none!important;left:0!important;}'
    );
    document.head.appendChild(carouselFix);
} catch(e) {}

return {
    html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
    title: document.title || '',
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
};
"""
)


# Reset carousel/slider tracks to their initial (leftmost) position before
# collecting images. Sites like Williams-Sonoma use Hooper/Swiper carousels
# where the track transform is frozen mid-scroll, pushing product images
# off-screen. Resetting to translate(0,0) makes the first slide visible so
# COLLECT/PRUNE/FREEZE all operate on an image-correct DOM state.
CAROUSEL_RESET_JS = r"""
(function resetCarousels() {
    try {
        // Reset track transforms for the most common slider libraries.
        document.querySelectorAll(
            '.hooper-track,.swiper-wrapper,.slick-track,' +
            '.glide__slides,.splide__list,.flickity-slider'
        ).forEach(function (track) {
            track.style.setProperty('transform', 'translate(0,0)', 'important');
            track.style.setProperty('transition', 'none', 'important');
            track.style.setProperty('left', '0', 'important');
        });
        // Clear any negative left set directly on individual slides.
        document.querySelectorAll(
            '.hooper-slide,.swiper-slide,.slick-slide,.glide__slide,.splide__slide'
        ).forEach(function (slide) {
            if (slide.style.left && parseFloat(slide.style.left) < 0) {
                slide.style.removeProperty('left');
            }
            slide.style.setProperty('transition', 'none', 'important');
        });
    } catch(_) {}
})();
"""

# JavaScript that returns every visible <img> with its absolute position,
# ordered top→bottom, left→right. We keep only images large enough to be
# plausible product visuals (min dimensions) and resolve URLs to absolute.
COLLECT_IMAGES_JS = (
    r"""
const minSide = arguments[0] || 80;
const baseUrl = window.location.href;
"""
    + IMG_URL_RESOLUTION_JS
    + r"""
const items = [];
const imgs = [...document.querySelectorAll('img')];
for (const img of imgs) {
    const raw = pickProductImageUrl(img, baseUrl);
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
)


# Retire du DOM les visuels hors du plafond (ordre identique à COLLECT_IMAGES_JS),
# puis limite la hauteur du document pour l’iframe (évite 300+ images / page infinie).
PRUNE_CATALOG_IMAGES_JS = (
    r"""
const minSide = Math.max(1, arguments[0] || 80);
const keepN = Math.max(1, Math.min(200, arguments[1] || 50));
const baseUrl = window.location.href;
"""
    + IMG_URL_RESOLUTION_JS
    + r"""
const items = [];
const imgs = [...document.querySelectorAll('img')];
for (const img of imgs) {
    const raw = pickProductImageUrl(img, baseUrl);
    if (!raw) continue;
    let src;
    try { src = new URL(raw, baseUrl).href; } catch (e) { continue; }
    if (!/^https?:\/\//i.test(src)) continue;
    const rect = img.getBoundingClientRect();
    const w = rect.width || img.naturalWidth || 0;
    const h = rect.height || img.naturalHeight || 0;
    if (w < minSide || h < minSide) continue;
    items.push({
        el: img,
        src,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
    });
}
const seen = new Set();
const deduped = [];
for (const it of items) {
    if (seen.has(it.src)) continue;
    seen.add(it.src);
    deduped.push(it);
}
deduped.sort((a, b) => a.top - b.top || a.left - b.left);
const head = deduped.slice(0, keepN);
const keepEls = new Set(head.map((d) => d.el));
let maxBottom = 0;
for (const d of head) {
    const r = d.el.getBoundingClientRect();
    const b = r.bottom + window.scrollY;
    if (b > maxBottom) maxBottom = b;
}
for (const it of items) {
    if (keepEls.has(it.el) || !it.el.isConnected) continue;
    const p = it.el.parentElement;
    if (p && p.tagName === 'PICTURE') {
        try { p.remove(); } catch (e) {}
    } else {
        try { it.el.remove(); } catch (e) {}
    }
}
const cut = Math.max(520, maxBottom + 300);
const prev = document.getElementById('__catalog_snap_height_cap__');
if (prev) try { prev.remove(); } catch (e) {}
const st = document.createElement('style');
st.id = '__catalog_snap_height_cap__';
st.textContent = 'html, body { overflow-x: hidden !important; min-height: 0 !important; max-height: '
    + cut + 'px !important; overflow-y: hidden !important; }';
document.head.appendChild(st);
return cut;
"""
)


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
    scroll_pause: float = SCROLL_PAUSE_DEFAULT,
    min_image_side: int = 80,
    debug_scroll: bool = False,
    ready_timeout: int = 25,
    max_catalog_images: int = MAX_CATALOG_IMAGES_DEFAULT,
) -> SnapshotResult:
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)
    try:
        _apply_stealth_scripts(driver)
        print(f"[SNAPSHOT] Ouverture: {url}")
        driver.get(url)
        WebDriverWait(driver, ready_timeout).until(
            lambda d: d.execute_script("return document.readyState")
            in {"interactive", "complete"}
        )
        time.sleep(POST_READY_STATE_SETTLE_S)

        dismiss_popups(driver)
        dismiss_modals(driver, per_xpath_timeout=0.45, rounds=1)
        ensure_on_target_url(driver, url, ready_timeout, "après modales")

        WebDriverWait(driver, ready_timeout).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img"))
        )

        print(
            "[SNAPSHOT] Scroll progressif pour lazy-load "
            f"(plafond {max_catalog_images} image(s) unique(s))…",
            flush=True,
        )
        progressive_scroll(
            driver,
            max_scroll_steps,
            scroll_pause,
            debug_scroll,
            min_image_side=min_image_side,
            max_deduped_images=max_catalog_images,
        )
        dismiss_popups(driver, timeout=2)
        press_escape(driver, times=1)
        dismiss_modals(driver, per_xpath_timeout=0.4, rounds=1)
        ensure_on_target_url(driver, url, ready_timeout, "après scroll")

        # Reset any frozen carousel scroll positions so product images are visible.
        driver.execute_script(CAROUSEL_RESET_JS)
        time.sleep(0.3)

        print(
            f"[SNAPSHOT] Prune catalogue (max {max_catalog_images} visuels) + collecte…",
            flush=True,
        )
        driver.execute_script(
            PRUNE_CATALOG_IMAGES_JS, min_image_side, max_catalog_images
        )
        raw_images = driver.execute_script(COLLECT_IMAGES_JS, min_image_side) or []
        raw_images = raw_images[:max_catalog_images]
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
