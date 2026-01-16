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
    isOpen: boolean;
    onClose?: () => void;
}

interface SidebarState {
    isDropTarget: boolean;
    searchQuery: string;
    isOpen: boolean;
}

export class Sidebar extends Component<SidebarState, SidebarProps> {
    private static nextId = 0;
    private itemComponents: ItemCard[] = [];
    private itemsContainer: HTMLElement | null = null;
    private readonly searchInputId: string;
    private readonly itemsContainerId: string;

    constructor(props: SidebarProps) {
        super(props, {
            initialState: {
                isDropTarget: false,
                searchQuery: props.searchQuery,
                isOpen: props.isOpen ?? true,
            },
            className: 'sidebar',
        });

        const instanceId = Sidebar.nextId;
        Sidebar.nextId += 1;
        this.searchInputId = `sidebar-search-${instanceId}`;
        this.itemsContainerId = `sidebar-items-${instanceId}`;
    }

    render(): HTMLElement {
        const { isDropTarget } = this.state;

        if (this.props.searchQuery !== this.state.searchQuery) {
            this.state.searchQuery = this.props.searchQuery;
        }

        const isOpen = this.props.isOpen ?? this.state.isOpen;
        const sidebar = createElement('aside', {
            className: `sidebar ${isOpen ? 'sidebar--open' : ''} ${isDropTarget ? 'sidebar--drop-target' : ''}`,
            id: 'tierforge-sidebar',
            'aria-label': 'Unranked items',
            'aria-hidden': isOpen ? 'false' : 'true',
        });

        // Header
        sidebar.appendChild(this.renderHeader());

        // Body contains search and items
        const body = createElement('div', {
            className: 'sidebar-body',
        });

        // Search
        body.appendChild(this.renderSearch());

        // Meta info
        body.appendChild(this.renderMeta());

        // Items
        body.appendChild(this.renderItems());

        sidebar.appendChild(body);

        this.element = sidebar;
        return sidebar;
    }

    private renderMeta(): HTMLElement {
        const { items } = this.props;
        const { searchQuery } = this.state;

        const meta = createElement('div', {
            className: 'sidebar-meta',
        });

        const label = createElement('span', {}, ['Not in tier list']);

        const filteredCount = searchQuery
            ? items.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            ).length
            : items.length;

        const count = createElement('span', {
            className: 'sidebar-meta-count',
        }, [filteredCount.toString()]);

        meta.appendChild(label);
        meta.appendChild(count);

        return meta;
    }

    private renderHeader(): HTMLElement {
        const { items } = this.props;

        const header = createElement('div', {
            className: 'sidebar__header sidebar-header',
        });

        // Title section
        const titleSection = createElement('div', {
            className: 'sidebar-title',
        });

        const title = createElement('h2', {
            className: 'sidebar__title',
        }, ['Unranked']);

        const subtitle = createElement('p', {
            className: 'sidebar__subtitle',
        }, ['Waiting to be placed']);

        titleSection.appendChild(title);
        titleSection.appendChild(subtitle);

        // Count badge
        const count = createElement('span', {
            className: 'sidebar__count sidebar-count',
        }, [items.length.toString()]);

        const controls = createElement('div', {
            className: 'sidebar__controls',
        });
        controls.appendChild(count);

        if (this.props.onClose) {
            const closeButton = createElement('button', {
                className: 'sidebar-close',
                type: 'button',
                title: 'Close sidebar',
                'aria-label': 'Close sidebar',
            }, ['x']);
            closeButton.addEventListener('click', (event: MouseEvent) => {
                event.preventDefault();
                this.props.onClose?.();
            });
            controls.appendChild(closeButton);
        }

        header.appendChild(titleSection);
        header.appendChild(controls);

        return header;
    }

    private renderSearch(): HTMLElement {
        const { searchQuery } = this.state;

        const searchContainer = createElement('div', {
            className: 'sidebar-tools',
            role: 'search',
        });

        const label = createElement('label', {
            className: 'sidebar-tools-label',
            for: this.searchInputId,
        }, ['Find item']);

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search unranked...';
        input.className = 'sidebar__search-input';
        input.value = searchQuery;
        input.id = this.searchInputId;
        input.setAttribute('aria-controls', this.itemsContainerId);

        input.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value;
            this.state.searchQuery = query;
            this.emit({ type: 'SEARCH_CHANGED', query });
            this.refreshItems();
        });

        searchContainer.appendChild(label);
        searchContainer.appendChild(input);
        return searchContainer;
    }

    private renderItems(): HTMLElement {
        const { items, selectedItems } = this.props;
        const { searchQuery } = this.state;

        const container = createElement('div', {
            className: 'sidebar__items sidebar-items',
            id: this.itemsContainerId,
            role: 'list',
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

        // Empty state
        if (filteredItems.length === 0) {
            const empty = createElement('div', {
                className: 'sidebar-empty',
            }, [searchQuery ? 'No items match your search' : 'All items have been ranked!']);
            container.appendChild(empty);
        } else {
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
        }

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

        if (filteredItems.length === 0) {
            const empty = createElement('div', {
                className: 'sidebar-empty',
            }, [searchQuery ? 'No items match your search' : 'All items have been ranked!']);
            container.appendChild(empty);
        } else {
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
