import type { AppState, AppEvent, Tier, Item, Game, TierList, SheetConfig, HistoryEntry } from '@/types';
import { eventBus } from './EventBus';

const MAX_HISTORY = 50;

/**
 * Central state manager with undo/redo support
 */
class StateManager {
    private state: AppState = {
        currentGame: null,
        currentSheet: null,
        items: new Map(),
        tierList: null,
        unrankedItems: [],
        selectedItems: new Set(),
        isDragging: false,
        isEditing: false,
        filters: {},
        history: [],
        historyIndex: -1,
    };

    constructor() {
        // Subscribe to events that modify state
        eventBus.onAll((event) => this.handleEvent(event));
    }

    getState(): Readonly<AppState> {
        return this.state;
    }

    private handleEvent(event: AppEvent): void {
        switch (event.type) {
            case 'GAME_CHANGED':
                this.state.currentGame = event.game;
                this.state.currentSheet = null;
                this.state.items.clear();
                this.state.tierList = null;
                this.state.filters = {};
                break;

            case 'SHEET_CHANGED':
                this.state.currentSheet = event.sheet;
                break;

            case 'ITEMS_LOADED':
                this.state.items.clear();
                event.items.forEach((item) => {
                    this.state.items.set(item.id, item);
                });
                this.updateUnrankedItems();
                break;

            case 'TIERLIST_LOADED':
                this.state.tierList = event.tierList;
                this.state.history = [];
                this.state.historyIndex = -1;
                this.updateUnrankedItems();
                break;

            case 'ITEM_MOVED':
                this.moveItem(event.itemId, event.fromTier, event.toTier, event.position);
                break;

            case 'TIER_ADDED':
                this.addTier(event.tier);
                break;

            case 'TIER_REMOVED':
                this.removeTier(event.tierId);
                break;

            case 'TIER_UPDATED':
                this.updateTier(event.tier);
                break;

            case 'TIERS_REORDERED':
                this.reorderTiers(event.tierIds);
                break;

            case 'FILTER_CHANGED':
                this.state.filters[event.filterId] = event.values;
                break;

            case 'SELECTION_CHANGED':
                this.state.selectedItems = event.itemIds;
                break;

            case 'UNDO':
                this.undo();
                break;

            case 'REDO':
                this.redo();
                break;
        }
    }

    private saveToHistory(action: string): void {
        if (!this.state.tierList) return;

        // Truncate redo history
        if (this.state.historyIndex < this.state.history.length - 1) {
            this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
        }

        // Add new entry
        const entry: HistoryEntry = {
            tiers: JSON.parse(JSON.stringify(this.state.tierList.tiers)),
            timestamp: Date.now(),
            action,
        };
        this.state.history.push(entry);

        // Limit history size
        if (this.state.history.length > MAX_HISTORY) {
            this.state.history.shift();
        } else {
            this.state.historyIndex++;
        }
    }

    private moveItem(itemId: string, fromTier: string, toTier: string, position: number): void {
        if (!this.state.tierList) return;

        this.saveToHistory('Move item');

        // Remove from source
        if (fromTier === 'unranked') {
            this.state.unrankedItems = this.state.unrankedItems.filter((id) => id !== itemId);
        } else {
            const sourceTier = this.state.tierList.tiers.find((t) => t.id === fromTier);
            if (sourceTier) {
                sourceTier.items = sourceTier.items.filter((id) => id !== itemId);
            }
        }

        // Add to target
        if (toTier === 'unranked') {
            this.state.unrankedItems.splice(position, 0, itemId);
        } else {
            const targetTier = this.state.tierList.tiers.find((t) => t.id === toTier);
            if (targetTier) {
                targetTier.items.splice(position, 0, itemId);
            }
        }
    }

    private addTier(tier: Tier): void {
        if (!this.state.tierList) return;
        this.saveToHistory('Add tier');
        this.state.tierList.tiers.push(tier);
        this.sortTiers();
    }

    private removeTier(tierId: string): void {
        if (!this.state.tierList) return;
        this.saveToHistory('Remove tier');

        const tier = this.state.tierList.tiers.find((t) => t.id === tierId);
        if (tier) {
            // Move items back to unranked
            this.state.unrankedItems.push(...tier.items);
            this.state.tierList.tiers = this.state.tierList.tiers.filter((t) => t.id !== tierId);
        }
    }

    private updateTier(tier: Tier): void {
        if (!this.state.tierList) return;
        this.saveToHistory('Update tier');

        const index = this.state.tierList.tiers.findIndex((t) => t.id === tier.id);
        if (index !== -1) {
            this.state.tierList.tiers[index] = tier;
        }
    }

    private reorderTiers(tierIds: string[]): void {
        if (!this.state.tierList) return;
        this.saveToHistory('Reorder tiers');

        const tiersMap = new Map(this.state.tierList.tiers.map((t) => [t.id, t]));
        this.state.tierList.tiers = tierIds
            .map((id, index) => {
                const tier = tiersMap.get(id);
                if (tier) {
                    tier.order = index;
                    return tier;
                }
                return null;
            })
            .filter((t): t is Tier => t !== null);
    }

    private sortTiers(): void {
        if (!this.state.tierList) return;
        this.state.tierList.tiers.sort((a, b) => a.order - b.order);
    }

    private updateUnrankedItems(): void {
        if (!this.state.tierList) {
            this.state.unrankedItems = Array.from(this.state.items.keys());
            return;
        }

        const rankedIds = new Set(this.state.tierList.tiers.flatMap((t) => t.items));
        this.state.unrankedItems = Array.from(this.state.items.keys()).filter(
            (id) => !rankedIds.has(id)
        );
    }

    private undo(): void {
        if (this.state.historyIndex < 0 || !this.state.tierList) return;

        // Save current state for redo if at the end
        if (this.state.historyIndex === this.state.history.length - 1) {
            const currentEntry: HistoryEntry = {
                tiers: JSON.parse(JSON.stringify(this.state.tierList.tiers)),
                timestamp: Date.now(),
                action: 'current',
            };
            this.state.history.push(currentEntry);
        }

        const entry = this.state.history[this.state.historyIndex];
        this.state.tierList.tiers = JSON.parse(JSON.stringify(entry.tiers));
        this.state.historyIndex--;
        this.updateUnrankedItems();
    }

    private redo(): void {
        if (this.state.historyIndex >= this.state.history.length - 2 || !this.state.tierList) return;

        this.state.historyIndex++;
        const entry = this.state.history[this.state.historyIndex + 1];
        this.state.tierList.tiers = JSON.parse(JSON.stringify(entry.tiers));
        this.updateUnrankedItems();
    }

    canUndo(): boolean {
        return this.state.historyIndex >= 0;
    }

    canRedo(): boolean {
        return this.state.historyIndex < this.state.history.length - 2;
    }
}

// Singleton instance
export const stateManager = new StateManager();
