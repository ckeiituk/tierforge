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
    private reorderPosition: 'before' | 'after' | null = null;
    private pointerDragState: {
        pointerId: number;
        startY: number;
        active: boolean;
        lastTargetTierId: string | null;
        lastPosition: 'before' | 'after' | null;
    } | null = null;

    constructor(props: TierRowProps) {
        super(props, {
            initialState: {},
            className: 'tier-row',
        });

        this.on('TIER_REORDER_PREVIEW', (event) => {
            if (event.tierId === this.props.tier.id) {
                this.setReorderPosition(event.position);
            } else if (this.reorderPosition !== null) {
                this.setReorderPosition(null);
            }
        });

        this.on('TIER_REORDER_PREVIEW_CLEARED', () => {
            this.setReorderPosition(null);
        });
    }

    render(): HTMLElement {
        const { tier } = this.props;
        const reorderClass = this.reorderPosition === 'before'
            ? 'tier-row--insert-before'
            : this.reorderPosition === 'after'
                ? 'tier-row--insert-after'
                : '';

        const row = createElement('div', {
            className: `tier-row ${this.isDropTarget ? 'tier-row--drop-target' : ''} ${reorderClass}`,
            'data-tier-id': tier.id,
            'data-tier-index': this.props.index.toString(),
            role: 'listitem',
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
            tabindex: '0',
            role: 'button',
            'aria-label': `${tier.name} tier. Drag to reorder.`,
            'aria-grabbed': 'false',
            'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown Control+ArrowUp Control+ArrowDown',
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

        label.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.target !== label) return;
            const modifierPressed = e.altKey || e.ctrlKey || e.metaKey;
            if (!modifierPressed) return;

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.emit({ type: 'TIER_MOVE_UP', tierId: tier.id });
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.emit({ type: 'TIER_MOVE_DOWN', tierId: tier.id });
            }
        });

        label.addEventListener('dragstart', (e: DragEvent) => {
            if (!e.dataTransfer) return;
            setTierDragPayload(e.dataTransfer, { tierId: tier.id });
            e.dataTransfer.effectAllowed = 'move';
            this.setDraggingVisual(label, true);
        });

        label.addEventListener('dragend', () => {
            this.setDraggingVisual(label, false);
            this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });
        });

        label.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.pointerType === 'mouse') return;
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).isContentEditable) return;

            e.preventDefault();
            label.setPointerCapture(e.pointerId);
            this.pointerDragState = {
                pointerId: e.pointerId,
                startY: e.clientY,
                active: false,
                lastTargetTierId: null,
                lastPosition: null,
            };
        });

        label.addEventListener('pointermove', (e: PointerEvent) => {
            const state = this.pointerDragState;
            if (!state || e.pointerId !== state.pointerId) return;

            const delta = Math.abs(e.clientY - state.startY);
            if (!state.active && delta < 6) return;

            if (!state.active) {
                state.active = true;
                this.setDraggingVisual(label, true);
            }

            this.updatePointerPreview(e.clientX, e.clientY, state);
        });

        label.addEventListener('pointerup', (e: PointerEvent) => {
            const state = this.pointerDragState;
            if (!state || e.pointerId !== state.pointerId) return;
            if (label.hasPointerCapture(e.pointerId)) {
                label.releasePointerCapture(e.pointerId);
            }

            if (state.active) {
                this.commitPointerReorder(e.clientX, e.clientY);
            }

            this.pointerDragState = null;
            this.setDraggingVisual(label, false);
            this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });
        });

        label.addEventListener('pointercancel', (e: PointerEvent) => {
            const state = this.pointerDragState;
            if (!state || e.pointerId !== state.pointerId) return;
            if (label.hasPointerCapture(e.pointerId)) {
                label.releasePointerCapture(e.pointerId);
            }

            this.pointerDragState = null;
            this.setDraggingVisual(label, false);
            this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });
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
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            this.emit({
                type: 'TIER_REORDER_PREVIEW',
                tierId: this.props.tier.id,
                position: this.getReorderPosition(row, e.clientY),
            });
        });

        row.addEventListener('dragleave', (e: DragEvent) => {
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !row.contains(relatedTarget)) {
                this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });
            }
        });

        row.addEventListener('drop', (e: DragEvent) => {
            const payload = getTierDragPayload(e.dataTransfer || null);
            if (!payload) return;
            e.preventDefault();
            const position = this.getReorderPosition(row, e.clientY);
            this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });

            if (payload.tierId === this.props.tier.id) return;
            this.emit({
                type: 'TIER_REORDERED',
                tierId: payload.tierId,
                targetIndex: position === 'before' ? this.props.index : this.props.index + 1,
            });
        });
    }

    private setDropTarget(isDropTarget: boolean): void {
        if (this.isDropTarget === isDropTarget) return;
        this.isDropTarget = isDropTarget;
        this.element.classList.toggle('tier-row--drop-target', isDropTarget);
    }

    private setReorderPosition(position: 'before' | 'after' | null): void {
        if (this.reorderPosition === position) return;
        this.reorderPosition = position;
        this.element.classList.toggle('tier-row--insert-before', position === 'before');
        this.element.classList.toggle('tier-row--insert-after', position === 'after');
    }

    private getReorderPosition(row: HTMLElement, clientY: number): 'before' | 'after' {
        const rect = row.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    }

    private updatePointerPreview(clientX: number, clientY: number, state: {
        pointerId: number;
        startY: number;
        active: boolean;
        lastTargetTierId: string | null;
        lastPosition: 'before' | 'after' | null;
    }): void {
        const target = this.getTierTargetFromPoint(clientX, clientY);
        if (!target || target.tierId === this.props.tier.id) {
            if (state.lastTargetTierId !== null) {
                state.lastTargetTierId = null;
                state.lastPosition = null;
                this.emit({ type: 'TIER_REORDER_PREVIEW_CLEARED' });
            }
            return;
        }

        if (state.lastTargetTierId === target.tierId && state.lastPosition === target.position) return;
        state.lastTargetTierId = target.tierId;
        state.lastPosition = target.position;
        this.emit({
            type: 'TIER_REORDER_PREVIEW',
            tierId: target.tierId,
            position: target.position,
        });
    }

    private commitPointerReorder(clientX: number, clientY: number): void {
        const target = this.getTierTargetFromPoint(clientX, clientY);
        if (!target || target.tierId === this.props.tier.id) return;

        this.emit({
            type: 'TIER_REORDERED',
            tierId: this.props.tier.id,
            targetIndex: target.position === 'before' ? target.index : target.index + 1,
        });
    }

    private getTierTargetFromPoint(
        clientX: number,
        clientY: number
    ): { tierId: string; index: number; position: 'before' | 'after' } | null {
        const element = document.elementFromPoint(clientX, clientY);
        if (!(element instanceof HTMLElement)) return null;
        const row = element.closest<HTMLElement>('.tier-row');
        if (!row) return null;
        const tierId = row.dataset.tierId;
        const indexRaw = row.dataset.tierIndex;
        if (!tierId || indexRaw === undefined) return null;
        const index = Number.parseInt(indexRaw, 10);
        if (Number.isNaN(index)) return null;

        const rect = row.getBoundingClientRect();
        const position = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        return { tierId, index, position };
    }

    private setDraggingVisual(label: HTMLElement, isDragging: boolean): void {
        label.setAttribute('aria-grabbed', isDragging ? 'true' : 'false');
        this.element.classList.toggle('tier-row--dragging', isDragging);
        document.body.classList.toggle('is-dragging', isDragging);
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];
    }
}
