import { eventBus } from './EventBus';

interface DragState {
    itemId: string | null;
    sourceContainer: string | null;
    sourceIndex: number;
    ghostElement: HTMLElement | null;
    ghostMoveHandler: ((e: DragEvent) => void) | null;
    placeholder: HTMLElement | null;
    lastDropTarget: HTMLElement | null;
}

/**
 * Modern drag & drop system with smooth animations
 */
class DragDropManager {
    private state: DragState = {
        itemId: null,
        sourceContainer: null,
        sourceIndex: -1,
        ghostElement: null,
        ghostMoveHandler: null,
        placeholder: null,
        lastDropTarget: null,
    };

    private dropZones: Map<string, HTMLElement> = new Map();
    private dragItems: Map<string, HTMLElement> = new Map();

    /**
     * Register a drop zone (tier row or unranked list)
     */
    registerDropZone(id: string, element: HTMLElement): void {
        this.dropZones.set(id, element);
        element.dataset.dropzone = id;

        element.addEventListener('dragover', this.handleDragOver.bind(this));
        element.addEventListener('dragleave', this.handleDragLeave.bind(this));
        element.addEventListener('drop', this.handleDrop.bind(this));
    }

    /**
     * Unregister a drop zone
     */
    unregisterDropZone(id: string): void {
        const element = this.dropZones.get(id);
        if (element) {
            element.removeEventListener('dragover', this.handleDragOver.bind(this));
            element.removeEventListener('dragleave', this.handleDragLeave.bind(this));
            element.removeEventListener('drop', this.handleDrop.bind(this));
            this.dropZones.delete(id);
        }
    }

    /**
     * Make an item draggable
     */
    registerDraggable(itemId: string, element: HTMLElement, containerId: string): void {
        this.dragItems.set(itemId, element);
        element.draggable = true;
        element.dataset.itemId = itemId;
        element.dataset.container = containerId;

        element.addEventListener('dragstart', this.handleDragStart.bind(this));
        element.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    /**
     * Remove draggable behavior
     */
    unregisterDraggable(itemId: string): void {
        const element = this.dragItems.get(itemId);
        if (element) {
            element.removeEventListener('dragstart', this.handleDragStart.bind(this));
            element.removeEventListener('dragend', this.handleDragEnd.bind(this));
            this.dragItems.delete(itemId);
        }
    }

    private handleDragStart(e: DragEvent): void {
        const target = e.target as HTMLElement;
        const itemId = target.dataset.itemId;
        const containerId = target.dataset.container;

        if (!itemId || !containerId) return;

        this.state.itemId = itemId;
        this.state.sourceContainer = containerId;
        this.state.sourceIndex = this.getItemIndex(target);

        // Set drag data
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', itemId);

        // Create ghost element
        this.createGhost(target);

        // Add dragging class after a frame
        requestAnimationFrame(() => {
            target.classList.add('dragging');
            document.body.classList.add('is-dragging');
        });
    }

    private handleDragEnd(e: DragEvent): void {
        const target = e.target as HTMLElement;
        target.classList.remove('dragging');
        document.body.classList.remove('is-dragging');

        this.removeGhost();
        this.removePlaceholder();
        this.clearDropTargetStyles();

        this.state = {
            itemId: null,
            sourceContainer: null,
            sourceIndex: -1,
            ghostElement: null,
            ghostMoveHandler: null,
            placeholder: null,
            lastDropTarget: null,
        };
    }

    private handleDragOver(e: DragEvent): void {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';

        const dropZone = (e.currentTarget as HTMLElement);
        dropZone.classList.add('drop-target');

        // Update placeholder position
        const insertIndex = this.getInsertIndex(dropZone, e.clientX, e.clientY);
        this.updatePlaceholder(dropZone, insertIndex);
    }

    private handleDragLeave(e: DragEvent): void {
        const dropZone = (e.currentTarget as HTMLElement);

        // Check if we're actually leaving the drop zone
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (relatedTarget && dropZone.contains(relatedTarget)) {
            return;
        }

        dropZone.classList.remove('drop-target');
    }

    private handleDrop(e: DragEvent): void {
        e.preventDefault();

        const dropZone = e.currentTarget as HTMLElement;
        const targetContainer = dropZone.dataset.dropzone;

        if (!targetContainer || !this.state.itemId || !this.state.sourceContainer) {
            return;
        }

        const insertIndex = this.getInsertIndex(dropZone, e.clientX, e.clientY);

        // Emit move event
        eventBus.emit({
            type: 'ITEM_MOVED',
            itemId: this.state.itemId,
            fromTier: this.state.sourceContainer,
            toTier: targetContainer,
            position: insertIndex,
        });

        dropZone.classList.remove('drop-target');
        this.removePlaceholder();
    }

    private createGhost(original: HTMLElement): void {
        const ghost = original.cloneNode(true) as HTMLElement;
        ghost.classList.add('drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '10000';
        ghost.style.opacity = '0.8';
        ghost.style.transform = 'scale(1.05)';

        document.body.appendChild(ghost);
        this.state.ghostElement = ghost;

        // Follow cursor
        const moveGhost = (e: DragEvent) => {
            ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`;
            ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`;
        };

        document.addEventListener('dragover', moveGhost);
        this.state.ghostMoveHandler = moveGhost;
    }

    private removeGhost(): void {
        if (this.state.ghostElement) {
            if (this.state.ghostMoveHandler) {
                document.removeEventListener('dragover', this.state.ghostMoveHandler);
                this.state.ghostMoveHandler = null;
            }
            this.state.ghostElement.remove();
            this.state.ghostElement = null;
        }
    }

    private createPlaceholder(): HTMLElement {
        const placeholder = document.createElement('div');
        placeholder.className = 'drop-placeholder';
        return placeholder;
    }

    private updatePlaceholder(container: HTMLElement, index: number): void {
        if (!this.state.placeholder) {
            this.state.placeholder = this.createPlaceholder();
        }

        const items = Array.from(container.querySelectorAll('[data-item-id]:not(.dragging)'));

        if (index >= items.length) {
            container.appendChild(this.state.placeholder);
        } else {
            container.insertBefore(this.state.placeholder, items[index]);
        }
    }

    private removePlaceholder(): void {
        if (this.state.placeholder) {
            this.state.placeholder.remove();
            this.state.placeholder = null;
        }
    }

    private clearDropTargetStyles(): void {
        this.dropZones.forEach((zone) => {
            zone.classList.remove('drop-target');
        });
    }

    private getItemIndex(element: HTMLElement): number {
        const container = element.parentElement;
        if (!container) return -1;

        const items = Array.from(container.querySelectorAll('[data-item-id]'));
        return items.indexOf(element);
    }

    private getInsertIndex(container: HTMLElement, clientX: number, clientY: number): number {
        const items = Array.from(container.querySelectorAll('[data-item-id]:not(.dragging)'));

        for (let i = 0; i < items.length; i++) {
            const rect = items[i].getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Check if cursor is before this item
            if (clientY < centerY || (clientY >= rect.top && clientY <= rect.bottom && clientX < centerX)) {
                return i;
            }
        }

        return items.length;
    }
}

// Singleton instance
export const dragDropManager = new DragDropManager();
