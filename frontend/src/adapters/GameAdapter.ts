import type { Item } from '@/types';

/**
 * Game adapter interface - defines how to render game-specific content
 */
export interface GameAdapter {
    /** Game ID */
    id: string;

    /** Render tooltip content for an item */
    renderTooltip(item: Item): HTMLElement;

    /** Resolve wiki URL for an item */
    getWikiUrl?(item: Item, locale?: 'ru' | 'en'): string | null;

    /** Get category icon URL */
    getCategoryIcon(category: string): string | null;

    /** Format item data for display */
    formatItemData(item: Item): Record<string, string>;
}

/**
 * Registry of game adapters
 */
class AdapterRegistry {
    private adapters: Map<string, GameAdapter> = new Map();

    register(adapter: GameAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    get(gameId: string): GameAdapter | null {
        return this.adapters.get(gameId) || null;
    }

    has(gameId: string): boolean {
        return this.adapters.has(gameId);
    }
}

export const adapterRegistry = new AdapterRegistry();
