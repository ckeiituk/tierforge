/**
 * TierList Component - Container for all tier rows
 */

import { Component, createElement } from './Component';
import { TierRow } from './TierRow';
import type { FilterConfig, Item, TierList as TierListType } from '@/types';

export interface TierListProps {
    tierList: TierListType | null;
    items: Map<string, Item>;
    selectedItems: Set<string>;
    searchQuery: string;
    filters: FilterConfig[];
    activeFilters: Record<string, string[]>;
}

export class TierList extends Component<Record<string, never>, TierListProps> {
    private tierRows: TierRow[] = [];
    private tierRowsById: Map<string, TierRow> = new Map();
    private addButton: HTMLElement | null = null;

    constructor(props: TierListProps) {
        super(props, {
            initialState: {},
            className: 'tier-list',
        });
    }

    render(): HTMLElement {
        const container = createElement('div', {
            className: 'tier-list',
            role: 'list',
            'aria-label': 'Tier list',
        });
        this.element = container;
        this.addButton = null;
        this.syncRows(null);
        return container;
    }

    updateProps(newProps: Partial<TierListProps>): void {
        const prevProps = this.props;
        this.props = { ...this.props, ...newProps };
        if (!this.element || !this.element.isConnected) {
            this.rerender();
            return;
        }
        this.syncRows(prevProps);
    }

    private renderAddTierButton(): HTMLElement {
        const btn = createElement('button', {
            className: 'tier-list__add-btn',
            type: 'button',
        }, ['+ Add Tier']);

        btn.addEventListener('click', () => {
            this.emit({ type: 'TIER_ADD_REQUESTED' });
        });

        return btn;
    }

    private syncRows(prevProps: TierListProps | null): void {
        const container = this.element;
        const { tierList } = this.props;

        if (!tierList) {
            this.tierRows.forEach(row => row.destroy());
            this.tierRows = [];
            this.tierRowsById.clear();
            this.addButton = null;
            container.innerHTML = '';
            return;
        }

        const totalTiers = tierList.tiers.length;
        const nextTierIds = tierList.tiers.map((tier) => tier.id);
        const shouldRefreshAll = this.shouldRefreshAllRows(prevProps);
        const dirtyTierIds = shouldRefreshAll
            ? new Set(nextTierIds)
            : this.collectDirtyTierIds(prevProps, tierList);

        for (const [tierId, row] of this.tierRowsById.entries()) {
            if (!nextTierIds.includes(tierId)) {
                row.destroy();
                this.tierRowsById.delete(tierId);
            }
        }

        tierList.tiers.forEach((tier, index) => {
            const rowProps = {
                tier,
                items: this.props.items,
                index,
                totalTiers,
                selectedItems: this.props.selectedItems,
                searchQuery: this.props.searchQuery,
                filters: this.props.filters,
                activeFilters: this.props.activeFilters,
            };

            const existing = this.tierRowsById.get(tier.id);
            if (!existing) {
                const row = new TierRow(rowProps);
                this.tierRowsById.set(tier.id, row);
                dirtyTierIds.add(tier.id);
                row.render();
                return;
            }

            if (dirtyTierIds.has(tier.id)) {
                existing.updateProps(rowProps);
            } else if (existing.getElement().dataset.tierIndex !== String(index)) {
                existing.updateProps(rowProps);
            }
        });

        this.tierRows = nextTierIds
            .map((tierId) => this.tierRowsById.get(tierId))
            .filter((row): row is TierRow => Boolean(row));

        if (!this.addButton) {
            this.addButton = this.renderAddTierButton();
        }
        const desiredNodes = this.tierRows.map((row) => row.getElement());
        desiredNodes.push(this.addButton);
        this.reconcileChildren(container, desiredNodes);
    }

    private shouldRefreshAllRows(prevProps: TierListProps | null): boolean {
        if (!prevProps) return true;
        if (prevProps.searchQuery !== this.props.searchQuery) return true;
        if (prevProps.filters !== this.props.filters) return true;
        if (!this.areActiveFiltersEqual(prevProps.activeFilters, this.props.activeFilters)) return true;
        return false;
    }

    private collectDirtyTierIds(
        prevProps: TierListProps | null,
        tierList: TierListType
    ): Set<string> {
        const dirty = new Set<string>();
        if (!prevProps || !prevProps.tierList) {
            tierList.tiers.forEach((tier) => dirty.add(tier.id));
            return dirty;
        }

        const prevTierMap = new Map(prevProps.tierList.tiers.map((tier) => [tier.id, tier]));
        tierList.tiers.forEach((tier) => {
            const prevTier = prevTierMap.get(tier.id);
            if (!prevTier || !this.areTierContentsEqual(prevTier, tier)) {
                dirty.add(tier.id);
            }
        });

        if (!this.areSelectedItemsEqual(prevProps.selectedItems, this.props.selectedItems)) {
            const changed = this.collectSelectionChanges(prevProps.selectedItems, this.props.selectedItems);
            const tierByItem = this.buildTierByItemMap(tierList);
            changed.forEach((itemId) => {
                const tierId = tierByItem.get(itemId);
                if (tierId) {
                    dirty.add(tierId);
                }
            });
        }

        return dirty;
    }

    private areTierContentsEqual(a: TierListType['tiers'][number], b: TierListType['tiers'][number]): boolean {
        if (a.name !== b.name || a.color !== b.color) return false;
        if (a.items.length !== b.items.length) return false;
        for (let i = 0; i < a.items.length; i += 1) {
            if (a.items[i] !== b.items[i]) return false;
        }
        return true;
    }

    private areActiveFiltersEqual(
        a: Record<string, string[]>,
        b: Record<string, string[]>
    ): boolean {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        return keysA.every((key) => {
            const valuesA = a[key] ?? [];
            const valuesB = b[key] ?? [];
            if (valuesA.length !== valuesB.length) return false;
            return valuesA.every((value, index) => value === valuesB[index]);
        });
    }

    private areSelectedItemsEqual(a: Set<string>, b: Set<string>): boolean {
        if (a.size !== b.size) return false;
        for (const value of a) {
            if (!b.has(value)) return false;
        }
        return true;
    }

    private collectSelectionChanges(prev: Set<string>, next: Set<string>): Set<string> {
        const changed = new Set<string>();
        prev.forEach((itemId) => {
            if (!next.has(itemId)) {
                changed.add(itemId);
            }
        });
        next.forEach((itemId) => {
            if (!prev.has(itemId)) {
                changed.add(itemId);
            }
        });
        return changed;
    }

    private buildTierByItemMap(tierList: TierListType): Map<string, string> {
        const map = new Map<string, string>();
        tierList.tiers.forEach((tier) => {
            tier.items.forEach((itemId) => {
                map.set(itemId, tier.id);
            });
        });
        return map;
    }

    private reconcileChildren(container: HTMLElement, desiredNodes: HTMLElement[]): void {
        const desiredSet = new Set(desiredNodes);
        Array.from(container.children).forEach((child) => {
            if (!desiredSet.has(child as HTMLElement)) {
                container.removeChild(child);
            }
        });

        desiredNodes.forEach((node, index) => {
            const current = container.children[index] as HTMLElement | undefined;
            if (current !== node) {
                container.insertBefore(node, current ?? null);
            }
        });
    }

    protected cleanup(): void {
        this.tierRows.forEach(row => row.destroy());
        this.tierRows = [];
        this.tierRowsById.clear();
        this.addButton = null;
    }
}
