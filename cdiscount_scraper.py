from __future__ import annotations

import argparse
import csv
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import urlretrieve

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


DEFAULT_START_URL = (
    "https://www.cdiscount.com/corner/op/operation/operation-plein-air/"
    "v-141210809-141210809.html#cm_sp=overlayer:jardin"
)


@dataclass
class CategoryCard:
    index: int
    name: str
    source_url: str
    preview_image_url: str


@dataclass
class ImageRecord:
    global_index: int
    category_index: int
    category_name: str
    category_url: str
    image_index_in_category: int
    image_url: str
    alt: str
    product_name: str
    current_price: str
    old_price: str
    discount: str
    rating: str
    review_count: str
    shipping_info: str
    card_text: str
    top: float
    left: float
    product_url: str
    listing_url: str


def normalize_url(raw_url: str, base_url: str) -> str:
    if not raw_url:
        return ""
    raw_url = raw_url.strip()
    if raw_url.startswith("//"):
        return f"https:{raw_url}"
    return urljoin(base_url, raw_url)


def make_driver(headless: bool) -> webdriver.Chrome:
    options = Options()
    options.page_load_strategy = "eager"
    options.add_argument("--window-size=1920,2000")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    if headless:
        options.add_argument("--headless=new")

    service = Service(executable_path=ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


def dismiss_popups(driver: webdriver.Chrome, timeout: int = 4) -> None:
    popup_xpaths = [
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'tout accepter')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'accepter')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'j’accepte')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'j\\'accepte')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'fermer')]",
    ]
    for xpath in popup_xpaths:
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


def wait_main_page_ready(driver: webdriver.Chrome, timeout: int = 20) -> None:
    WebDriverWait(driver, timeout).until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a[href] img"))
    )


def extract_categories(driver: webdriver.Chrome) -> list[CategoryCard]:
    strict_script = """
        const cards = [];
        const seen = new Set();
        const anchors = [...document.querySelectorAll("a[href*='/corner/op/operation/operation-plein-air/'][href*='/l-']")];
        for (const a of anchors) {
            const card = a.querySelector(".o-card__image");
            if (!card) continue;
            const img = a.querySelector("img[alt][src], img[alt][data-src], img[alt][data-lazy-src]");
            if (!img) continue;
            const href = new URL(a.getAttribute("href"), window.location.origin).href;
            const title = (img.getAttribute("alt") || "").trim();
            const src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
            const key = `${href}|${title.toLowerCase()}`;
            if (!href || !src || seen.has(key)) continue;
            seen.add(key);
            cards.push({ href, title, preview: src });
        }
        return cards;
    """
    fallback_script = """
        const cards = [];
        const seen = new Set();
        const anchors = [...document.querySelectorAll("a[href]")];
        for (const a of anchors) {
            const img = a.querySelector("img[alt][src], img[alt][data-src], img[alt][data-lazy-src]");
            if (!img) continue;
            const href = new URL(a.getAttribute("href"), window.location.origin).href;
            if (!href.includes("cdiscount.com")) continue;
            if (!(/\\/l-\\d+/.test(href) || /\\/b-\\d+/.test(href) || href.includes("/corner/op/operation/operation-plein-air/"))) continue;
            const rect = a.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 80) continue;
            const title = (img.getAttribute("alt") || a.textContent || "").trim();
            const src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
            const key = `${href}|${title.toLowerCase()}`;
            if (!href || !src || seen.has(key)) continue;
            seen.add(key);
            cards.push({ href, title, preview: src });
        }
        return cards;
    """

    raw_cards = driver.execute_script(strict_script)
    if not raw_cards:
        raw_cards = driver.execute_script(fallback_script)

    categories: list[CategoryCard] = []
    for idx, item in enumerate(raw_cards, start=1):
        source_url = normalize_url(item.get("href", ""), driver.current_url)
        preview_url = normalize_url(item.get("preview", ""), driver.current_url)
        name = (item.get("title") or f"categorie_{idx}").strip()
        if not source_url or not preview_url:
            continue
        categories.append(
            CategoryCard(
                index=idx,
                name=name,
                source_url=source_url,
                preview_image_url=preview_url,
            )
        )
    return categories


def maybe_resolve_listing_url(
    driver: webdriver.Chrome, category: CategoryCard
) -> tuple[str, str]:
    current_url = driver.current_url
    if re.search(r"/b-\d+", current_url):
        return current_url, current_url

    listing_candidates = driver.execute_script(
        """
        const links = [...document.querySelectorAll("a[href*='/b-']")];
        const unique = [];
        const seen = new Set();
        for (const a of links) {
            const href = new URL(a.getAttribute("href"), window.location.origin).href;
            if (seen.has(href)) continue;
            seen.add(href);
            const rect = a.getBoundingClientRect();
            unique.push({
                href,
                visible: rect.width > 0 && rect.height > 0,
                top: rect.top + window.scrollY,
                text: (a.textContent || "").trim()
            });
        }
        unique.sort((x, y) => x.top - y.top);
        return unique;
        """
    )

    if not listing_candidates:
        return current_url, current_url

    category_tokens = {
        token.lower()
        for token in re.split(r"[^a-zA-Z0-9]+", category.name)
        if len(token) >= 3
    }
    best_url = current_url
    best_score = -1
    for candidate in listing_candidates:
        text = (candidate.get("text") or "").lower()
        score = sum(1 for token in category_tokens if token in text)
        if candidate.get("visible"):
            score += 1
        if score > best_score:
            best_score = score
            best_url = candidate.get("href", current_url)

    if best_url and best_url != current_url:
        driver.get(best_url)
        dismiss_popups(driver)
        return current_url, driver.current_url
    return current_url, current_url


def collect_visible_product_images(
    driver: webdriver.Chrome, viewport_margin_ratio: float
) -> list[dict[str, Any]]:
    raw_items = driver.execute_script(
        """
        const viewportMarginRatio = arguments[0];
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();

        const firstText = (root, selectors) => {
            if (!root) return "";
            for (const sel of selectors) {
                const node = root.querySelector(sel);
                if (!node) continue;
                const text = normalize(node.textContent || node.getAttribute("content") || "");
                if (text) return text;
            }
            return "";
        };

        const normalizeMoney = (text) => {
            const m = normalize(text).match(/(\\d{1,4}(?:[ .]\\d{3})*(?:[.,]\\d{2})?)\\s*€/);
            return m ? `${m[1]} €` : "";
        };

        const collectPriceCandidates = (root) => {
            if (!root) return [];
            const out = [];
            const seen = new Set();
            const nodes = [...root.querySelectorAll("*")];
            for (const node of nodes) {
                const text = normalize(node.textContent);
                if (!text || text.length > 30) continue;
                if (!text.includes("€") || !/\\d/.test(text)) continue;
                const money = normalizeMoney(text);
                if (!money || seen.has(money)) continue;
                seen.add(money);
                out.push({
                    text: money,
                    raw: text,
                    cls: (node.className || "").toString().toLowerCase()
                });
            }
            return out;
        };

        const extractMoneyFromText = (text) => {
            const results = [];
            const re = /(\\d{1,4}(?:[ .]\\d{3})*(?:[.,]\\d{2})?)\\s*€/g;
            let m;
            while ((m = re.exec(text || "")) !== null) {
                const value = `${m[1]} €`;
                if (results[results.length - 1] !== value) {
                    results.push(value);
                }
            }
            return results;
        };

        const pickCurrentAndOldPrice = (prices, cardText) => {
            let current = "";
            let old = "";
            for (const price of prices) {
                const isOld = /(bar|old|strike|cross|ancien|avant|comparaison|conseille|was)/.test(price.cls) ||
                    /(ancien|comparaison|conseille|avant)/.test(price.raw.toLowerCase());
                const isCurrent = /(price|prix|promo|sale|final|amount|deal)/.test(price.cls);
                if (!old && isOld) {
                    old = price.text;
                    continue;
                }
                if (!current && isCurrent) {
                    current = price.text;
                }
            }

            if (!current && prices.length >= 1) {
                current = prices[0].text;
            }

            const moneyInCard = extractMoneyFromText(cardText);
            if (!current && moneyInCard.length) {
                current = moneyInCard[moneyInCard.length - 1];
            }
            if (!old && moneyInCard.length >= 2) {
                old = moneyInCard[0];
            }

            if (current && old && current === old && moneyInCard.length >= 2) {
                current = moneyInCard[moneyInCard.length - 1];
                old = moneyInCard[0];
            }
            return { current, old };
        };

        const parseDiscount = (text) => {
            const m = (text || "").match(/-\\s?\\d{1,2}\\s?%/);
            return m ? m[0].replace(/\\s+/g, "") : "";
        };

        const parseRating = (text) => {
            let m = (text || "").match(/(\\d(?:[.,]\\d)?)\\s*\\/\\s*5/);
            if (m) return m[1].replace(",", ".");
            m = (text || "").match(/(\\d(?:[.,]\\d)?)\\s*sur\\s*5/i);
            if (m) return m[1].replace(",", ".");
            return "";
        };

        const parseReviewCount = (text) => {
            let m = (text || "").match(/(?:^|[^\\d])(\\d{1,6})\\s*avis/i);
            if (m) return m[1];
            m = (text || "").match(/\\((\\d{1,6})\\)/);
            if (m) return m[1];
            return "";
        };

        const parseShippingInfo = (text) => {
            const normalized = normalize(text);
            let m = normalized.match(/(Livraison[^.]{0,40})/i);
            if (m) return normalize(m[1]);
            m = normalized.match(/(Livr[eé][^.]{0,40})/i);
            if (m) return normalize(m[1]);
            m = normalized.match(/(Retrait[^.]{0,40})/i);
            if (m) return normalize(m[1]);
            return "";
        };

        const viewTop = window.scrollY;
        const viewBottom = viewTop + Math.floor(window.innerHeight * (1 + viewportMarginRatio));

        const items = [];
        const imgs = [...document.querySelectorAll("img")];
        for (const img of imgs) {
            const srcRaw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
            if (!srcRaw) continue;
            const src = srcRaw.startsWith("//") ? `https:${srcRaw}` : new URL(srcRaw, window.location.origin).href;
            if (!(src.includes("/pdt2/") || src.includes("/pdt/") || src.includes("/rw/"))) continue;
            const card = img.closest("article, li, [data-testid*='product'], [class*='product'], [class*='prd'], [class*='card']");
            const container = card || img.closest("a") || img.parentElement;
            const rect = (container || img).getBoundingClientRect();
            if (rect.width < 120 || rect.height < 120) continue;
            const top = rect.top + window.scrollY;
            const left = rect.left + window.scrollX;
            if (top < viewTop - 120 || top > viewBottom) continue;
            const alt = normalize(img.getAttribute("alt") || "");
            const linkNode = (container && container.querySelector("a[href]")) || img.closest("a[href]");
            const productUrl = linkNode ? new URL(linkNode.getAttribute("href"), window.location.origin).href : "";
            const cardText = normalize((container && container.innerText) || "");
            const productName =
                alt ||
                firstText(container, ["h2", "h3", "[class*='title']", "[class*='label']", "[title]"]);
            const priceCandidates = collectPriceCandidates(container || img.parentElement || document.body);
            const pickedPrices = pickCurrentAndOldPrice(priceCandidates, cardText);
            const discount = parseDiscount(cardText);
            const rating = parseRating(cardText);
            const reviewCount = parseReviewCount(cardText);
            const shippingFromSelectors = firstText(container, [
                "[class*='ship']",
                "[class*='delivery']",
                "[class*='livr']",
                "[class*='exped']",
                "[class*='stock']"
            ]);
            const shippingInfo = shippingFromSelectors || parseShippingInfo(cardText);
            items.push({
                src,
                alt,
                product_name: productName,
                current_price: pickedPrices.current,
                old_price: pickedPrices.old,
                discount,
                rating,
                review_count: reviewCount,
                shipping_info: shippingInfo,
                card_text: cardText.slice(0, 1200),
                top,
                left,
                product_url: productUrl
            });
        }
        items.sort((a, b) => a.top - b.top || a.left - b.left);
        return items;
        """,
        viewport_margin_ratio,
    )
    return raw_items or []


def scrape_category_images(
    driver: webdriver.Chrome,
    category: CategoryCard,
    max_scrolls: int,
    scroll_pause: float,
    min_scrolls: int,
    viewport_margin_ratio: float,
    debug_scroll: bool,
) -> tuple[str, list[dict[str, Any]]]:
    driver.get(category.source_url)
    dismiss_popups(driver)

    _, listing_url = maybe_resolve_listing_url(driver, category)
    dismiss_popups(driver)

    WebDriverWait(driver, 20).until(
        lambda d: d.execute_script("return document.readyState") in {"interactive", "complete"}
    )
    driver.execute_script("window.scrollTo(0, 0);")

    seen: set[str] = set()
    collected: list[dict[str, Any]] = []
    stagnation = 0

    for step in range(max_scrolls):
        batch = collect_visible_product_images(
            driver, viewport_margin_ratio=viewport_margin_ratio
        )
        new_items = 0
        for item in batch:
            src = item["src"]
            dedupe_key = f"{item.get('product_url', '')}|{src}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            item["capture_rank"] = len(collected) + 1
            collected.append(item)
            new_items += 1

        if new_items == 0:
            stagnation += 1
        else:
            stagnation = 0

        at_bottom = driver.execute_script(
            "return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 4);"
        )
        prev_y = driver.execute_script("return window.scrollY;")
        driver.execute_script(
            """
            const delta = Math.floor(window.innerHeight * 0.88);
            window.scrollTo({ top: window.scrollY + delta, behavior: "auto" });
            """
        )
        time.sleep(scroll_pause)
        new_y = driver.execute_script("return window.scrollY;")

        if debug_scroll:
            print(
                f"[SCROLL] {category.name} step={step + 1}/{max_scrolls} "
                f"y={int(prev_y)}->{int(new_y)} new={new_items} total={len(collected)} "
                f"bottom={at_bottom} stagnation={stagnation}"
            )

        if new_y == prev_y:
            stagnation += 1

        if step + 1 < max(min_scrolls, 1):
            continue

        if at_bottom and stagnation >= 2:
            break
        if stagnation >= 6:
            break

    collected.sort(key=lambda item: (item["top"], item["left"], item["capture_rank"]))
    return listing_url, collected


def slugify(value: str) -> str:
    lowered = value.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or "categorie"


def download_images(
    records: list[ImageRecord],
    output_dir: Path,
    delay_seconds: float,
) -> None:
    download_root = output_dir / "downloads"
    download_root.mkdir(parents=True, exist_ok=True)

    for record in records:
        category_folder = (
            download_root
            / f"{record.category_index:03d}_{slugify(record.category_name)}"
        )
        category_folder.mkdir(parents=True, exist_ok=True)

        parsed = urlparse(record.image_url)
        suffix = Path(parsed.path).suffix or ".jpg"
        file_path = category_folder / f"{record.image_index_in_category:05d}{suffix}"

        if file_path.exists():
            continue
        try:
            urlretrieve(record.image_url, file_path)
            if delay_seconds > 0:
                time.sleep(delay_seconds)
        except Exception:
            continue


def write_outputs(
    categories: list[CategoryCard],
    records: list[ImageRecord],
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    categories_path = output_dir / "categories.json"
    categories_payload = [asdict(category) for category in categories]
    categories_path.write_text(
        json.dumps(categories_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    records_json_path = output_dir / "images.json"
    records_json_path.write_text(
        json.dumps([asdict(record) for record in records], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    csv_path = output_dir / "images.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "global_index",
                "category_index",
                "category_name",
                "category_url",
                "image_index_in_category",
                "image_url",
                "alt",
                "product_name",
                "current_price",
                "old_price",
                "discount",
                "rating",
                "review_count",
                "shipping_info",
                "card_text",
                "top",
                "left",
                "product_url",
                "listing_url",
            ],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scrape les images Cdiscount dans l'ordre vertical "
            "(haut vers bas) catégorie par catégorie."
        )
    )
    parser.add_argument("--start-url", default=DEFAULT_START_URL)
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--max-categories", type=int, default=0)
    parser.add_argument("--max-scrolls-per-category", type=int, default=180)
    parser.add_argument("--scroll-pause", type=float, default=0.8)
    parser.add_argument(
        "--min-scrolls-per-category",
        type=int,
        default=8,
        help="Force au moins N scrolls visibles par catégorie.",
    )
    parser.add_argument(
        "--viewport-margin-ratio",
        type=float,
        default=0.5,
        help=(
            "Collecte autour du viewport: 0.5 = viewport + 50% en dessous "
            "(évite de tout prendre d'un coup)."
        ),
    )
    parser.add_argument(
        "--debug-scroll",
        action="store_true",
        help="Affiche le détail des étapes de scroll dans le terminal.",
    )
    parser.add_argument("--headless", action="store_true")
    parser.add_argument(
        "--category-filter",
        default="",
        help="Filtre regex appliqué au nom de catégorie.",
    )
    parser.add_argument(
        "--download-images",
        action="store_true",
        help="Télécharge localement les images indexées.",
    )
    parser.add_argument(
        "--download-delay-seconds",
        type=float,
        default=0.02,
        help="Pause entre téléchargements (en secondes).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()

    print(f"[INFO] URL de départ: {args.start_url}")
    print(f"[INFO] Sortie: {output_dir}")
    print(f"[INFO] Mode headless: {args.headless}")

    driver = make_driver(headless=args.headless)
    all_records: list[ImageRecord] = []
    selected_categories: list[CategoryCard] = []
    global_index = 1

    try:
        driver.get(args.start_url)
        wait_main_page_ready(driver)
        dismiss_popups(driver)

        categories = extract_categories(driver)
        if args.category_filter:
            regex = re.compile(args.category_filter, re.IGNORECASE)
            categories = [cat for cat in categories if regex.search(cat.name)]

        if args.max_categories > 0:
            categories = categories[: args.max_categories]

        if not categories:
            raise RuntimeError("Aucune catégorie détectée sur la page jardin.")

        print(f"[INFO] Catégories détectées: {len(categories)}")

        for cat_pos, category in enumerate(categories, start=1):
            print(
                f"[INFO] [{cat_pos}/{len(categories)}] Catégorie: "
                f"{category.name} -> {category.source_url}"
            )
            try:
                listing_url, raw_images = scrape_category_images(
                    driver=driver,
                    category=category,
                    max_scrolls=args.max_scrolls_per_category,
                    scroll_pause=args.scroll_pause,
                    min_scrolls=args.min_scrolls_per_category,
                    viewport_margin_ratio=args.viewport_margin_ratio,
                    debug_scroll=args.debug_scroll,
                )
            except Exception as exc:
                print(f"[WARN] Impossible de scraper '{category.name}': {exc}")
                continue

            if not raw_images:
                print(f"[WARN] Aucune image trouvée pour '{category.name}'.")
                continue

            selected_categories.append(category)
            for idx_in_cat, image in enumerate(raw_images, start=1):
                all_records.append(
                    ImageRecord(
                        global_index=global_index,
                        category_index=category.index,
                        category_name=category.name,
                        category_url=category.source_url,
                        image_index_in_category=idx_in_cat,
                        image_url=image["src"],
                        alt=image.get("alt", ""),
                        product_name=image.get("product_name", ""),
                        current_price=image.get("current_price", ""),
                        old_price=image.get("old_price", ""),
                        discount=image.get("discount", ""),
                        rating=image.get("rating", ""),
                        review_count=image.get("review_count", ""),
                        shipping_info=image.get("shipping_info", ""),
                        card_text=image.get("card_text", ""),
                        top=float(image.get("top", 0.0)),
                        left=float(image.get("left", 0.0)),
                        product_url=image.get("product_url", ""),
                        listing_url=listing_url,
                    )
                )
                global_index += 1

            print(f"[INFO] {len(raw_images)} images indexées pour '{category.name}'.")

        if not all_records:
            raise RuntimeError("Aucune image produit n'a été collectée.")

        write_outputs(selected_categories, all_records, output_dir)
        print(f"[INFO] Données écrites dans: {output_dir}")
        print(f"[INFO] Total images indexées: {len(all_records)}")

        if args.download_images:
            print("[INFO] Téléchargement des images en cours...")
            download_images(all_records, output_dir, args.download_delay_seconds)
            print("[INFO] Téléchargement terminé.")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
