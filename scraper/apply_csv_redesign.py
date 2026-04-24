"""Apply a user-provided mapping CSV
to a captured original.html, producing redesign.html with images swapped.

Matching strategy:
  1. Exact URL match (fast path).
  2. Basename match: same filename (e.g. '<uuid>_L_NOPAD.jpg') on a different
     CDN subdomain / path prefix. Very common (site's rendered HTML uses
     'rakuten.com/pictures/...' while the CSV has 'images.rakuten.com/pictures/...').
  3. Stem match: same filename stripped of its size suffix — for example
     '<uuid>_L_NOPAD' matches any of '_S_NOPAD', '_M_NOPAD', etc.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from urllib.parse import urlparse

from scraper.heal_html_images import heal_lazy_images_in_html

GREY_PLACEHOLDER = (
    "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'"
    "%20width%3D'1'%20height%3D'1'%3E%3Crect%20fill%3D'%23808080'"
    "%20width%3D'1'%20height%3D'1'%2F%3E%3C%2Fsvg%3E"
)

# Injecté si absent (CDNs e-commerce + iframe localhost, cf. FREEZE 5b dans snapshot_site).
REFERRER_META_SNIPPET = (
    '<meta id="__snap_referrer__" name="referrer" content="no-referrer" />'
)


def ensure_referrer_meta_in_html(html: str) -> str:
    """Garantit no-referrer sur le document (charge des images sur CDN stricts)."""
    if "__snap_referrer__" in html:
        return html
    m = re.search(r"(?i)<head[^>]*>", html)
    if not m:
        return html
    return html[: m.end()] + "\n" + REFERRER_META_SNIPPET + "\n" + html[m.end() :]


SIZE_SUFFIX_RE = re.compile(r"_[A-Z]+_NOPAD$", re.IGNORECASE)
OLD_URL_KEYS = (
    "former_image_url",
    "original_image_url",
    "former_media_url",
    "original_media_url",
    "former_video_url",
    "original_video_url",
)
NEW_URL_KEYS = (
    "new_image_url",
    "processed_image_url",
    "new_media_url",
    "processed_media_url",
    "new_video_url",
    "processed_video_url",
)


def load_mapping(csv_path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = {c.strip() for c in (reader.fieldnames or [])}
        has_old_col = any(key in fieldnames for key in OLD_URL_KEYS)
        has_new_col = any(key in fieldnames for key in NEW_URL_KEYS)
        if not (has_old_col and has_new_col):
            raise ValueError(
                "Le CSV doit contenir une colonne source et une colonne cible parmi: "
                "former_image_url/new_image_url, "
                "original_image_url/processed_image_url, "
                "former_media_url/new_media_url, "
                "former_video_url/new_video_url. "
                f"Colonnes trouvées: {reader.fieldnames}"
            )
        for row in reader:
            original = ""
            processed = ""
            for key in OLD_URL_KEYS:
                original = (row.get(key) or "").strip()
                if original:
                    break
            for key in NEW_URL_KEYS:
                processed = (row.get(key) or "").strip()
                if processed:
                    break
            if not original:
                continue
            if not processed:
                processed = GREY_PLACEHOLDER
            pairs.append((original, processed))
    return pairs


def _basename(url: str) -> str:
    path = urlparse(url).path
    return path.rsplit("/", 1)[-1]


def _stem(url: str) -> str:
    """Filename without its size suffix (`_L_NOPAD`, `_M_NOPAD`, ...) and
    without extension. Useful for matching different size variants of the
    same image."""
    name = _basename(url)
    name, _, _ext = name.rpartition(".")
    name = name or _ext
    name = SIZE_SUFFIX_RE.sub("", name)
    return name


def apply_replacements(
    html: str, mapping: list[tuple[str, str]]
) -> tuple[str, dict[str, int]]:
    """Return (new_html, stats) where stats contains counts per strategy."""
    stats = {"exact": 0, "basename": 0, "stem": 0, "pairs_matched": 0}
    out = html

    # 1) Exact URL match (longest first to avoid prefix collisions).
    pending: list[tuple[str, str]] = []
    for original, processed in sorted(mapping, key=lambda p: len(p[0]), reverse=True):
        if original in out:
            count = out.count(original)
            out = out.replace(original, processed)
            stats["exact"] += count
            stats["pairs_matched"] += 1
        else:
            pending.append((original, processed))

    # 2) Basename match: replace any URL ending with the original's basename.
    still_pending: list[tuple[str, str]] = []
    for original, processed in pending:
        bn = _basename(original)
        if not bn:
            still_pending.append((original, processed))
            continue
        pattern = re.compile(
            r"https?://[^\s\"'<>]*?/" + re.escape(bn),
            re.IGNORECASE,
        )
        matches = pattern.findall(out)
        if matches:
            out, n = pattern.subn(lambda _m, repl=processed: repl, out)
            stats["basename"] += n
            stats["pairs_matched"] += 1
        else:
            still_pending.append((original, processed))

    # 3) Stem match: same image ID, different size suffix. Replaces any URL
    # containing the stem followed by _<SIZE>_NOPAD<ext>.
    for original, processed in still_pending:
        stem = _stem(original)
        if not stem or len(stem) < 10:
            continue
        pattern = re.compile(
            r"https?://[^\s\"'<>]*?"
            + re.escape(stem)
            + r"(?:_[A-Z]+_NOPAD)?\.[a-zA-Z0-9]{2,5}",
            re.IGNORECASE,
        )
        matches = pattern.findall(out)
        if matches:
            out, n = pattern.subn(lambda _m, repl=processed: repl, out)
            stats["stem"] += n
            stats["pairs_matched"] += 1

    return out, stats


def apply_csv_to_snapshot(
    original_html_path: Path,
    csv_path: Path,
    output_html_path: Path | None = None,
) -> Path:
    original_html_path = Path(original_html_path)
    csv_path = Path(csv_path)
    if output_html_path is None:
        output_html_path = original_html_path.with_name("redesign.html")
    output_html_path = Path(output_html_path)

    raw = original_html_path.read_text(encoding="utf-8")
    html = ensure_referrer_meta_in_html(heal_lazy_images_in_html(raw))
    if html != raw:
        original_html_path.write_text(html, encoding="utf-8")
        print(
            "[REDESIGN] original.html mis à jour (LQIP / srcset / data-srcset + meta referrer).",
            flush=True,
        )
    mapping = load_mapping(csv_path)
    if not mapping:
        raise ValueError(f"Aucune ligne avec une URL source trouvée dans {csv_path}")

    new_html, stats = apply_replacements(html, mapping)
    output_html_path.write_text(new_html, encoding="utf-8")

    print(
        f"[REDESIGN] {len(mapping)} paires CSV — "
        f"{stats['pairs_matched']} match(ch), "
        f"exact={stats['exact']}, basename={stats['basename']}, stem={stats['stem']} "
        f"→ {output_html_path}"
    )
    return output_html_path
