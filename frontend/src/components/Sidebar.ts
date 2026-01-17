/**
 * Sidebar Component - Unranked items panel
 */

import { Component, createElement } from './Component';
import { ItemCard } from './ItemCard';
import { getDragPayload } from '@/core/dragPayload';
import { matchesSearchQuery } from '@/core/itemFilters';
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
    private searchInput: HTMLInputElement | null = null;
    private countElement: HTMLElement | null = null;
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

        // Items
        body.appendChild(this.renderItems());

        sidebar.appendChild(body);

        this.element = sidebar;
        return sidebar;
    }

    updateProps(newProps: Partial<SidebarProps>): void {
        const prevProps = this.props;
        this.props = { ...this.props, ...newProps };

        const shouldRerender = !this.element.isConnected || !this.itemsContainer || !this.searchInput || !this.countElement;
        const closeControlChanged = Boolean(prevProps.onClose) !== Boolean(this.props.onClose);

        if (shouldRerender || closeControlChanged) {
            this.rerender();
            return;
        }

        const prevOpen = prevProps.isOpen ?? true;
        const nextOpen = this.props.isOpen ?? true;
        if (prevOpen !== nextOpen) {
            this.state.isOpen = nextOpen;
            this.element.classList.toggle('sidebar--open', nextOpen);
            this.element.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
        }

        const searchChanged = prevProps.searchQuery !== this.props.searchQuery;
        if (searchChanged) {
            this.state.searchQuery = this.props.searchQuery;
            this.updateSearchValue();
        }

        const itemsChanged = prevProps.items !== this.props.items;
        const selectionChanged = prevProps.selectedItems !== this.props.selectedItems;
        if (itemsChanged || selectionChanged || searchChanged) {
            this.refreshItems();
        }
    }

    private renderHeader(): HTMLElement {
        const { items } = this.props;
        const filteredItems = this.filterItems(items, this.state.searchQuery);
        const filteredCount = filteredItems.length;
        const totalCount = items.length;

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

        titleSection.appendChild(title);

        // Count badge
        const count = createElement('span', {
            className: 'sidebar__count sidebar-count',
            title: filteredCount === totalCount
                ? `${totalCount} items`
                : `Showing ${filteredCount} of ${totalCount}`,
            'aria-label': filteredCount === totalCount
                ? `${totalCount} items`
                : `Showing ${filteredCount} of ${totalCount}`,
        }, [filteredCount.toString()]);
        this.countElement = count;

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
            className: 'sidebar-tools-label sr-only',
            for: this.searchInputId,
        }, ['Find item']);

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search unranked...';
        input.className = 'sidebar__search-input';
        input.value = searchQuery;
        input.id = this.searchInputId;
        input.setAttribute('aria-controls', this.itemsContainerId);
        this.searchInput = input;

        input.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value;
            this.state.searchQuery = query;
            this.emit({ type: 'SEARCH_CHANGED', query });
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
        const filteredItems = this.filterItems(items, searchQuery);

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

        const filteredItems = this.filterItems(items, searchQuery);

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
        this.updateHeaderCount();
    }

    private setDropTarget(isDropTarget: boolean): void {
        if (this.state.isDropTarget === isDropTarget) return;
        this.state.isDropTarget = isDropTarget;
        this.element.classList.toggle('sidebar--drop-target', isDropTarget);
    }

    private filterItems(items: Item[], query: string): Item[] {
        if (!query.trim()) return items;
        return items.filter((item) => matchesSearchQuery(item, query));
    }

    private updateHeaderCount(): void {
        const count = this.countElement;
        if (!count) return;
        const filteredItems = this.filterItems(this.props.items, this.state.searchQuery);
        const filteredCount = filteredItems.length;
        const totalCount = this.props.items.length;
        const label = filteredCount === totalCount
            ? `${totalCount} items`
            : `Showing ${filteredCount} of ${totalCount}`;
        count.textContent = filteredCount.toString();
        count.setAttribute('title', label);
        count.setAttribute('aria-label', label);
    }

    private updateSearchValue(): void {
        const input = this.searchInput;
        if (!input) return;
        if (input.value === this.state.searchQuery) return;
        const isFocused = document.activeElement === input;
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        input.value = this.state.searchQuery;
        if (isFocused && selectionStart !== null && selectionEnd !== null) {
            const nextValue = input.value;
            const nextStart = Math.min(selectionStart, nextValue.length);
            const nextEnd = Math.min(selectionEnd, nextValue.length);
            input.setSelectionRange(nextStart, nextEnd);
        }
    }

    protected cleanup(): void {
        this.itemComponents.forEach(c => c.destroy());
        this.itemComponents = [];
        this.itemsContainer = null;
        this.searchInput = null;
        this.countElement = null;
    }
}
