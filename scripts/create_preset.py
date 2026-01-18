#!/usr/bin/env python3
"""
Create a seed preset from skill names.
Converts English skill names to item IDs and creates an importable preset JSON.
"""

import json
import os
import re
import sys

# Tier list preset data
PRESET_DATA = {
    "name": "Competitive Tier List",
    "tiers": [
        {"name": "SS", "color": "#FF0000", "skills": ["Adrenaline"]},
        {"name": "S", "color": "#FF4500", "skills": ["Teleportation", "Tactical Retreat", "Rain", "Skin Graft", "Chameleon Cloak", "Battle Stomp"]},
        {"name": "A", "color": "#FFA500", "skills": ["Chain Lightning", "Pressure Spike", "Nether Swap", "Pyroclastic Eruption", "Acid Spores", "Ballistic Shot", "Winter Blast", "Armour of Frost", "Grasp of the Starved", "Spider Legs", "Master of Sparks", "Corpse Explosion", "Mass Corpse Explosion", "Cloak and Dagger", "Backlash", "Conjure Incarnate", "Power Infusion", "Farsight Infusion", "Soulmate", "Battering Ram", "Bouncing Shield", "Phoenix Dive", "Thick of the Fight"]},
        {"name": "B", "color": "#FFD700", "skills": ["Closed Circuit", "Superconductor", "Vacuum Aura", "Uncanny Evasion", "Dust Blast", "Earthquake", "Impalement", "First Aid", "Elemental Arrowheads", "Global Cooling", "Mosquito Swarm", "Raise Bloated Corpse", "Raining Blood", "Medusa Head", "Bull Horns", "Tentacle Lash", "Apotheosis", "Laser Ray", "Fireball", "Haste", "Throw Explosive Trap", "Peace of Mind", "Chloroform", "Mortal Blow", "Shadow Infusion", "Warp Infusion", "Dominate Mind", "Cursed Electric Infusion", "Acid Infusion", "Summon Inner Demon", "Challenge", "Whirlwind"]},
        {"name": "C", "color": "#9ACD32", "skills": ["Smoke Cover", "Dazing Bolt", "Vacuum Touch", "Evasive Aura", "Worm Tremor", "Throw Dust", "Poison Wave", "Venom Coating", "Fortify", "Living Wall", "Pin Down", "Barrage", "Ricochet", "Sky Shot", "Hail Strike", "Ice Fan", "Restoration", "Ice Breaker", "Cleanse Wounds", "Mass Cleanse Wounds", "Living on the Edge", "Decaying Touch", "Infect", "Blood Storm", "Shackles of Pain", "Spread your wings", "Forced Exchange", "Heart of Steel", "Ignition", "Flaming Crescendo", "Epidemic of Fire", "Supernova", "Deploy Mass Traps", "Sleeping Arms", "Wind-up Toy", "Rupture Tendons", "Necrofire Infusion", "Overpower", "Enrage", "Blitz Attack"]},
        {"name": "D", "color": "#32CD32", "skills": ["Electric Discharge", "Blinding Radiance", "Shocking Touch", "Contamination", "Fossil Strike", "Poison Dart", "Venomous Aura", "Turn to Oil", "Mend Metal", "Marksman's Fang", "Arrow Storm", "Deep Freeze", "Soothing Cold", "Vampiric Hunger", "Vampiric Hunger Aura", "Death Wish", "Blood Sucker", "Raise Bone Widow", "Bone Cage", "Terrain Transmutation", "Jellyfish Skin", "Chicken Claw", "Spontaneous Combustion", "Bleed Fire", "Fire Whip", "Sparking Swings", "Terrifying Cruelty", "Throwing Knife", "Fan of Knives", "Elemental Totem", "Deflective Barrier", "Crippling Blow"]},
        {"name": "E", "color": "#00CED1", "skills": ["Blessed Smoke Cloud", "Thunderstorm", "Corrosive Touch", "Corrosive Spray", "Assassinate", "Arrow Spray", "Healing Ritual", "Arcane Stitch", "Cryotherapy", "Mass Cryotherapy", "Last Rites", "Black Shroud", "Flay Skin", "Flaming Skin", "Icy Skin", "Poisonous Skin", "Equalize", "Searing Daggers", "Summon Fire Slug", "Meteor Shower", "Flaming Tongues", "Corrupted Blade", "Daggers Drawn", "Dimensional Bolt", "Rallying Cry", "Ice Infusion", "Fire Infusion", "Poison Infusion", "Electric Infusion", "Ethereal Storm", "Planar Gateway", "Onslaught"]},
        {"name": "F", "color": "#4169E1", "skills": ["Erratic Wisp", "Tornado", "Vaporize", "Reactive Armor", "Siphon Poison", "Oily Carapace", "Farsight", "Reactive Shot", "Steam Lance", "Cryogenic Stasis", "Healing Tears", "Totems of the Necromancer", "Silencing Stare", "Summon Oily Blob", "Firebrand", "Sabotage", "Mass Sabotage", "Gag Order", "Door to Eternity", "Water Infusion", "Cannibalize", "Guardian Angel"]},
        {"name": "G", "color": "#9400D3", "skills": ["Favourable Wind", "Breathing Bubble", "Mass Breathing Bubble", "Apportation", "Mass Oily Carapace", "Glitter Dust"]}
    ]
}

def name_to_id(name: str) -> str:
    """Convert skill name to an item ID matching the database format."""
    # Handle alternate spellings
    name_map = {
        "Favourable Winds": "Favourable Wind",
        "Reactive Armor": "Reactive Armour",
        "Mass Breathing Bubble": "Mass Breathing Bubbles",
    }
    name = name_map.get(name, name)
    
    # Create ID from name: lowercase, replace spaces/special chars with underscores
    item_id = re.sub(r'[^a-zA-Z0-9]+', '_', name.lower()).strip('_')
    return item_id

def build_skill_name_to_id_map(spells_data: dict) -> dict[str, str]:
    """Build a map from English skill names to their IDs."""
    name_to_id_map = {}
    
    for school_key, school_data in spells_data.get("schools", {}).items():
        for spell_key, spell_data in school_data.get("spells", {}).items():
            en_name = spell_data.get("en_name", spell_key)
            # Use the key as the ID (normalized)
            spell_id = name_to_id(en_name)
            name_to_id_map[en_name] = spell_id
            name_to_id_map[en_name.lower()] = spell_id
    
    return name_to_id_map

def main():
    # Load spells data
    script_dir = os.path.dirname(os.path.abspath(__file__))
    spells_path = os.path.join(script_dir, "..", "data", "spells.json")
    
    with open(spells_path, "r", encoding="utf-8") as f:
        spells_data = json.load(f)
    
    # Build name to ID map
    name_to_id_map = build_skill_name_to_id_map(spells_data)
    
    # Convert preset data
    output_tiers = []
    missing_skills = []
    
    for tier in PRESET_DATA["tiers"]:
        tier_items = []
        for skill_name in tier["skills"]:
            # Try exact match first
            skill_id = name_to_id_map.get(skill_name)
            if not skill_id:
                # Try case-insensitive
                skill_id = name_to_id_map.get(skill_name.lower())
            if not skill_id:
                # Try with alternate spellings
                alt_names = {
                    "Favourable Winds": "Favourable Wind",
                    "Reactive Armor": "Reactive Armour",
                    "Mass Breathing Bubble": "Mass Breathing Bubbles",
                    "Soulmate": "Soul Mate",
                    "Equalize": "Equalise",
                }
                alt_name = alt_names.get(skill_name)
                if alt_name:
                    skill_id = name_to_id_map.get(alt_name)
            
            if skill_id:
                tier_items.append(skill_id)
            else:
                missing_skills.append(skill_name)
                # Fallback: generate ID from name
                tier_items.append(name_to_id(skill_name))
        
        output_tiers.append({
            "name": tier["name"],
            "color": tier["color"],
            "items": tier_items
        })
    
    if missing_skills:
        print(f"Warning: {len(missing_skills)} skills not found in database:")
        for skill in missing_skills:
            print(f"  - {skill}")
    
    # Create output preset
    output_preset = {
        "version": 1,
        "name": PRESET_DATA["name"],
        "tiers": output_tiers
    }
    
    # Save to file
    output_path = os.path.join(script_dir, "..", "data", "presets", "competitive_tier_list.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_preset, f, indent=2, ensure_ascii=False)
    
    print(f"Preset saved to: {output_path}")
    print(f"Total skills: {sum(len(t['items']) for t in output_tiers)}")

if __name__ == "__main__":
    main()
