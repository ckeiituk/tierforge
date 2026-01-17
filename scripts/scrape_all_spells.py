#!/usr/bin/env python3
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, quote

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://divinity.fandom.com/ru/wiki/"
MAIN_SKILLS_URL = urljoin(BASE_URL, "%D0%9D%D0%B0%D0%B2%D1%8B%D0%BA%D0%B8_%D0%B2_Original_Sin_2")
SPECIAL_SKILLS_URL = urljoin(BASE_URL, "%D0%9E%D1%81%D0%BE%D0%B1%D1%8B%D0%B5_%D0%BD%D0%B0%D0%B2%D1%8B%D0%BA%D0%B8_%D0%B2_Original_Sin_2")
COMBO_SKILLS_URL = urljoin(BASE_URL, "%D0%A0%D0%B5%D1%86%D0%B5%D0%BF%D1%82%D1%8B_%D0%B2_Original_Sin_2/%D0%9A%D0%BD%D0%B8%D0%B3%D0%B8_%D0%BD%D0%B0%D0%B2%D1%8B%D0%BA%D0%BE%D0%B2")

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

SCHOOL_NAME_MAP = {
    "Aerotheurge": "Аэротеургия",
    "Warfare": "Военное дело",
    "Geomancer": "Геомантия",
    "Hydrosophist": "Гидрософистика",
    "Scoundrel": "Искусство убийства",
    "Huntsman": "Мастерство охоты",
    "Necromancer": "Некромантия",
    "Pyrokinetic": "Пирокинетика",
    "Polymorph": "Превращение",
    "Summoning": "Призывание",
}

# Reverse map for scraping
RU_TO_EN_SCHOOL = {v: k for k, v in SCHOOL_NAME_MAP.items()}

def get_soup(url):
    print(f"Fetching {url}...")
    try:
        response = session.get(url, timeout=20)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def load_existing_mappings():
    path = Path("/home/meur/vscode/tierforge/data/spells.json")
    mapping = {}
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for school in data.get("schools", {}).values():
                for en_name, spell_data in school.get("spells", {}).items():
                    ru_name = spell_data.get("ru_name")
                    if ru_name:
                        mapping[ru_name] = en_name
        except Exception as e:
            print(f"Warning: Could not load existing mappings: {e}")
    return mapping

# Global mapping for EN names
EXISTING_MAPPINGS = load_existing_mappings()

def extract_english_name(soup, ru_name):
    # Try to find "(англ. English Name)" pattern in the first paragraph
    content = soup.find("div", class_="mw-parser-output")
    if content:
        # Check first few paragraphs
        for p in content.find_all("p", recursive=False)[:3]:
            text = p.get_text()
            match = re.search(r"\(англ\.\s+([A-Za-z0-9\s'\-]+)\)", text)
            if match:
                return match.group(1).strip()
            # Also check for direct bold text if pattern differs
            # "Рикошетящий щит (Bouncing Shield)"
            match = re.search(r"\(([A-Za-z0-9\s'\-]{3,})\)", text)
            if match:
                 # Check if it looks like an English name (basic heuristic)
                 candidate = match.group(1).strip()
                 if not any(c in "абвгдеёжзийклмнопрстуфхцчшщъыьэюя" for c in candidate.lower()):
                     return candidate

    return None

def parse_skill_table(table, default_school):
    spells = {}
    rows = table.find_all("tr")
    current_tier = "Неизвестно"
    found_in_table = 0
    
    for row in rows:
        th = row.find("th")
        if th and th.get("colspan"):
            text = th.get_text(strip=True)
            if text and len(text) > 3:
                current_tier = text
            continue
            
        cols = row.find_all(["td", "th"])
        if len(cols) < 2:
            continue
            
        name_link = None
        # Usually name is in col 1 (index 1), sometimes 0 or 2 depending on icon
        for i in [1, 0, 2]:
            if i < len(cols):
                links = cols[i].find_all("a")
                for link in links:
                    href = link.get("href", "")
                    if href and "/wiki/" in href and not link.find("img"):
                        text = link.get_text(strip=True)
                        if text and not text.isdigit():
                            name_link = link
                            break
                if name_link: break
        
        if not name_link:
            continue
            
        ru_name = name_link.get_text(strip=True)
        ru_name = ru_name.replace("°", "").replace("[DE]", "").strip()
        if not ru_name or len(ru_name) < 2: continue
        
        ru_url = urljoin(BASE_URL, name_link.get("href", ""))
        
        # Strategy:
        # 1. Check existing mapping
        # 2. If not found, fetch page to find English name (expensive but needed for cleanup)
        # 3. Fallback to RU name (should be avoided if possible)
        
        en_name = EXISTING_MAPPINGS.get(ru_name)
        if not en_name:
            print(f"      Fetching page for English name: {ru_name}...", end=" ", flush=True)
            spell_soup = get_soup(ru_url)
            if spell_soup:
                en_name = extract_english_name(spell_soup, ru_name)
                if en_name:
                    print(f"Found: {en_name}")
                else:
                    print("Not found")
            else:
                 print("Failed to load")
                 
        if not en_name:
             en_name = ru_name # Fallback
             
        # Generate approximate Fextralife URL
        en_url = f"https://divinityoriginalsin2.wiki.fextralife.com/{quote(en_name)}" if en_name != ru_name else ""

        spells[en_name] = {
            "ru_name": ru_name,
            "ru_url": ru_url,
            "en_name": en_name,
            "en_url": en_url,
            "tier": current_tier,
            "primary_school": default_school
        }
        found_in_table += 1
        
    if found_in_table > 0:
        print(f"    Found {found_in_table} spells in a table")
    return spells

def scrape_schools():
    soup = get_soup(MAIN_SKILLS_URL)
    if not soup: return {}
    
    schools = {}
    navbox = soup.select_one(".navbox_dos2")
    if not navbox: navbox = soup.find("table")
    links = navbox.select("a") if navbox else soup.select("a")
        
    processed_urls = set()
    for link in links:
        ru_school_name = link.get_text(strip=True)
        href = link.get("href", "")
        
        target_school = None
        if ru_school_name in RU_TO_EN_SCHOOL:
            target_school = ru_school_name
        else:
            for ru in RU_TO_EN_SCHOOL:
                if ru in ru_school_name:
                    target_school = ru
                    break
        
        if target_school:
            school_url = urljoin(BASE_URL, href)
            if school_url in processed_urls: continue
            processed_urls.add(school_url)
            
            en_school_name = RU_TO_EN_SCHOOL[target_school]
            print(f"Processing school: {target_school} ({en_school_name})")
            
            schools[target_school] = {
                "ru_url": school_url,
                "en_name": en_school_name,
                "spells": {}
            }
            
            school_soup = get_soup(school_url)
            if school_soup:
                # Just get all tables. The filter was causing issues where main skill tables
                # without specific classes were skipped because a navbox existed elsewhere on the page.
                tables = school_soup.find_all("table")
                
                for table in tables:
                    # Skip navboxes inside the page that are just links to other schools
                    # But be careful, some skill tables might have this class?
                    # The previous logic had a check for "navbox" class AND content.
                    # Let's rely on parse_skill_table to filter garbage.
                    
                    spells = parse_skill_table(table, target_school)
                    schools[target_school]["spells"].update(spells)
            
            print(f"    Total spells for {target_school}: {len(schools[target_school]['spells'])}")
            
    return schools

def scrape_special_skills():
    soup = get_soup(SPECIAL_SKILLS_URL)
    if not soup: return {}
    
    special_school = "Особые навыки"
    print(f"Processing Special Skills...")
    
    # Just get all tables
    tables = soup.find_all("table")
        
    all_spells = {}
    for table in tables:
        spells = parse_skill_table(table, special_school)
        all_spells.update(spells)
        
    return {special_school: {"en_name": "Special", "spells": all_spells}}

def scrape_combo_skills():
    soup = get_soup(COMBO_SKILLS_URL)
    if not soup: return {}
    
    combo_school = "Комбинированные навыки"
    print(f"Processing Combo Skills...")
    
    tables = soup.find_all("table")
    all_spells = {}
    
    for table in tables:
        header_text = table.get_text()
        if "Комбинированный навык" not in header_text:
            continue
            
        rows = table.find_all("tr")
        found_in_table = 0
        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 3: continue
            
            # Col 0: Name/Link
            # Col 1: School 1
            # Col 2: School 2
            
            # Find the first anchor that has text content, or at least isn't just an image
            # Usually the structure is <a href="image"><img ...></a> <a href="page">Name</a>
            # or just <a href="page">Name</a>
            anchors = cols[0].find_all("a")
            name_link = None
            for a in anchors:
                if a.get_text(strip=True):
                    name_link = a
                    break
            
            # If no text anchor found, try the first one as fallback, but it likely failed before
            if not name_link and anchors:
                name_link = anchors[0]
                
            if not name_link: continue
            
            ru_name = name_link.get_text(strip=True).replace("°", "").strip()
            ru_name = re.sub(r"\s*\(навык\)", "", ru_name)
            ru_url = urljoin(BASE_URL, name_link.get("href", ""))
            
            school1 = cols[1].get_text(strip=True)
            school2 = cols[2].get_text(strip=True)
            
            # Validate schools in our map
            s1_clean = next((k for k in RU_TO_EN_SCHOOL if k in school1), school1)
            s2_clean = next((k for k in RU_TO_EN_SCHOOL if k in school2), school2)
            
            en_name = EXISTING_MAPPINGS.get(ru_name)
            if not en_name:
                 print(f"      Fetching combo page for English name: {ru_name}...", end=" ", flush=True)
                 spell_soup = get_soup(ru_url)
                 if spell_soup:
                     en_name = extract_english_name(spell_soup, ru_name)
                     if en_name:
                         print(f"Found: {en_name}")
                     else:
                         print("Not found")

            if not en_name:
                en_name = ru_name
            
            # Guess Fextra URL
            en_url = f"https://divinityoriginalsin2.wiki.fextralife.com/{quote(en_name)}" if en_name != ru_name else ""
            
            all_spells[en_name] = {
                "ru_name": ru_name,
                "ru_url": ru_url,
                "en_name": en_name,
                "en_url": en_url,
                "tier": "Комбинированные",
                "primary_school": s1_clean,
                "secondary_school": s2_clean,
                "is_combo": True
            }
            
            # Use school1 as primary school for organization
            # We want to return a flat dict of skills to be merged later, OR return them grouped by school here?
            # The current function returns {combo_school: ...}
            # Let's keep returning the dict, but we will handle the merge in main()
            found_in_table += 1
            
        if found_in_table > 0:
            print(f"    Found {found_in_table} combo spells in a table")
            
    return {combo_school: {"en_name": "Crafted", "spells": all_spells}}

def main():
    print("Starting comprehensive scrape...")
    
    # We'll save a backup of the old spells.json just in case
    old_path = Path("/home/meur/vscode/tierforge/data/spells.json")
    if old_path.exists():
        backup_path = Path("/home/meur/vscode/tierforge/data/spells.json.bak")
        backup_path.write_text(old_path.read_text())
        print(f"Created backup at {backup_path}")

    data = {
        "meta": {
            "source": MAIN_SKILLS_URL,
            "note": "Automatically scraped from Divinity Fandom Wiki (ru)"
        },
        "schools": {}
    }
    
    schools_data = scrape_schools()
    data["schools"].update(schools_data)
    
    data["schools"].update(scrape_special_skills())
    
    # Build a global lookup map: Name -> List of (SchoolKey, SpellKey)
    # This handles cases where a spell might be in multiple schools or a different school than expected
    spell_lookup = {}
    for school_key, school_data in data["schools"].items():
        if school_key == "Комбинированные навыки": continue
        for spell_name in school_data.get("spells", {}):
            if spell_name not in spell_lookup:
                spell_lookup[spell_name] = []
            spell_lookup[spell_name].append(school_key)

    # Scrape combo skills and MERGE them into existing schools
    combo_data = scrape_combo_skills()
    if combo_data:
        # The key is "Комбинированные навыки", value has "spells": {name: data}
        combo_section = combo_data.get("Комбинированные навыки", {})
        combo_spells = combo_section.get("spells", {})
        
        print(f"Merging {len(combo_spells)} combo spells into existing entries...")
        
        for name, spell_data in combo_spells.items():
            # Check if this spell exists ANYWHERE
            found_schools = spell_lookup.get(name)
            
            if found_schools:
                for school_key in found_schools:
                    print(f"  Updating existing skill '{name}' in '{school_key}' with combo data")
                    # Update metadata but preserve existing URLs/Tier if valid?
                    # The combo data has is_combo and secondary_school which we definitely want.
                    # It also has URLs.
                    current_entry = data["schools"][school_key]["spells"][name]
                    current_entry["is_combo"] = True
                    current_entry["secondary_school"] = spell_data["secondary_school"]
                    # Optionally update urls if missing
                    if not current_entry.get("en_url") and spell_data.get("en_url"):
                        current_entry["en_url"] = spell_data["en_url"]
            else:
                # Not found anywhere, add to primary school
                primary = spell_data.get("primary_school")
                if primary and primary in data["schools"]:
                    print(f"  Adding new combo skill '{name}' to '{primary}'")
                    data["schools"][primary]["spells"][name] = spell_data
                else:
                    print(f"  Warning: Primary school '{primary}' not found for '{name}'. Adding to orphan list.")
                    if "Комбинированные навыки" not in data["schools"]:
                         data["schools"]["Комбинированные навыки"] = {"en_name": "Crafted", "spells": {}}
                    data["schools"]["Комбинированные навыки"]["spells"][name] = spell_data

    output_path = Path("/home/meur/vscode/tierforge/data/spells.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    total_spells = sum(len(s["spells"]) for s in data["schools"].values())
    print(f"Finished! Scraped {len(data['schools'])} schools and {total_spells} spells.")

if __name__ == "__main__":
    main()
