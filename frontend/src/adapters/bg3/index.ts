import type { Item } from '@/types';
import type { GameAdapter } from '../GameAdapter';
import { adapterRegistry } from '../GameAdapter';

// Class icons mapping
const CLASS_ICONS: Record<string, string> = {
    'Wizard': '/icons/bg3/classes/wizard.png',
    'Sorcerer': '/icons/bg3/classes/sorcerer.png',
    'Warlock': '/icons/bg3/classes/warlock.png',
    'Cleric': '/icons/bg3/classes/cleric.png',
    'Druid': '/icons/bg3/classes/druid.png',
    'Paladin': '/icons/bg3/classes/paladin.png',
    'Ranger': '/icons/bg3/classes/ranger.png',
    'Bard': '/icons/bg3/classes/bard.png',
    'Fighter': '/icons/bg3/classes/fighter.png',
    'Barbarian': '/icons/bg3/classes/barbarian.png',
    'Rogue': '/icons/bg3/classes/rogue.png',
    'Monk': '/icons/bg3/classes/monk.png',
};

// Spell school icons
const SPELL_SCHOOL_ICONS: Record<string, string> = {
    'Abjuration': '/icons/bg3/schools/abjuration.png',
    'Conjuration': '/icons/bg3/schools/conjuration.png',
    'Divination': '/icons/bg3/schools/divination.png',
    'Enchantment': '/icons/bg3/schools/enchantment.png',
    'Evocation': '/icons/bg3/schools/evocation.png',
    'Illusion': '/icons/bg3/schools/illusion.png',
    'Necromancy': '/icons/bg3/schools/necromancy.png',
    'Transmutation': '/icons/bg3/schools/transmutation.png',
};

/**
 * BG3 game adapter for Baldur's Gate 3
 */
const bg3Adapter: GameAdapter = {
    id: 'bg3',

    renderTooltip(item: Item): HTMLElement {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip-bg3';

        const data = item.data as {
            description?: string;
            level?: number;
            school?: string;
            casting_time?: string;
            range?: string;
            duration?: string;
            concentration?: boolean;
            ritual?: boolean;
            components?: string[];
            classes?: string[];
        };

        tooltip.innerHTML = `
      <div class="tooltip-header">
        <img src="${item.icon}" alt="" class="tooltip-icon" referrerpolicy="no-referrer" />
        <div class="tooltip-titles">
          <h3 class="tooltip-name">${item.name}</h3>
          ${data.school ? `
            <p class="tooltip-subtitle">
              ${data.level === 0 ? 'Cantrip' : `Level ${data.level}`} ${data.school}
            </p>
          ` : ''}
        </div>
      </div>
      
      <div class="tooltip-meta">
        ${data.casting_time ? `<span><strong>Casting Time:</strong> ${data.casting_time}</span>` : ''}
        ${data.range ? `<span><strong>Range:</strong> ${data.range}</span>` : ''}
        ${data.duration ? `<span><strong>Duration:</strong> ${data.duration}</span>` : ''}
      </div>
      
      ${data.concentration || data.ritual ? `
        <div class="tooltip-tags">
          ${data.concentration ? '<span class="tag concentration">Concentration</span>' : ''}
          ${data.ritual ? '<span class="tag ritual">Ritual</span>' : ''}
        </div>
      ` : ''}
      
      ${data.components?.length ? `
        <div class="tooltip-components">
          <strong>Components:</strong> ${data.components.join(', ')}
        </div>
      ` : ''}
      
      ${data.description ? `
        <p class="tooltip-description">${data.description}</p>
      ` : ''}
      
      ${data.classes?.length ? `
        <div class="tooltip-classes">
          ${data.classes.map(c => `
            <img src="${CLASS_ICONS[c] || ''}" alt="${c}" title="${c}" class="class-icon" />
          `).join('')}
        </div>
      ` : ''}
    `;

        return tooltip;
    },

    getCategoryIcon(category: string): string | null {
        return CLASS_ICONS[category] || SPELL_SCHOOL_ICONS[category] || null;
    },

    formatItemData(item: Item): Record<string, string> {
        const data = item.data as Record<string, unknown>;
        const formatted: Record<string, string> = {};

        if (data.level !== undefined) {
            formatted['Level'] = data.level === 0 ? 'Cantrip' : String(data.level);
        }
        if (data.school) {
            formatted['School'] = String(data.school);
        }
        if (data.concentration) {
            formatted['Conc'] = '✓';
        }

        return formatted;
    },
};

// Register adapter
adapterRegistry.register(bg3Adapter);

export default bg3Adapter;
