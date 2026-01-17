import type { AppState, AppEvent, Tier, HistoryEntry } from '@/types';
import { eventBus } from './EventBus';

const MAX_HISTORY = 50;

type Selector<T> = (state: Readonly<AppState>) => T;
type EqualityFn<T> = (a: T, b: T) => boolean;

interface Subscription<T> {
    selector: Selector<T>;
    callback(next: T, prev: T): void;
    equals(a: T, b: T): boolean;
    lastValue: T;
}

interface SubscriptionOptions<T> {
    equals?: EqualityFn<T>;
    immediate?: boolean;
}

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
        searchQuery: '',
        history: [],
        historyIndex: -1,
    };

    private subscriptions: Array<Subscription<unknown>> = [];

    constructor() {
        // Subscribe to events that modify state
        eventBus.onAll((event) => this.handleEvent(event));
    }

    getState(): Readonly<AppState> {
        return this.state;
    }

    subscribe<T>(
        selector: Selector<T>,
        callback: (next: T, prev: T) => void,
        options: SubscriptionOptions<T> = {}
    ): () => void {
        const equals = options.equals ?? Object.is;
        const immediate = options.immediate ?? true;
        const initialValue = selector(this.state);

        const subscription: Subscription<T> = {
            selector,
            callback,
            equals,
            lastValue: initialValue,
        };

        this.subscriptions.push(subscription);

        if (immediate) {
            callback(initialValue, initialValue);
        }

        return () => {
            this.subscriptions = this.subscriptions.filter(sub => sub !== subscription);
        };
    }

    private handleEvent(event: AppEvent): void {
        let stateChanged = false;
        switch (event.type) {
            case 'GAME_CHANGED':
                this.state.currentGame = event.game;
                this.state.currentSheet = null;
                this.state.items = new Map();
                this.state.tierList = null;
                this.state.filters = {};
                this.state.searchQuery = '';
                this.state.selectedItems = new Set();
                stateChanged = true;
                break;

            case 'SHEET_CHANGED':
                this.state.currentSheet = event.sheet;
                stateChanged = true;
                break;

            case 'ITEMS_LOADED':
                this.state.items = new Map(event.items.map((item) => [item.id, item]));
                this.updateUnrankedItems();
                stateChanged = true;
                break;

            case 'TIERLIST_LOADED':
                this.state.tierList = event.tierList;
                this.state.history = [];
                this.state.historyIndex = -1;
                this.state.selectedItems = new Set();
                this.updateUnrankedItems();
                stateChanged = true;
                break;

            case 'TIERLIST_RENAMED':
                if (this.state.tierList && this.state.tierList.id === event.tierListId) {
                    this.state.tierList = { ...this.state.tierList, name: event.name };
                    stateChanged = true;
                }
                break;

            case 'ITEM_MOVED':
                stateChanged = this.moveItem(event.itemId, event.fromTier, event.toTier, event.position);
                break;

            case 'ITEM_CLICKED':
                stateChanged = this.updateSelection(event.itemId, event.multiSelect, event.rangeSelect);
                break;

            case 'TIER_ADDED':
                stateChanged = this.addTier(event.tier);
                break;

            case 'TIER_REMOVED':
                stateChanged = this.removeTier(event.tierId);
                break;

            case 'TIER_UPDATED':
                stateChanged = this.updateTier(event.tier);
                break;

            case 'TIER_MOVE_UP':
                stateChanged = this.moveTier(event.tierId, -1);
                break;

            case 'TIER_MOVE_DOWN':
                stateChanged = this.moveTier(event.tierId, 1);
                break;

            case 'TIER_REORDERED':
                stateChanged = this.reorderTier(event.tierId, event.targetIndex);
                break;

            case 'TIER_REORDER_PREVIEW':
            case 'TIER_REORDER_PREVIEW_CLEARED':
                stateChanged = false;
                break;

            case 'TIERS_REORDERED':
                stateChanged = this.reorderTiers(event.tierIds);
                break;

            case 'FILTER_CHANGED':
                this.state.filters = {
                    ...this.state.filters,
                    [event.filterId]: event.values,
                };
                stateChanged = true;
                break;

            case 'SEARCH_CHANGED':
                if (this.state.searchQuery !== event.query) {
                    this.state.searchQuery = event.query;
                    stateChanged = true;
                }
                break;

            case 'SELECTION_CHANGED':
                this.state.selectedItems = event.itemIds;
                stateChanged = true;
                break;

            case 'UNDO':
                stateChanged = this.undo();
                break;

            case 'REDO':
                stateChanged = this.redo();
                break;
        }

        if (stateChanged) {
            this.notifySubscribers();
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

    private moveItem(itemId: string, fromTier: string, toTier: string, position: number): boolean {
        if (!this.state.tierList) return false;

        this.saveToHistory(`Move item (${fromTier} -> ${toTier})`);

        const tierList = this.state.tierList;

        const tiersWithoutItem = tierList.tiers.map((tier) => ({
            ...tier,
            items: tier.items.filter((id) => id !== itemId),
        }));

        let updatedUnranked = this.state.unrankedItems.filter((id) => id !== itemId);

        let updatedTiers = tiersWithoutItem;
        if (toTier === 'unranked') {
            const insertIndex = Math.max(0, Math.min(position, updatedUnranked.length));
            updatedUnranked = [
                ...updatedUnranked.slice(0, insertIndex),
                itemId,
                ...updatedUnranked.slice(insertIndex),
            ];
        } else {
            updatedTiers = tiersWithoutItem.map((tier) => {
                if (tier.id !== toTier) return tier;
                const items = [...tier.items];
                const insertIndex = Math.max(0, Math.min(position, items.length));
                items.splice(insertIndex, 0, itemId);
                return { ...tier, items };
            });
        }

        this.state.tierList = { ...tierList, tiers: updatedTiers };
        this.state.unrankedItems = updatedUnranked;
        return true;
    }

    private addTier(tier: Tier): boolean {
        if (!this.state.tierList) return false;
        this.saveToHistory('Add tier');
        const tiers = [...this.state.tierList.tiers, tier];
        this.state.tierList = {
            ...this.state.tierList,
            tiers: tiers.sort((a, b) => a.order - b.order),
        };
        return true;
    }

    private removeTier(tierId: string): boolean {
        if (!this.state.tierList) return false;
        this.saveToHistory('Remove tier');

        const tier = this.state.tierList.tiers.find((t) => t.id === tierId);
        if (tier) {
            const updatedUnranked = [...this.state.unrankedItems, ...tier.items];
            const updatedTiers = this.state.tierList.tiers.filter((t) => t.id !== tierId);
            this.state.tierList = { ...this.state.tierList, tiers: updatedTiers };
            this.state.unrankedItems = updatedUnranked;
            return true;
        }
        return false;
    }

    private updateTier(tier: Tier): boolean {
        if (!this.state.tierList) return false;
        this.saveToHistory('Update tier');

        const index = this.state.tierList.tiers.findIndex((t) => t.id === tier.id);
        if (index === -1) return false;

        const updatedTiers = this.state.tierList.tiers.map((existing, existingIndex) =>
            existingIndex === index ? { ...existing, ...tier } : existing
        );
        this.state.tierList = { ...this.state.tierList, tiers: updatedTiers };
        return true;
    }

    private reorderTiers(tierIds: string[]): boolean {
        if (!this.state.tierList) return false;
        this.saveToHistory('Reorder tiers');

        const tiersMap = new Map(this.state.tierList.tiers.map((t) => [t.id, t]));
        const reordered = tierIds
            .map((id, index) => {
                const tier = tiersMap.get(id);
                if (tier) {
                    return { ...tier, order: index };
                }
                return null;
            })
            .filter((t): t is Tier => t !== null);

        this.state.tierList = { ...this.state.tierList, tiers: reordered };
        return true;
    }

    private reorderTier(tierId: string, targetIndex: number): boolean {
        if (!this.state.tierList) return false;

        const tiers = this.state.tierList.tiers;
        const fromIndex = tiers.findIndex((tier) => tier.id === tierId);
        if (fromIndex === -1) return false;

        const clampedTarget = Math.max(0, Math.min(targetIndex, tiers.length));

        const tierIds = tiers.map((tier) => tier.id);
        const [moved] = tierIds.splice(fromIndex, 1);
        const insertIndex = fromIndex < clampedTarget ? clampedTarget - 1 : clampedTarget;
        if (insertIndex === fromIndex) return false;
        tierIds.splice(insertIndex, 0, moved);

        return this.reorderTiers(tierIds);
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

    private undo(): boolean {
        if (this.state.historyIndex < 0 || !this.state.tierList) return false;

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
        this.state.tierList = { ...this.state.tierList, tiers: JSON.parse(JSON.stringify(entry.tiers)) };
        this.state.historyIndex--;
        this.updateUnrankedItems();
        return true;
    }

    private redo(): boolean {
        if (this.state.historyIndex >= this.state.history.length - 2 || !this.state.tierList) return false;

        this.state.historyIndex++;
        const entry = this.state.history[this.state.historyIndex + 1];
        this.state.tierList = { ...this.state.tierList, tiers: JSON.parse(JSON.stringify(entry.tiers)) };
        this.updateUnrankedItems();
        return true;
    }

    canUndo(): boolean {
        return this.state.historyIndex >= 0;
    }

    canRedo(): boolean {
        return this.state.historyIndex < this.state.history.length - 2;
    }

    private moveTier(tierId: string, direction: -1 | 1): boolean {
        if (!this.state.tierList) return false;

        const tiers = this.state.tierList.tiers;
        const index = tiers.findIndex((tier) => tier.id === tierId);
        const newIndex = index + direction;

        if (index === -1 || newIndex < 0 || newIndex >= tiers.length) return false;

        const tierIds = tiers.map((tier) => tier.id);
        [tierIds[index], tierIds[newIndex]] = [tierIds[newIndex], tierIds[index]];

        return this.reorderTiers(tierIds);
    }

    private updateSelection(itemId: string, multiSelect: boolean, rangeSelect: boolean): boolean {
        const currentSelection = this.state.selectedItems;
        let nextSelection = new Set(currentSelection);

        if (rangeSelect) {
            // Range selection is not yet supported; fallback to single selection.
            nextSelection = new Set([itemId]);
        } else if (multiSelect) {
            if (nextSelection.has(itemId)) {
                nextSelection.delete(itemId);
            } else {
                nextSelection.add(itemId);
            }
        } else {
            nextSelection = new Set([itemId]);
        }

        if (this.setsEqual(currentSelection, nextSelection)) return false;
        this.state.selectedItems = nextSelection;
        return true;
    }

    private setsEqual(a: Set<string>, b: Set<string>): boolean {
        if (a.size !== b.size) return false;
        for (const value of a) {
            if (!b.has(value)) return false;
        }
        return true;
    }

    private notifySubscribers(): void {
        this.subscriptions.forEach((subscription) => {
            const nextValue = subscription.selector(this.state);
            const prevValue = subscription.lastValue;

            if (!subscription.equals(nextValue, prevValue)) {
                subscription.lastValue = nextValue;
                subscription.callback(nextValue, prevValue);
            }
        });
    }
}

// Singleton instance
export const stateManager = new StateManager();
