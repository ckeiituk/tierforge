#!/usr/bin/env python3
import json
from pathlib import Path

# Mapping of Skill Name -> [School A, School B]
# We will check the Primary School in DB, and set Secondary to the OTHER one.
AERO = "Аэротеургия"
GEO = "Геомантия"
HYDRO = "Гидрософистика"
PYRO = "Пирокинетика"
NECRO = "Некромантия"
POLY = "Превращение"
HUNT = "Мастерство охоты"
SCOUNDREL = "Искусство убийства"
SUMMON = "Призывание"
WARFARE = "Военное дело"

DUAL_MAP = {
    # Aerotheurge Combos
    "Breathing Bubble": [AERO, WARFARE],
    "Mass Breathing Bubbles": [AERO, WARFARE],
    "Erratic Wisp": [AERO, HUNT],
    "Evasive Aura": [AERO, HUNT],
    "Smoke Cover": [AERO, SCOUNDREL],
    "Blessed Smoke Cloud": [AERO, SCOUNDREL],
    "Vaporize": [AERO, POLY],
    "Jellyfish Skin": [AERO, POLY],
    "Electric Infusion": [AERO, SUMMON],
    "Cursed Electric Infusion": [AERO, SUMMON],
    "Vacuum Touch": [AERO, NECRO],
    "Vacuum Aura": [AERO, NECRO],

    # Geomancer Combos
    "Oily Carapace": [GEO, WARFARE],
    "Mass Oily Carapace": [GEO, WARFARE],
    "Throw Dust": [GEO, HUNT],
    "Dust Blast": [GEO, HUNT],
    "Venom Coating": [GEO, SCOUNDREL],
    "Venomous Aura": [GEO, SCOUNDREL],
    "Turn to Oil": [GEO, POLY],
    "Poisonous Skin": [GEO, POLY],
    "Poison Infusion": [GEO, SUMMON],
    "Acid Infusion": [GEO, SUMMON],
    "Corrosive Touch": [GEO, NECRO],
    "Corrosive Spray": [GEO, NECRO],

    # Hydrosophist Combos
    "Cleanse Wounds": [HYDRO, WARFARE],
    "Mass Cleanse Wounds": [HYDRO, WARFARE],
    "Cryotherapy": [HYDRO, HUNT],
    "Mass Cryotherapy": [HYDRO, HUNT],
    "Vampiric Hunger": [HYDRO, SCOUNDREL],
    "Vampiric Hunger Aura": [HYDRO, SCOUNDREL],
    "Healing Tears": [HYDRO, POLY],
    "Icy Skin": [HYDRO, POLY],
    "Water Infusion": [HYDRO, SUMMON],
    "Ice Infusion": [HYDRO, SUMMON],
    "Raining Blood": [HYDRO, NECRO],
    "Blood Storm": [HYDRO, NECRO],

    # Pyrokinetic Combos
    "Sparking Swings": [PYRO, WARFARE],
    "Master of Sparks": [PYRO, WARFARE],
    "Throw Explosive Trap": [PYRO, HUNT],
    "Deploy Mass Traps": [PYRO, HUNT],
    "Sabotage": [PYRO, SCOUNDREL],
    "Mass Sabotage": [PYRO, SCOUNDREL],
    "Bleed Fire": [PYRO, POLY],
    "Flaming Skin": [PYRO, POLY],
    "Fire Infusion": [PYRO, SUMMON],
    "Necrofire Infusion": [PYRO, SUMMON],
    "Corpse Explosion": [PYRO, NECRO],
    "Mass Corpse Explosion": [PYRO, NECRO],
}

def main():
    path = Path("data/spells.json")
    if not path.exists():
        print("data/spells.json not found")
        return

    data = json.loads(path.read_text())
    fixed_count = 0
    
    for school_name, school_data in data.get("schools", {}).items():
        spells = school_data.get("spells", {})
        for key, spell in spells.items():
            en_name = spell.get("en_name", key)
            
            if en_name in DUAL_MAP:
                components = DUAL_MAP[en_name]
                current_primary = spell.get("primary_school")
                
                # Determine correct secondary: It must be the one that is NOT Primary
                # If Primary is not in components (weird data?), default to the Non-Element, or just pick index 1?
                # Let's try to find Primary in components.
                
                if current_primary in components:
                    # Pick the other one
                    other = [c for c in components if c != current_primary][0]
                    target_secondary = other
                else:
                    # Primary is weird/wrong? Fallback to the Element? Or the Non-Element?
                    # Generally we want Contrast.
                    # Let's verify data integrity later, usually Primary is one of them.
                    # If Primary is not in list, maybe just pick the Element as a safe default?
                    # OR pick the Non-Element?
                    # Let's Pick Index 1 (The Non-Element in my list ordering above? No, I mixed them).
                    # Actually, for "Corpse Explosion": [PYRO, NECRO]. If Primary=NECRO, Sec=PYRO.
                    # If Primary=PYRO, Sec=NECRO.
                    # Let's default to the second item if primary not found (arbitrary).
                    target_secondary = components[1]

                if spell.get("secondary_school") != target_secondary:
                    spell["secondary_school"] = target_secondary
                    spell["is_combo"] = True
                    print(f"Fixed {en_name}: Primary={current_primary} -> Sec={target_secondary}")
                    fixed_count += 1
            
            # Note: We already cleared is_combo for non-combos in previous script, so no need to redo that.

    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Saved data/spells.json with {fixed_count} contrast fixes")

if __name__ == "__main__":
    main()
