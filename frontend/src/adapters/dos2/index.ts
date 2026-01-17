import type { Item } from '@/types';
import type { GameAdapter } from '../GameAdapter';
import { adapterRegistry } from '../GameAdapter';

// School icons mapping
const SCHOOL_ICONS: Record<string, string> = {
  'Aerotheurge': '/icons/dos2/schools/aerotheurge.png',
  'Geomancer': '/icons/dos2/schools/geomancer.png',
  'Hydrosophist': '/icons/dos2/schools/hydrosophist.png',
  'Pyrokinetic': '/icons/dos2/schools/pyrokinetic.png',
  'Necromancer': '/icons/dos2/schools/necromancer.png',
  'Summoning': '/icons/dos2/schools/summoning.png',
  'Polymorph': '/icons/dos2/schools/polymorph.png',
  'Scoundrel': '/icons/dos2/schools/scoundrel.png',
  'Huntsman': '/icons/dos2/schools/huntsman.png',
  'Warfare': '/icons/dos2/schools/warfare.png',
  'Source': '/icons/dos2/schools/source.png',
};

const DOS2_RU_WIKI_BASE = 'https://divinity.fandom.com/ru/wiki/';

const getStringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const buildRuWikiUrl = (name: string): string => {
  const slug = encodeURIComponent(name).replace(/%20/g, '_');
  return `${DOS2_RU_WIKI_BASE}${slug}`;
};

/**
 * DOS2 game adapter for Divinity: Original Sin 2
 */
const dos2Adapter: GameAdapter = {
  id: 'dos2',

  renderTooltip(item: Item): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-dos2';

    const data = item.data as {
      infobox_html?: string;
      description?: string;
      description_ru?: string;
      ap_cost?: number;
      cooldown?: number;
      source_cost?: number;
      memory_cost?: number;
      school?: string;
      requirements?: string[];
    };

    // Use infobox_html from wiki if available
    if (data.infobox_html) {
      tooltip.innerHTML = data.infobox_html;
      tooltip.querySelectorAll<HTMLImageElement>('img').forEach((img: HTMLImageElement) => {
        img.referrerPolicy = 'no-referrer';
      });
      return tooltip;
    }

    // Fallback to template
    tooltip.innerHTML = `
      <div class="tooltip-header">
        <img src="${item.icon}" alt="" class="tooltip-icon" referrerpolicy="no-referrer" />
        <div class="tooltip-titles">
          <h3 class="tooltip-name">${item.name}</h3>
          ${item.name_ru ? `<p class="tooltip-name-ru">${item.name_ru}</p>` : ''}
        </div>
      </div>
      
      ${data.school ? `
        <div class="tooltip-school">
          <img src="${SCHOOL_ICONS[data.school] || ''}" alt="" />
          <span>${data.school}</span>
        </div>
      ` : ''}
      
      <div class="tooltip-stats">
        ${data.ap_cost !== undefined ? `
          <div class="tooltip-stat">
            <span class="stat-icon ap">⚡</span>
            <span class="stat-value">${data.ap_cost} AP</span>
          </div>
        ` : ''}
        ${data.source_cost ? `
          <div class="tooltip-stat">
            <span class="stat-icon source">✦</span>
            <span class="stat-value">${data.source_cost} Source</span>
          </div>
        ` : ''}
        ${data.cooldown ? `
          <div class="tooltip-stat">
            <span class="stat-icon cooldown">⏱</span>
            <span class="stat-value">${data.cooldown} Turn${data.cooldown > 1 ? 's' : ''}</span>
          </div>
        ` : ''}
        ${data.memory_cost ? `
          <div class="tooltip-stat">
            <span class="stat-icon memory">🧠</span>
            <span class="stat-value">${data.memory_cost} Memory</span>
          </div>
        ` : ''}
      </div>
      
      ${data.description_ru || data.description ? `
        <p class="tooltip-description">${data.description_ru || data.description}</p>
      ` : ''}
      
      ${data.requirements?.length ? `
        <div class="tooltip-requirements">
          <strong>Требования:</strong>
          <ul>
            ${data.requirements.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;

    return tooltip;
  },

  getWikiUrl(item: Item, locale: 'ru' | 'en' = 'ru'): string | null {
    const data = item.data as Record<string, unknown>;
    const ruUrl = getStringValue(data.ru_url)
      ?? getStringValue(data.wiki_url_ru)
      ?? getStringValue(data.wiki_ru);
    const enUrl = getStringValue(data.wiki_url);

    if (locale === 'ru') {
      if (ruUrl) return ruUrl;
      if (item.name_ru) return buildRuWikiUrl(item.name_ru);
      return null;
    }

    return enUrl;
  },

  getCategoryIcon(category: string): string | null {
    return SCHOOL_ICONS[category] || null;
  },

  formatItemData(item: Item): Record<string, string> {
    const data = item.data as Record<string, unknown>;
    const formatted: Record<string, string> = {};

    if (data.ap_cost !== undefined) {
      formatted['AP'] = String(data.ap_cost);
    }
    if (data.cooldown) {
      formatted['CD'] = `${data.cooldown}T`;
    }
    if (data.source_cost) {
      formatted['Source'] = String(data.source_cost);
    }
    if (data.school) {
      formatted['School'] = String(data.school);
    }

    return formatted;
  },
};

// Register adapter
adapterRegistry.register(dos2Adapter);

export default dos2Adapter;
