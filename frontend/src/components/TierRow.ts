/**
 * TierRow Component - A single tier row with label and items
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import { TierMenu } from './TierMenu';
import type { Item, Tier } from '@/types';

export interface TierRowProps {
    tier: Tier;
    items: Map<string, Item>;
    index: number;
    totalTiers: number;
}

interface TierRowState {
    isMenuOpen: boolean;
    isDropTarget: boolean;
}

export class TierRow extends Component<TierRowState, TierRowProps> {
    private menu: TierMenu | null = null;
    private itemComponents: ItemCard[] = [];

    constructor(props: TierRowProps) {
        super(props, {
            initialState: { isMenuOpen: false, isDropTarget: false },
            className: 'tier-row',
        });
    }

    render(): HTMLElement {
        const { tier, items, index, totalTiers } = this.props;
        const { isDropTarget } = this.state;

        const row = createElement('div', {
            className: `tier-row ${isDropTarget ? 'tier-row--drop-target' : ''}`,
            'data-tier-id': tier.id,
        });

        // Tier label
        const label = this.renderLabel();
        row.appendChild(label);

        // Items container
        const itemsContainer = this.renderItemsContainer();
        row.appendChild(itemsContainer);

        this.element = row;
        return row;
    }

    private renderLabel(): HTMLElement {
        const { tier, index, totalTiers } = this.props;

        const label = createElement('div', {
            className: 'tier-row__label',
        });
        label.style.backgroundColor = tier.color;

        // Editable name
        const name = createElement('span', {
            className: 'tier-row__name',
            contenteditable: 'true',
        }, [tier.name]);

        name.addEventListener('blur', () => {
            const newName = name.textContent?.trim() || tier.name;
            if (newName !== tier.name) {
                this.emit({
                    type: 'TIER_UPDATED',
                    tier: { ...tier, name: newName },
                });
            }
        });

        name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                name.blur();
            }
        });

        // Menu button
        const menuBtn = createElement('button', {
            className: 'tier-row__menu-btn',
            title: 'Tier options',
        }, ['⋮']);

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu(menuBtn);
        });

        label.appendChild(name);
        label.appendChild(menuBtn);

        return label;
    }

    private renderItemsContainer(): HTMLElement {
        const { tier, items } = this.props;

        const container = createElement('div', {
            className: 'tier-row__items',
        });

        // Clean up old item components
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];

        // Create item cards
        tier.items.forEach(itemId => {
            const item = items.get(itemId);
            if (item) {
                const card = new ItemCard({
                    item,
                    containerId: tier.id,
                });
                this.itemComponents.push(card);
                container.appendChild(card.render());
            }
        });

        // Drop handlers
        this.setupDropHandlers(container);

        return container;
    }

    private setupDropHandlers(container: HTMLElement): void {
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            if (!this.state.isDropTarget) {
                this.setState({ isDropTarget: true });
            }
        });

        container.addEventListener('dragleave', (e) => {
            // Only handle if leaving the container itself
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (!container.contains(relatedTarget)) {
                this.setState({ isDropTarget: false });
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            this.setState({ isDropTarget: false });

            const itemId = e.dataTransfer?.getData('text/plain');
            if (itemId) {
                this.emit({
                    type: 'ITEM_MOVED',
                    itemId,
                    fromTier: 'unknown', // Will be resolved by StateManager
                    toTier: this.props.tier.id,
                    position: this.props.tier.items.length,
                });
            }
        });
    }

    private toggleMenu(anchorElement: HTMLElement): void {
        const { tier, index, totalTiers } = this.props;

        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
            return;
        }

        this.menu = new TierMenu({
            tierId: tier.id,
            tierName: tier.name,
            isFirst: index === 0,
            isLast: index === totalTiers - 1,
            anchorElement,
        });

        document.body.appendChild(this.menu.render());
        this.menu.open();
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];

        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
    }
}
