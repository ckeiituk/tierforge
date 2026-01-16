/**
 * TierRow Component - A single tier row with label and items
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import { getDragPayload, getTierDragPayload, setTierDragPayload } from '@/core/dragPayload';
import { hasActiveFilters, matchesActiveFilters, matchesSearchQuery } from '@/core/itemFilters';
import type { FilterConfig, Item, Tier } from '@/types';

export interface TierRowProps {
    tier: Tier;
    items: Map<string, Item>;
    index: number;
    totalTiers: number;
    selectedItems: Set<string>;
    searchQuery: string;
    filters: FilterConfig[];
    activeFilters: Record<string, string[]>;
}

export class TierRow extends Component<Record<string, never>, TierRowProps> {
    private itemComponents: ItemCard[] = [];
    private itemComponentsById: Map<string, ItemCard> = new Map();
    private itemsContainer: HTMLElement | null = null;
    private labelElement: HTMLElement | null = null;
    private nameElement: HTMLElement | null = null;
    private moveUpButton: HTMLButtonElement | null = null;
    private moveDownButton: HTMLButtonElement | null = null;
    private isDropTarget = false;
    private reorderPosition: 'before' | 'after' | null = null;
    private dropPlaceholder: HTMLElement | null = null;
    private dropPlaceholderIndex: number | null = null;
    private dropPlaceholderContainer: HTMLElement | null = null;
    private itemDragState: {
        itemId: string;
        fromTier: string;
        startX: number;
        startY: number;
    } | null = null;
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

        this.on('DRAG_START', (event) => {
            this.itemDragState = {
                itemId: event.itemId,
                fromTier: event.containerId,
                startX: event.startClientX,
                startY: event.startClientY,
            };
        });

        this.on('DRAG_END', () => {
            this.setDropTarget(false);
            this.clearDropPlaceholder();
            this.itemDragState = null;
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
            'data-tier': tier.name,
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

    updateProps(newProps: Partial<TierRowProps>): void {
        this.props = { ...this.props, ...newProps };
        if (!this.element || !this.element.isConnected) {
            this.rerender();
            return;
        }

        const { tier, index, totalTiers } = this.props;

        this.element.dataset.tier = tier.name;
        this.element.dataset.tierId = tier.id;
        this.element.dataset.tierIndex = index.toString();

        if (this.labelElement) {
            this.labelElement.style.backgroundColor = tier.color;
            this.labelElement.setAttribute('aria-label', `${tier.name} tier. Drag to reorder.`);
            this.labelElement.setAttribute('title', `${tier.name} tier. Drag to reorder.`);
        }
        if (this.nameElement && document.activeElement !== this.nameElement) {
            if (this.nameElement.textContent !== tier.name) {
                this.nameElement.textContent = tier.name;
            }
        }

        this.updateActionStates(index, totalTiers);
        this.syncItems();
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
            title: `${tier.name} tier. Drag to reorder.`,
        });
        label.style.backgroundColor = tier.color;
        this.labelElement = label;

        // Editable name
        const name = createElement('span', {
            className: 'tier-row__name',
            contenteditable: 'true',
            role: 'textbox',
            'aria-label': 'Tier name',
            'aria-multiline': 'false',
            spellcheck: 'false',
        }, [tier.name]);
        this.nameElement = name;
        name.setAttribute('draggable', 'false');

        name.addEventListener('focus', () => {
            this.moveCaretToEnd(name);
        });

        name.addEventListener('mouseup', () => {
            this.deferCaretToEnd(name);
        });

        name.addEventListener('blur', () => {
            const currentTier = this.props.tier;
            const newName = name.textContent?.trim() || currentTier.name;
            if (newName !== currentTier.name) {
                this.emit({
                    type: 'TIER_UPDATED',
                    tier: { ...currentTier, name: newName },
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
                this.emit({ type: 'TIER_MOVE_UP', tierId: this.props.tier.id });
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.emit({ type: 'TIER_MOVE_DOWN', tierId: this.props.tier.id });
            }
        });

        label.addEventListener('dragstart', (e: DragEvent) => {
            if (!e.dataTransfer) return;
            setTierDragPayload(e.dataTransfer, { tierId: this.props.tier.id });
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
        const { index, totalTiers } = this.props;

        const actions = createElement('div', {
            className: 'tier-row__actions',
        });

        const moveUp = this.createActionButton('↑', 'Move tier up', index === 0, () => {
            this.emit({ type: 'TIER_MOVE_UP', tierId: this.props.tier.id });
        });
        this.moveUpButton = moveUp;

        const moveDown = this.createActionButton('↓', 'Move tier down', index === totalTiers - 1, () => {
            this.emit({ type: 'TIER_MOVE_DOWN', tierId: this.props.tier.id });
        });
        this.moveDownButton = moveDown;

        const remove = this.createActionButton('✕', 'Delete tier', false, () => {
            this.emit({ type: 'TIER_REMOVED', tierId: this.props.tier.id });
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
    ): HTMLButtonElement {
        const classes = ['tier-row__action-btn'];
        if (isDanger) classes.push('tier-row__action-btn--danger');
        if (disabled) classes.push('tier-row__action-btn--disabled');

        const button = createElement('button', {
            className: classes.join(' '),
            title,
            'aria-label': title,
            type: 'button',
        }, [label]) as HTMLButtonElement;

        button.disabled = disabled;

        button.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            if (disabled) return;
            onClick();
        });

        return button;
    }
    private renderItemsContainer(): HTMLElement {
        const container = createElement('div', {
            className: 'tier-row__items',
        });
        this.itemsContainer = container;
        this.itemComponents = [];
        this.itemComponentsById.clear();
        this.syncItems();

        this.setupDropHandlers(container);

        return container;
    }

    private syncItems(): void {
        const container = this.itemsContainer;
        if (!container) return;

        const { tier, items, selectedItems, searchQuery, filters, activeFilters } = this.props;
        const filterActive = hasActiveFilters(filters, activeFilters);
        const searchActive = searchQuery.trim().length > 0;

        const nextItemIds: string[] = [];

        tier.items.forEach((itemId) => {
            const item = items.get(itemId);
            if (!item) return;
            const matchesFilters = matchesActiveFilters(item, filters, activeFilters);
            if (filterActive && !matchesFilters) {
                return;
            }
            const matchesSearch = matchesSearchQuery(item, searchQuery);
            const isDimmed = searchActive && !matchesSearch;
            const isHighlighted = searchActive && matchesSearch;

            const props = {
                item,
                containerId: tier.id,
                isSelected: selectedItems.has(item.id),
                isDimmed,
                isHighlighted,
            };

            let card = this.itemComponentsById.get(itemId);
            if (!card) {
                card = new ItemCard(props);
                this.itemComponentsById.set(itemId, card);
                card.render();
            } else {
                card.updateProps(props);
            }

            nextItemIds.push(itemId);
        });

        const nextSet = new Set(nextItemIds);
        for (const [itemId, card] of this.itemComponentsById.entries()) {
            if (!nextSet.has(itemId)) {
                card.destroy();
                this.itemComponentsById.delete(itemId);
            }
        }

        this.itemComponents = nextItemIds
            .map((itemId) => this.itemComponentsById.get(itemId))
            .filter((card): card is ItemCard => Boolean(card));

        const placeholderIndex = this.dropPlaceholderIndex;
        const shouldRestorePlaceholder =
            this.dropPlaceholderContainer === container && placeholderIndex !== null;
        if (shouldRestorePlaceholder && this.dropPlaceholder) {
            this.dropPlaceholder.remove();
            this.dropPlaceholderContainer = null;
            this.dropPlaceholderIndex = null;
        }

        const desiredNodes = this.itemComponents.map((card) => card.getElement());
        this.reconcileChildren(container, desiredNodes);

        if (shouldRestorePlaceholder && placeholderIndex !== null) {
            this.updateDropPlaceholder(container, placeholderIndex);
        }
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

    private updateActionStates(index: number, totalTiers: number): void {
        const moveUp = this.moveUpButton;
        const moveDown = this.moveDownButton;
        if (moveUp) {
            const disabled = index === 0;
            moveUp.disabled = disabled;
            moveUp.classList.toggle('tier-row__action-btn--disabled', disabled);
        }
        if (moveDown) {
            const disabled = index === totalTiers - 1;
            moveDown.disabled = disabled;
            moveDown.classList.toggle('tier-row__action-btn--disabled', disabled);
        }
    }

    private setupDropHandlers(container: HTMLElement): void {
        container.addEventListener('dragover', (e: DragEvent) => {
            if (!this.isItemDrag(e.dataTransfer)) return;
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            const shouldShowIndicator = this.shouldShowDropIndicator(e.clientX, e.clientY);
            if (!shouldShowIndicator) {
                this.setDropTarget(false);
                this.clearDropPlaceholder();
                return;
            }

            const insertIndex = this.getInsertIndex(container, e.clientX, e.clientY);
            if (this.isNoopItemMove(insertIndex)) {
                this.setDropTarget(false);
                this.clearDropPlaceholder();
                return;
            }

            this.setDropTarget(true);
            this.updateDropPlaceholder(container, insertIndex);
        });

        container.addEventListener('dragleave', (e: DragEvent) => {
            // Only handle if leaving the container itself
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !container.contains(relatedTarget)) {
                this.setDropTarget(false);
                this.clearDropPlaceholder();
            }
        });

        container.addEventListener('drop', (e: DragEvent) => {
            if (!this.isItemDrag(e.dataTransfer)) return;
            e.preventDefault();
            this.setDropTarget(false);

            const insertIndex = this.getDropIndex(container, e.clientX, e.clientY);
            this.clearDropPlaceholder();

            const payload = getDragPayload(e.dataTransfer || null);
            if (!payload) return;

            if (payload.fromTier === this.props.tier.id) {
                const currentIndex = this.props.tier.items.indexOf(payload.itemId);
                if (currentIndex === -1 || currentIndex === insertIndex) return;
            }

            this.emit({
                type: 'ITEM_MOVED',
                itemId: payload.itemId,
                fromTier: payload.fromTier,
                toTier: this.props.tier.id,
                position: insertIndex,
            });
        });
    }

    private isItemDrag(dataTransfer: DataTransfer | null): boolean {
        if (!dataTransfer) return false;
        const types = Array.from(dataTransfer.types);
        if (types.includes('application/x-tierforge-item')) return true;
        return document.querySelector('.item-card--dragging') !== null;
    }

    private getInsertIndex(container: HTMLElement, clientX: number, clientY: number): number {
        const items = Array.from(
            container.querySelectorAll<HTMLElement>('[data-item-id]:not(.item-card--dragging)')
        );

        if (items.length === 0) return 0;

        const indexed = items.map((element, index) => ({
            element,
            rect: element.getBoundingClientRect(),
            index,
        }));

        const rowThreshold = Math.max(1, indexed[0].rect.height * 0.5);
        const rows: Array<{ items: typeof indexed; top: number; bottom: number }> = [];

        let currentRow: { items: typeof indexed; top: number; bottom: number } | null = null;
        for (const item of indexed) {
            if (!currentRow) {
                currentRow = { items: [item], top: item.rect.top, bottom: item.rect.bottom };
                rows.push(currentRow);
                continue;
            }

            if (Math.abs(item.rect.top - currentRow.top) > rowThreshold) {
                currentRow = { items: [item], top: item.rect.top, bottom: item.rect.bottom };
                rows.push(currentRow);
                continue;
            }

            currentRow.items.push(item);
            currentRow.bottom = Math.max(currentRow.bottom, item.rect.bottom);
        }

        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];

        if (clientY < firstRow.top) return 0;
        if (clientY > lastRow.bottom) return items.length;

        for (const row of rows) {
            const rowMidY = (row.top + row.bottom) / 2;
            if (clientY < rowMidY) {
                return this.getRowInsertIndex(row.items, clientX);
            }
        }

        return this.getRowInsertIndex(lastRow.items, clientX);
    }

    private getRowInsertIndex(
        items: Array<{ rect: DOMRect; index: number }>,
        clientX: number
    ): number {
        for (const item of items) {
            const centerX = item.rect.left + item.rect.width / 2;
            if (clientX < centerX) {
                return item.index;
            }
        }

        const lastItem = items[items.length - 1];
        return lastItem.index + 1;
    }

    private getDropIndex(container: HTMLElement, clientX: number, clientY: number): number {
        if (this.dropPlaceholderContainer === container && this.dropPlaceholderIndex !== null) {
            return this.dropPlaceholderIndex;
        }
        return this.getInsertIndex(container, clientX, clientY);
    }

    private updateDropPlaceholder(container: HTMLElement, index: number): void {
        if (!this.dropPlaceholder) {
            this.dropPlaceholder = createElement('div', { className: 'drop-placeholder' });
        }

        const items = Array.from(
            container.querySelectorAll<HTMLElement>('[data-item-id]:not(.item-card--dragging)')
        );
        const clampedIndex = Math.max(0, Math.min(index, items.length));

        if (this.dropPlaceholderContainer === container && this.dropPlaceholderIndex === clampedIndex) {
            return;
        }

        this.dropPlaceholderContainer = container;
        this.dropPlaceholderIndex = clampedIndex;

        if (clampedIndex >= items.length) {
            container.appendChild(this.dropPlaceholder);
        } else {
            container.insertBefore(this.dropPlaceholder, items[clampedIndex]);
        }
    }

    private clearDropPlaceholder(): void {
        if (this.dropPlaceholder) {
            this.dropPlaceholder.remove();
        }
        this.dropPlaceholderIndex = null;
        this.dropPlaceholderContainer = null;
    }

    private shouldShowDropIndicator(clientX: number, clientY: number): boolean {
        if (!this.itemDragState) return true;
        if (this.itemDragState.fromTier !== this.props.tier.id) return true;

        const dx = clientX - this.itemDragState.startX;
        const dy = clientY - this.itemDragState.startY;
        return dx * dx + dy * dy >= 64;
    }

    private isNoopItemMove(insertIndex: number): boolean {
        const dragState = this.itemDragState;
        if (!dragState || dragState.fromTier !== this.props.tier.id) return false;

        const currentIndex = this.props.tier.items.indexOf(dragState.itemId);
        return currentIndex !== -1 && insertIndex === currentIndex;
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

    private moveCaretToEnd(element: HTMLElement): void {
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    private deferCaretToEnd(element: HTMLElement): void {
        requestAnimationFrame(() => {
            if (!element.isConnected) return;
            this.moveCaretToEnd(element);
        });
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
        this.itemComponentsById.clear();
        this.itemsContainer = null;
        this.labelElement = null;
        this.nameElement = null;
        this.moveUpButton = null;
        this.moveDownButton = null;
        this.clearDropPlaceholder();
    }
}
