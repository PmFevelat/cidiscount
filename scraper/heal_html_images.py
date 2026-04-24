"""Réparation LQIP / data-srcset / srcset sur des fichiers HTML de snapshot (hors navigateur).

Aligné sur ``IMG_URL_RESOLUTION_JS`` dans :mod:`scraper.snapshot_site`. Aucune dépendance.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

_LAZY_URL_ATTRS = (
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-ll-src",
    "data-url",
    "data-full",
    "data-large",
    "data-zoom",
)


def _is_data_or_blob(s: str | None) -> bool:
    if not s:
        return True
    t = s.strip()
    return t.startswith("data:") or t.startswith("blob:")


def _looks_http(u: str) -> bool:
    t = (u or "").strip()
    if not t:
        return False
    if t.startswith("//"):
        return bool(urlparse("https:" + t).netloc)
    return bool(re.match(r"^https?://", t, re.I))


def _abs_url(u: str, base: str) -> str:
    t = (u or "").strip()
    if t.startswith("//"):
        return "https:" + t
    if _looks_http(t):
        return t
    return urljoin(base, t)


def _score_descriptor(seg: str) -> float:
    s = (seg or "").strip().lower()
    if re.fullmatch(r"\d+w", s):
        return float(s[:-1])
    m = re.fullmatch(r"(\d+(?:\.\d+)?)x", s, re.I)
    if m:
        return float(m.group(1)) * 1000.0
    return 0.0


def best_http_url_from_srcset_string(raw: str) -> str:
    if not raw or not str(raw).strip():
        return ""
    best = ""
    best_score = -1.0
    for i, part in enumerate(str(raw).split(",")):
        segs = part.strip().split()
        if not segs:
            continue
        u0 = segs[0]
        if u0.startswith("//"):
            absu = "https:" + u0
        elif re.match(r"^https?://", u0, re.I):
            absu = u0
        else:
            continue
        score = 0.0
        if len(segs) > 1:
            score = _score_descriptor(segs[1])
        if score == 0.0:
            score = 1.0 + i * 0.01
        if score >= best_score:
            best_score = score
            best = absu
    return best


def _extract_quoted_attr(tag: str, name: str) -> str:
    """Valeur d’attribut entre guillemets (y compris retours ligne — ex. data-srcset WS)."""
    m = re.search(
        rf'{re.escape(name)}\s*=\s*"([\s\S]*?)"',
        tag,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)
    m2 = re.search(
        rf"{re.escape(name)}\s*=\s*'([\s\S]*?)'",
        tag,
        re.IGNORECASE,
    )
    if m2:
        return m2.group(1)
    return ""


def _combined_srcset_from_img_tag(tag: str) -> str:
    parts: list[str] = []
    for n in (
        "srcset",
        "data-srcset",
        "data-lazy-srcset",
        "data-src-set",
    ):
        v = _extract_quoted_attr(tag, n)
        if v.strip():
            parts.append(v.strip())
    return ", ".join(parts)


def _pick_url_from_img_opening_tag(tag: str, base: str) -> str:
    combined = _combined_srcset_from_img_tag(tag)
    from_set = best_http_url_from_srcset_string(combined) if combined else ""
    src = _extract_quoted_attr(tag, "src")
    if from_set and (_is_data_or_blob(src) or not _looks_http(src)):
        return from_set
    if not _is_data_or_blob(src) and _looks_http(src):
        return _abs_url(src, base)
    if from_set:
        return from_set
    for n in _LAZY_URL_ATTRS:
        v = _extract_quoted_attr(tag, n)
        if v and not _is_data_or_blob(v):
            a = _abs_url(v, base)
            if _looks_http(a):
                return a
    if src and not _is_data_or_blob(src):
        return _abs_url(src, base)
    return ""


def heal_lazy_images_in_html(html: str, base_hint: str | None = None) -> str:
    """
    Sur chaque ``<img ...>`` : si ``src`` est un LQIP (``data:``) ou si ``data-srcset`` /
    ``srcset`` contient des URL https, imposer ``src`` sur la meilleure URL extraite.
    """
    if not html:
        return html
    mb = re.search(
        r'(?i)<base\s[^>]*\bhref\s*=\s*["\']([^"\'>]+)',
        html,
    )
    base = (base_hint or (mb.group(1).strip() if mb else "") or "https://example.com/").strip()

    def _one_img(m: re.Match[str]) -> str:
        tag = m.group(0)
        chosen = _pick_url_from_img_opening_tag(tag, base)
        if not chosen:
            return tag
        combined = _combined_srcset_from_img_tag(tag)
        from_set = best_http_url_from_srcset_string(combined) if combined else ""
        src = _extract_quoted_attr(tag, "src")
        if src == chosen:
            t2 = tag
        else:
            if _looks_http(src) and not _is_data_or_blob(src) and not (
                from_set and _is_data_or_blob(src)
            ):
                return tag
            t2 = re.sub(
                r'\bsrc\s*=\s*"[^"]*"',
                f'src="{chosen}"',
                tag,
                count=1,
            )
            if t2 == tag:
                t2 = re.sub(
                    r"\bsrc\s*=\s*'[^']*'",
                    f"src='{chosen}'",
                    tag,
                    count=1,
                )
        for attr in ("data-srcset", "data-lazy-srcset", "data-src-set"):
            t2 = re.sub(
                rf"\s{re.escape(attr)}\s*=\s*(['\"])[\s\S]*?\\1",
                "",
                t2,
                count=1,
                flags=re.IGNORECASE,
            )
        if re.search(r'\bsrc="https?://', t2, re.I) and re.search(
            r"\ssrcset\s*=", t2, re.I
        ):
            t2 = re.sub(
                r'\s+srcset\s*=\s*(["\'])[\s\S]*?\1',
                "",
                t2,
                count=1,
                flags=re.IGNORECASE,
            )
        return t2

    return re.sub(r"<img\b[\s\S]*?>", _one_img, html, flags=re.IGNORECASE)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("html_path", type=Path)
    p.add_argument("--base-url", default="")
    args = p.parse_args()
    path = args.html_path.expanduser().resolve()
    raw = path.read_text(encoding="utf-8")
    path.write_text(
        heal_lazy_images_in_html(raw, base_hint=args.base_url or None),
        encoding="utf-8",
    )
    print(f"[HEAL] {path}")


if __name__ == "__main__":
    main()
