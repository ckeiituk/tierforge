/**
 * Sidebar Component - Unranked items panel
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import type { Item } from '@/types';

export interface SidebarProps {
    items: Item[];
    searchQuery: string;
}

interface SidebarState {
    isDropTarget: boolean;
    localSearchQuery: string;
}

export class Sidebar extends Component<SidebarState, SidebarProps> {
    private itemComponents: ItemCard[] = [];

    constructor(props: SidebarProps) {
        super(props, {
            initialState: {
                isDropTarget: false,
                localSearchQuery: props.searchQuery,
            },
            className: 'sidebar',
        });
    }

    render(): HTMLElement {
        const { items } = this.props;
        const { isDropTarget, localSearchQuery } = this.state;

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
        const { localSearchQuery } = this.state;

        const searchContainer = createElement('div', {
            className: 'sidebar__search',
        });

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search...';
        input.className = 'sidebar__search-input';
        input.value = localSearchQuery;

        input.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value;
            this.setState({ localSearchQuery: query });
            this.emit({ type: 'SEARCH_CHANGED', query } as any);
        });

        searchContainer.appendChild(input);
        return searchContainer;
    }

    private renderItems(): HTMLElement {
        const { items } = this.props;
        const { localSearchQuery } = this.state;

        const container = createElement('div', {
            className: 'sidebar__items',
        });

        // Clean up old components
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];

        // Filter items
        const filteredItems = localSearchQuery
            ? items.filter(item =>
                item.name.toLowerCase().includes(localSearchQuery.toLowerCase())
            )
            : items;

        // Create item cards
        filteredItems.forEach(item => {
            const card = new ItemCard({
                item,
                containerId: 'unranked',
            });
            this.itemComponents.push(card);
            container.appendChild(card.render());
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
                    fromTier: 'unknown',
                    toTier: 'unranked',
                    position: 0,
                });
            }
        });
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];
    }
}
