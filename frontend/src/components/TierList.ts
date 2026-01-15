/**
 * TierList Component - Container for all tier rows
 */

import { Component, createElement } from './Component';
import { TierRow } from './TierRow';
import type { Item, TierList as TierListType, Tier } from '@/types';

export interface TierListProps {
    tierList: TierListType | null;
    items: Map<string, Item>;
}

interface TierListState {
    // Empty for now, could add loading state
}

export class TierList extends Component<TierListState, TierListProps> {
    private tierRows: TierRow[] = [];

    constructor(props: TierListProps) {
        super(props, {
            className: 'tier-list',
        });
    }

    render(): HTMLElement {
        const { tierList, items } = this.props;

        const container = createElement('div', {
            className: 'tier-list',
        });

        if (!tierList) {
            this.element = container;
            return container;
        }

        // Clean up old rows
        this.tierRows.forEach(row => row.destroy());
        this.tierRows = [];

        // Render tier rows
        tierList.tiers.forEach((tier, index) => {
            const row = new TierRow({
                tier,
                items,
                index,
                totalTiers: tierList.tiers.length,
            });
            this.tierRows.push(row);
            container.appendChild(row.render());
        });

        // Add tier button
        const addBtn = this.renderAddTierButton();
        container.appendChild(addBtn);

        this.element = container;
        return container;
    }

    private renderAddTierButton(): HTMLElement {
        const btn = createElement('button', {
            className: 'tier-list__add-btn',
        }, ['+ Add Tier']);

        btn.addEventListener('click', () => {
            this.emit({ type: 'TIER_ADD_REQUESTED' } as any);
        });

        return btn;
    }

    protected cleanup(): void {
        this.tierRows.forEach(row => row.destroy());
        this.tierRows = [];
    }
}
