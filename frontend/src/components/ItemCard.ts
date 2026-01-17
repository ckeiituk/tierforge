/**
 * ItemCard Component - Represents a single rankable item
 */

import { Component, createElement } from './Component';
import { setDragPayload } from '@/core/dragPayload';
import { adapterRegistry } from '@/adapters/GameAdapter';
import type { Item } from '@/types';

export interface ItemCardProps {
    item: Item;
    containerId: string;
    isSelected?: boolean;
    isDimmed?: boolean;
    isHighlighted?: boolean;
}

export class ItemCard extends Component<Record<string, never>, ItemCardProps> {
    private iconElement: HTMLImageElement | null = null;
    private nameElement: HTMLElement | null = null;

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
            role: 'button',
            tabindex: '0',
            'aria-pressed': this.props.isSelected ? 'true' : 'false',
        });
        card.setAttribute('title', item.name);

        // Item icon
        const icon = createElement('img', {
            className: 'item-card__icon',
            src: item.icon || '/icons/placeholder.png',
            alt: item.name,
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
        }) as HTMLImageElement;
        this.iconElement = icon;

        // Item name overlay
        const name = createElement('span', {
            className: 'item-card__name',
        }, [item.name]);
        this.nameElement = name;

        card.appendChild(icon);
        card.appendChild(name);

        // Event handlers
        this.setupEventHandlers(card);

        // Apply combo border if applicable
        this.applyComboBorder(card, item);

        this.element = card;
        return card;
    }

    updateProps(newProps: Partial<ItemCardProps>): void {
        this.props = { ...this.props, ...newProps };
        if (!this.element || !this.element.isConnected) {
            this.rerender();
            return;
        }

        const { item, containerId } = this.props;
        this.element.setAttribute('aria-pressed', this.props.isSelected ? 'true' : 'false');
        this.element.setAttribute('title', item.name);
        this.element.classList.toggle('item-card--selected', Boolean(this.props.isSelected));
        this.element.classList.toggle('item-card--dimmed', Boolean(this.props.isDimmed));
        this.element.classList.toggle('item-card--highlighted', Boolean(this.props.isHighlighted));

        if (this.element.dataset.itemId !== item.id) {
            this.element.dataset.itemId = item.id;
        }
        if (this.element.dataset.containerId !== containerId) {
            this.element.dataset.containerId = containerId;
        }

        if (this.iconElement) {
            const nextIcon = item.icon || '/icons/placeholder.png';
            if (this.iconElement.getAttribute('src') !== nextIcon) {
                this.iconElement.setAttribute('src', nextIcon);
            }
            if (this.iconElement.alt !== item.name) {
                this.iconElement.alt = item.name;
            }
        }

        if (this.nameElement && this.nameElement.textContent !== item.name) {
            this.nameElement.textContent = item.name;
        }

        // Update combo border
        this.applyComboBorder(this.element, item);
    }

    private getClassName(): string {
        const classes = ['item-card'];

        if (this.props.isSelected) classes.push('item-card--selected');
        if (this.props.isDimmed) classes.push('item-card--dimmed');
        if (this.props.isHighlighted) classes.push('item-card--highlighted');

        return classes.join(' ');
    }

    // School colors for combo skills (secondary school border)
    private static SCHOOL_COLORS: Record<string, string> = {
        "Аэротеургия": "#7478DC",
        "Геомантия": "#AA895B",
        "Гидрософистика": "#579CCA",
        "Пирокинетика": "#C76537",
        "Некромантия": "#9A5085",
        "Превращение": "#FFB811",
        "Призывание": "#9440B3",
        "Мастерство охоты": "#5A9646",
        "Искусство убийства": "#566C6C",
        "Военное дело": "#A11919",
        "Магия Истока": "#6EB09D",
        "Особые навыки": "#922db3", // Keep existing for special
    };

    private applyComboBorder(card: HTMLElement, item: Item): void {
        const data = item.data as Record<string, unknown>;
        // Check for is_combo flag or just presence of secondary_school
        if (data.is_combo || data.secondary_school) {
            const secondary = data.secondary_school as string;
            const color = ItemCard.SCHOOL_COLORS[secondary];
            if (color) {
                card.style.borderColor = color;
                card.style.borderWidth = "2px";
                card.style.borderStyle = "solid";
            } else {
                card.style.borderColor = "";
                card.style.borderWidth = "";
                card.style.borderStyle = "";
            }
        } else {
            // Reset if not combo (important for recycling)
            card.style.borderColor = "";
            card.style.borderWidth = "";
            card.style.borderStyle = "";
        }
    }

    private setupEventHandlers(card: HTMLElement): void {
        const tooltipId = 'tierforge-tooltip';

        // Hover for tooltip
        card.addEventListener('mouseenter', () => {
            card.setAttribute('aria-describedby', tooltipId);
            this.emit({
                type: 'ITEM_HOVERED',
                itemId: this.props.item.id,
                element: card,
            });
        });

        card.addEventListener('mouseleave', () => {
            card.removeAttribute('aria-describedby');
            this.emit({ type: 'ITEM_UNHOVERED', itemId: this.props.item.id });
        });

        card.addEventListener('focus', () => {
            card.setAttribute('aria-describedby', tooltipId);
            this.emit({
                type: 'ITEM_HOVERED',
                itemId: this.props.item.id,
                element: card,
            });
        });

        card.addEventListener('blur', () => {
            card.removeAttribute('aria-describedby');
            this.emit({ type: 'ITEM_UNHOVERED', itemId: this.props.item.id });
        });

        // Click for wiki or selection
        card.addEventListener('click', (e: MouseEvent) => {
            const isSelectionModifier = e.shiftKey || e.ctrlKey || e.metaKey;
            if (this.maybeOpenWiki(isSelectionModifier)) return;

            const multiSelect = e.ctrlKey || e.metaKey;
            const rangeSelect = e.shiftKey;

            this.emit({
                type: 'ITEM_CLICKED',
                itemId: this.props.item.id,
                multiSelect,
                rangeSelect,
            });
        });

        card.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const isSelectionModifier = e.shiftKey || e.ctrlKey || e.metaKey;
                if (this.maybeOpenWiki(isSelectionModifier)) return;
                this.emit({
                    type: 'ITEM_CLICKED',
                    itemId: this.props.item.id,
                    multiSelect: e.ctrlKey || e.metaKey,
                    rangeSelect: e.shiftKey,
                });
            }

            if (e.key === ' ') {
                e.preventDefault();
                this.emit({
                    type: 'ITEM_CLICKED',
                    itemId: this.props.item.id,
                    multiSelect: true,
                    rangeSelect: e.shiftKey,
                });
            }
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
                startClientX: e.clientX,
                startClientY: e.clientY,
            });
        });

        card.addEventListener('dragend', (e: DragEvent) => {
            card.classList.remove('item-card--dragging');
            document.body.classList.remove('is-dragging');
            this.emit({
                type: 'DRAG_END',
                itemId: this.props.item.id,
                clientX: e.clientX,
                clientY: e.clientY,
            });
        });
    }

    private maybeOpenWiki(selectionModifier: boolean): boolean {
        if (selectionModifier) return false;
        const wikiUrl = this.getWikiUrl();
        if (!wikiUrl) return false;
        window.open(wikiUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    private getWikiUrl(): string | null {
        const item = this.props.item;
        const adapter = adapterRegistry.get(item.game_id);
        const adapterRu = adapter?.getWikiUrl?.(item, 'ru');
        if (adapterRu) return adapterRu;

        const data = item.data as Record<string, unknown>;
        const ruUrl = this.getStringValue(data.ru_url)
            ?? this.getStringValue(data.wiki_url_ru)
            ?? this.getStringValue(data.wiki_ru);
        if (ruUrl) return ruUrl;

        return adapter?.getWikiUrl?.(item, 'en') ?? this.getStringValue(data.wiki_url);
    }

    private getStringValue(value: unknown): string | null {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
}
