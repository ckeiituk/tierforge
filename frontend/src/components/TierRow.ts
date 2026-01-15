/**
 * TierRow Component - A single tier row with label and items
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import { getDragPayload, getTierDragPayload, setTierDragPayload } from '@/core/dragPayload';
import type { Item, Tier } from '@/types';

export interface TierRowProps {
    tier: Tier;
    items: Map<string, Item>;
    index: number;
    totalTiers: number;
    selectedItems: Set<string>;
}

export class TierRow extends Component<Record<string, never>, TierRowProps> {
    private itemComponents: ItemCard[] = [];
    private isDropTarget = false;
    private isReorderTarget = false;

    constructor(props: TierRowProps) {
        super(props, {
            initialState: {},
            className: 'tier-row',
        });
    }

    render(): HTMLElement {
        const { tier } = this.props;

        const row = createElement('div', {
            className: `tier-row ${this.isDropTarget ? 'tier-row--drop-target' : ''} ${this.isReorderTarget ? 'tier-row--reorder-target' : ''}`,
            'data-tier-id': tier.id,
        });

        const actions = this.renderActions();
        row.appendChild(actions);

        // Tier label
        const label = this.renderLabel();
        row.appendChild(label);

        // Items container
        const itemsContainer = this.renderItemsContainer();
        row.appendChild(itemsContainer);

        this.setupReorderHandlers(row);

        this.element = row;
        return row;
    }

    private renderLabel(): HTMLElement {
        const { tier } = this.props;

        const label = createElement('div', {
            className: 'tier-row__label',
            draggable: 'true',
        });
        label.style.backgroundColor = tier.color;

        // Editable name
        const name = createElement('span', {
            className: 'tier-row__name',
            contenteditable: 'true',
        }, [tier.name]);
        name.setAttribute('draggable', 'false');

        name.addEventListener('blur', () => {
            const newName = name.textContent?.trim() || tier.name;
            if (newName !== tier.name) {
                this.emit({
                    type: 'TIER_UPDATED',
                    tier: { ...tier, name: newName },
                });
            }
        });

        name.addEventListener('dragstart', (e: DragEvent) => {
            e.preventDefault();
        });

        name.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                name.blur();
            }
        });

        label.addEventListener('dragstart', (e: DragEvent) => {
            if (!e.dataTransfer) return;
            setTierDragPayload(e.dataTransfer, { tierId: tier.id });
            e.dataTransfer.effectAllowed = 'move';
            this.element.classList.add('tier-row--dragging');
        });

        label.addEventListener('dragend', () => {
            this.element.classList.remove('tier-row--dragging');
            this.setReorderTarget(false);
        });

        label.appendChild(name);

        return label;
    }

    private renderActions(): HTMLElement {
        const { tier, index, totalTiers } = this.props;

        const actions = createElement('div', {
            className: 'tier-row__actions',
        });

        const moveUp = this.createActionButton('↑', 'Move tier up', index === 0, () => {
            this.emit({ type: 'TIER_MOVE_UP', tierId: tier.id });
        });

        const moveDown = this.createActionButton('↓', 'Move tier down', index === totalTiers - 1, () => {
            this.emit({ type: 'TIER_MOVE_DOWN', tierId: tier.id });
        });

        const remove = this.createActionButton('✕', 'Delete tier', false, () => {
            this.emit({ type: 'TIER_REMOVED', tierId: tier.id });
        }, true);

        actions.appendChild(moveUp);
        actions.appendChild(moveDown);
        actions.appendChild(remove);

        return actions;
    }

    private createActionButton(
        label: string,
        title: string,
        disabled: boolean,
        onClick: () => void,
        isDanger: boolean = false
    ): HTMLElement {
        const classes = ['tier-row__action-btn'];
        if (isDanger) classes.push('tier-row__action-btn--danger');
        if (disabled) classes.push('tier-row__action-btn--disabled');

        const button = createElement('button', {
            className: classes.join(' '),
            title,
            'aria-label': title,
            type: 'button',
        }, [label]);

        if (disabled) {
            button.setAttribute('disabled', 'true');
        }

        button.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            if (disabled) return;
            onClick();
        });

        return button;
    }
    private renderItemsContainer(): HTMLElement {
        const { tier, items, selectedItems } = this.props;

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
                    isSelected: selectedItems.has(item.id),
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
        container.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            this.setDropTarget(true);
        });

        container.addEventListener('dragleave', (e: DragEvent) => {
            // Only handle if leaving the container itself
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !container.contains(relatedTarget)) {
                this.setDropTarget(false);
            }
        });

        container.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            this.setDropTarget(false);

            const payload = getDragPayload(e.dataTransfer || null);
            if (payload) {
                this.emit({
                    type: 'ITEM_MOVED',
                    itemId: payload.itemId,
                    fromTier: payload.fromTier,
                    toTier: this.props.tier.id,
                    position: this.props.tier.items.length,
                });
            }
        });
    }

    private setupReorderHandlers(row: HTMLElement): void {
        row.addEventListener('dragover', (e: DragEvent) => {
            const payload = getTierDragPayload(e.dataTransfer || null);
            if (!payload || payload.tierId === this.props.tier.id) return;
            e.preventDefault();
            this.setReorderTarget(true);
        });

        row.addEventListener('dragleave', (e: DragEvent) => {
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !row.contains(relatedTarget)) {
                this.setReorderTarget(false);
            }
        });

        row.addEventListener('drop', (e: DragEvent) => {
            const payload = getTierDragPayload(e.dataTransfer || null);
            if (!payload) return;
            e.preventDefault();
            this.setReorderTarget(false);

            if (payload.tierId === this.props.tier.id) return;
            this.emit({
                type: 'TIER_REORDERED',
                tierId: payload.tierId,
                targetIndex: this.props.index,
            });
        });
    }

    private setDropTarget(isDropTarget: boolean): void {
        if (this.isDropTarget === isDropTarget) return;
        this.isDropTarget = isDropTarget;
        this.element.classList.toggle('tier-row--drop-target', isDropTarget);
    }

    private setReorderTarget(isReorderTarget: boolean): void {
        if (this.isReorderTarget === isReorderTarget) return;
        this.isReorderTarget = isReorderTarget;
        this.element.classList.toggle('tier-row--reorder-target', isReorderTarget);
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];
    }
}
