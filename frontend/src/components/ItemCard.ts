/**
 * ItemCard Component - Represents a single rankable item
 */

import { Component, createElement } from './Component';
import { setDragPayload } from '@/core/dragPayload';
import type { Item } from '@/types';

export interface ItemCardProps {
    item: Item;
    containerId: string;
    isSelected?: boolean;
}

export class ItemCard extends Component<Record<string, never>, ItemCardProps> {
    constructor(props: ItemCardProps) {
        super(props, {
            initialState: {},
            className: 'item-card',
        });
    }

    render(): HTMLElement {
        const { item } = this.props;

        const card = createElement('div', {
            className: this.getClassName(),
            'data-item-id': item.id,
            'data-container-id': this.props.containerId,
        });

        // Item icon
        const icon = createElement('img', {
            className: 'item-card__icon',
            src: item.icon || '/icons/placeholder.png',
            alt: item.name,
            loading: 'lazy',
        });

        // Item name overlay
        const name = createElement('span', {
            className: 'item-card__name',
        }, [item.name]);

        card.appendChild(icon);
        card.appendChild(name);

        // Event handlers
        this.setupEventHandlers(card);

        this.element = card;
        return card;
    }

    private getClassName(): string {
        const classes = ['item-card'];

        if (this.props.isSelected) classes.push('item-card--selected');

        return classes.join(' ');
    }

    private setupEventHandlers(card: HTMLElement): void {
        // Hover for tooltip
        card.addEventListener('mouseenter', () => {
            this.emit({
                type: 'ITEM_HOVERED',
                itemId: this.props.item.id,
                element: card,
            });
        });

        card.addEventListener('mouseleave', () => {
            this.emit({ type: 'ITEM_UNHOVERED', itemId: this.props.item.id });
        });

        // Click for selection
        card.addEventListener('click', (e: MouseEvent) => {
            const multiSelect = e.ctrlKey || e.metaKey;
            const rangeSelect = e.shiftKey;

            this.emit({
                type: 'ITEM_CLICKED',
                itemId: this.props.item.id,
                multiSelect,
                rangeSelect,
            });
        });

        // Drag start
        card.setAttribute('draggable', 'true');

        card.addEventListener('dragstart', (e: DragEvent) => {
            card.classList.add('item-card--dragging');
            document.body.classList.add('is-dragging');

            if (e.dataTransfer) {
                setDragPayload(e.dataTransfer, {
                    itemId: this.props.item.id,
                    fromTier: this.props.containerId,
                });
                e.dataTransfer.effectAllowed = 'move';
            }

            this.emit({
                type: 'DRAG_START',
                itemId: this.props.item.id,
                containerId: this.props.containerId,
            });
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('item-card--dragging');
            document.body.classList.remove('is-dragging');
            this.emit({ type: 'DRAG_END', itemId: this.props.item.id });
        });
    }
}
