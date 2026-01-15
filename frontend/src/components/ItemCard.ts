/**
 * ItemCard Component - Represents a single rankable item
 */

import { Component, createElement } from './Component';
import type { Item } from '@/types';

export interface ItemCardProps {
    item: Item;
    containerId: string;
    isSelected?: boolean;
    isDragging?: boolean;
}

interface ItemCardState {
    isHovered: boolean;
}

export class ItemCard extends Component<ItemCardState, ItemCardProps> {
    constructor(props: ItemCardProps) {
        super(props, {
            initialState: { isHovered: false },
            className: 'item-card',
        });
    }

    render(): HTMLElement {
        const { item, isSelected, isDragging } = this.props;
        const { isHovered } = this.state;

        const card = createElement('div', {
            className: this.getClassName(),
            'data-item-id': item.id,
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
        if (this.props.isDragging) classes.push('item-card--dragging');
        if (this.state.isHovered) classes.push('item-card--hovered');

        return classes.join(' ');
    }

    private setupEventHandlers(card: HTMLElement): void {
        // Hover for tooltip
        card.addEventListener('mouseenter', () => {
            this.setState({ isHovered: true });
            this.emit({
                type: 'ITEM_HOVERED',
                itemId: this.props.item.id,
                element: card,
            } as any); // TODO: Add ITEM_HOVERED to AppEvent type
        });

        card.addEventListener('mouseleave', () => {
            this.setState({ isHovered: false });
            this.emit({ type: 'ITEM_UNHOVERED' } as any);
        });

        // Click for selection
        card.addEventListener('click', (e) => {
            const multiSelect = e.ctrlKey || e.metaKey;
            const rangeSelect = e.shiftKey;

            this.emit({
                type: 'ITEM_CLICKED',
                itemId: this.props.item.id,
                multiSelect,
                rangeSelect,
            } as any);
        });

        // Drag start
        card.setAttribute('draggable', 'true');

        card.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', this.props.item.id);
                e.dataTransfer.effectAllowed = 'move';
            }

            this.emit({
                type: 'DRAG_START',
                itemId: this.props.item.id,
                containerId: this.props.containerId,
            } as any);
        });

        card.addEventListener('dragend', () => {
            this.emit({ type: 'DRAG_END' } as any);
        });
    }
}
