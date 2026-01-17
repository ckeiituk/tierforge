#!/usr/bin/env python3
"""
Batch fetch infoboxes for all spells from spells.json
"""
import json
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, quote_plus, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://divinityoriginalsin2.wiki.fextralife.com/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DELAY_SECONDS = 0.1


def clean_spell_name(name: str) -> str:
    """Remove ' (Original Sin 2)' suffix from spell name"""
    suffix = " (Original Sin 2)"
    if name.endswith(suffix):
        return name[:-len(suffix)]
    return name


def build_url(spell_name: str, en_url: str | None = None) -> str:
    """Build wiki URL from spell name or use provided en_url"""
    if en_url:
        if en_url.startswith(("http://", "https://")):
            return en_url
        return urljoin(BASE_URL, en_url.lstrip("/"))
    slug = quote_plus(spell_name)
    return urljoin(BASE_URL, slug)


def normalize_urls(container: BeautifulSoup, base_url: str) -> None:
    """Make all URLs absolute"""
    for tag in container.find_all(True):
        for attr in ("href", "src", "data-src", "data-lazy-src"):
            value = tag.get(attr)
            if not value:
                continue
            value = value.strip()
            if value.startswith(("#", "data:", "mailto:", "javascript:")):
                continue
            tag[attr] = urljoin(base_url, value)


def extract_infobox(html: str, base_url: str) -> BeautifulSoup | None:
    """Extract infobox div from wiki page"""
    soup = BeautifulSoup(html, "html.parser")
    selectors = (
        "#wiki-content-block #infobox",
        "#infobox",
        ".infobox",
    )
    for selector in selectors:
        candidate = soup.select_one(selector)
        if candidate:
            normalize_urls(candidate, base_url)
            return candidate
    return None


def extract_icon(infobox: BeautifulSoup) -> str | None:
    """Extract icon URL from infobox"""
    icon_tag = (
        infobox.select_one("th h4 img")
        or infobox.select_one("th img")
        or infobox.select_one("img")
    )
    if icon_tag:
        return icon_tag.get("src")
    return None


def extract_fandom_icon(soup: BeautifulSoup) -> str | None:
    """Extract icon URL from Fandom (ru) infobox"""
    # Try multiple common selectors for DOS2 wiki icons
    selectors = [
        ".portable-infobox .wds-tab__content.wds-is-current .dos2-icon img",
        ".dos2-icon img",
        "aside.portable-infobox img.pi-image-thumbnail",
        ".portable-infobox img",
        "a.image img",
        "img" # Last resort
    ]
    
    for selector in selectors:
        for img in soup.select(selector):
            # We want an image that looks like a skill icon (usually square or having "DOS2" in alt)
            alt = img.get("alt", "")
            src = img.get("data-src") or img.get("src")
            if not src: continue
            
            # Simple heuristic: icons are usually small and square-ish if scaled, 
            # but we just want the first one from the infobox.
            if "DOS2" in alt or "Навык" in alt:
                return prefer_static_wikia_png(src)
            
            # If no better match, just take the first one from a good selector
            if selector != "img":
                return prefer_static_wikia_png(src)
                
    return None


def prefer_static_wikia_png(url: str) -> str:
    """
    Fandom's static CDN often returns WebP for PNG URLs.
    Force PNG so icons render in environments without WebP support.
    """
    parsed = urlparse(url)
    if not parsed.netloc.endswith("static.wikia.nocookie.net"):
        return url

    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params["format"] = "png"
    return urlunparse(parsed._replace(query=urlencode(params)))


def fetch_infobox(session: requests.Session, url: str) -> dict | None:
    """Fetch and parse infobox from URL"""
    try:
        response = session.get(url, timeout=20)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None

    infobox = extract_infobox(response.text, response.url)
    if not infobox:
        print(f"  No infobox found at {url}")
        return None

    return {
        "url": response.url,
        "infobox_html": str(infobox),
        "icon": extract_icon(infobox),
    }

def fetch_ru_icon(session: requests.Session, url: str) -> str | None:
    """Fetch icon URL from ru wiki page"""
    print(f"(RU: {urlparse(url).path.split('/')[-1]})", end=" ", flush=True)
    try:
        response = session.get(url, timeout=20)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error RU icon: {e}", end=" ", flush=True)
        return None

    soup = BeautifulSoup(response.text, "html.parser")
    return extract_fandom_icon(soup)


def load_spells(path: Path, target_school: str | None = None) -> list[dict[str, str | None]]:
    """Load spell names, en_url, and ru_url from spells.json"""
    with path.open() as f:
        data = json.load(f)

    spells = []
    for school_name, school in data.get("schools", {}).items():
        if target_school and school_name != target_school:
            continue
            
        for spell_name, spell_data in school.get("spells", {}).items():
            en_url = None
            ru_url = None
            if isinstance(spell_data, dict):
                en_url = spell_data.get("en_url")
                ru_url = spell_data.get("ru_url")
            spells.append({"name": spell_name, "en_url": en_url, "ru_url": ru_url})

    return spells


def save_infoboxes(path: Path, new_data: dict[str, dict]):
    existing_data = {}
    if path.exists():
        try:
            existing_data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass # Start fresh if corrupted
    
    existing_data.update(new_data)
    
    path.write_text(json.dumps(existing_data, indent=2, ensure_ascii=False), encoding="utf-8")


def main():
    spells_path = Path("/home/meur/vscode/tierforge/data/spells.json")
    output_path = Path("/home/meur/vscode/tierforge/data/infoboxes.json")
    
    if not spells_path.exists():
        print(f"Error: {spells_path} not found")
        return 1
    
    target_school = sys.argv[1] if len(sys.argv) > 1 else None
    spells = load_spells(spells_path, target_school)
    print(f"Found {len(spells)} spells to process (School: {target_school or 'ALL'})")
    
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    
    results = {}
    errors = 0
    
    for i, spell in enumerate(spells, 1):
        spell_name = spell["name"]
        en_url = spell.get("en_url")
        ru_url = spell.get("ru_url")
        
        url = build_url(clean_spell_name(spell_name), en_url)
        clean_name = clean_spell_name(spell_name)

        print(f"[{i}/{len(spells)}] {clean_name}...", end=" ", flush=True)

        result = fetch_infobox(session, url)
        
        if not result:
            result = {"url": url, "infobox_html": "", "icon": None}


        prefer_ru = ["Каннибализм"]
        if ru_url:
            ru_icon = fetch_ru_icon(session, ru_url)
            # Use RU icon if:
            # 1. We specifically prefer it for this spell (e.g. Fextralife icon is broken)
            # 2. Or if we don't have a Fextralife icon yet
            if ru_icon and (spell_name in prefer_ru or not result.get("icon")):
                result["icon"] = ru_icon
        
        if result.get("infobox_html") or result.get("icon"):
            results[spell_name] = result
            print(f"OK (icon: {'yes' if result['icon'] else 'no'}, infobox: {'yes' if result['infobox_html'] else 'no'})")
        else:
            errors += 1
            print("FAILED (no data)")
        
        time.sleep(DELAY_SECONDS)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_infoboxes(output_path, results)
    
    print(f"\nDone! Saved {len(results)} infoboxes to {output_path}")
    print(f"Errors: {errors}")
    
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
