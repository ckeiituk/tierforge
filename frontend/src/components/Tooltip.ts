/**
 * Tooltip Component - Renders item tooltips using game adapters
 */

import { Component, createElement } from './Component';
import { adapterRegistry } from '@/adapters/GameAdapter';
import type { Item } from '@/types';

export interface TooltipProps {
    item: Item | null;
    anchorElement: HTMLElement | null;
    gameId: string | null;
    isVisible: boolean;
}

export class Tooltip extends Component<Record<string, never>, TooltipProps> {
    constructor(props: TooltipProps) {
        super(props, {
            initialState: {},
            className: 'tooltip',
        });
    }

    render(): HTMLElement {
        const { item, anchorElement, gameId, isVisible } = this.props;

        const tooltip = createElement('div', {
            className: `tooltip ${isVisible ? 'tooltip--visible' : ''}`,
        });

        if (!isVisible || !item || !anchorElement || !gameId) {
            tooltip.style.display = 'none';
            this.element = tooltip;
            return tooltip;
        }

        tooltip.style.display = 'block';
        this.positionTooltip(tooltip, anchorElement);

        const content = createElement('div', {
            className: 'tooltip__content',
        });

        const adapter = adapterRegistry.get(gameId);
        if (adapter) {
            content.appendChild(adapter.renderTooltip(item));
        } else {
            content.textContent = item.name;
        }

        tooltip.appendChild(content);
        this.element = tooltip;
        return tooltip;
    }

    private positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        const offset = 12;

        tooltip.style.position = 'fixed';
        tooltip.style.top = `${rect.bottom + offset}px`;
        tooltip.style.left = `${rect.left}px`;
    }
}
