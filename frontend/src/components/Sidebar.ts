/**
 * Sidebar Component - Unranked items panel
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import { getDragPayload } from '@/core/dragPayload';
import type { Item } from '@/types';

export interface SidebarProps {
    items: Item[];
    searchQuery: string;
    selectedItems: Set<string>;
}

interface SidebarState {
    isDropTarget: boolean;
    searchQuery: string;
}

export class Sidebar extends Component<SidebarState, SidebarProps> {
    private itemComponents: ItemCard[] = [];
    private itemsContainer: HTMLElement | null = null;

    constructor(props: SidebarProps) {
        super(props, {
            initialState: {
                isDropTarget: false,
                searchQuery: props.searchQuery,
            },
            className: 'sidebar',
        });
    }

    render(): HTMLElement {
        const { isDropTarget } = this.state;

        if (this.props.searchQuery !== this.state.searchQuery) {
            this.state.searchQuery = this.props.searchQuery;
        }

        const sidebar = createElement('aside', {
            className: `sidebar ${isDropTarget ? 'sidebar--drop-target' : ''}`,
        });

        // Header
        sidebar.appendChild(this.renderHeader());

        // Search
        sidebar.appendChild(this.renderSearch());

        // Items
        sidebar.appendChild(this.renderItems());

        this.element = sidebar;
        return sidebar;
    }

    private renderHeader(): HTMLElement {
        const { items } = this.props;

        const header = createElement('div', {
            className: 'sidebar__header',
        });

        const title = createElement('h2', {
            className: 'sidebar__title',
        }, ['Unranked']);

        const count = createElement('span', {
            className: 'sidebar__count',
        }, [items.length.toString()]);

        header.appendChild(title);
        header.appendChild(count);

        return header;
    }

    private renderSearch(): HTMLElement {
        const { searchQuery } = this.state;

        const searchContainer = createElement('div', {
            className: 'sidebar__search',
        });

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search...';
        input.className = 'sidebar__search-input';
        input.value = searchQuery;

        input.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value;
            this.state.searchQuery = query;
            this.emit({ type: 'SEARCH_CHANGED', query });
            this.refreshItems();
        });

        searchContainer.appendChild(input);
        return searchContainer;
    }

    private renderItems(): HTMLElement {
        const { items, selectedItems } = this.props;
        const { searchQuery } = this.state;

        const container = createElement('div', {
            className: 'sidebar__items',
        });
        this.itemsContainer = container;

        // Clean up old components
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];

        // Filter items
        const filteredItems = searchQuery
            ? items.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : items;

        // Create item cards
        filteredItems.forEach(item => {
            const card = new ItemCard({
                item,
                containerId: 'unranked',
                isSelected: selectedItems.has(item.id),
            });
            this.itemComponents.push(card);
            container.appendChild(card.render());
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
                    toTier: 'unranked',
                    position: 0,
                });
            }
        });
    }

    private refreshItems(): void {
        const container = this.itemsContainer;
        if (!container) return;
        container.innerHTML = '';
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];

        const { items, selectedItems } = this.props;
        const { searchQuery } = this.state;

        const filteredItems = searchQuery
            ? items.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : items;

        filteredItems.forEach(item => {
            const card = new ItemCard({
                item,
                containerId: 'unranked',
                isSelected: selectedItems.has(item.id),
            });
            this.itemComponents.push(card);
            container.appendChild(card.render());
        });
    }

    private setDropTarget(isDropTarget: boolean): void {
        if (this.state.isDropTarget === isDropTarget) return;
        this.state.isDropTarget = isDropTarget;
        this.element.classList.toggle('sidebar--drop-target', isDropTarget);
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];
        this.itemsContainer = null;
    }
}
