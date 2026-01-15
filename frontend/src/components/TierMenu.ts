/**
 * TierMenu Component - Context menu for tier operations
 */

import { Component, createElement } from './Component';

export interface TierMenuProps {
    tierId: string;
    tierName: string;
    isFirst: boolean;
    isLast: boolean;
    anchorElement: HTMLElement;
}

interface TierMenuState {
    isOpen: boolean;
}

type TierMenuAction = 'moveUp' | 'moveDown' | 'delete';

export class TierMenu extends Component<TierMenuState, TierMenuProps> {
    private closeHandler: ((e: PointerEvent) => void) | null = null;

    constructor(props: TierMenuProps) {
        super(props, {
            initialState: { isOpen: false },
            className: 'tier-menu',
        });
    }

    render(): HTMLElement {
        const { isFirst, isLast, tierName } = this.props;
        const { isOpen } = this.state;

        const menu = createElement('div', {
            className: `tier-menu ${isOpen ? 'tier-menu--open' : ''}`,
            role: 'menu',
            'aria-label': `${tierName} options`,
        });

        if (!isOpen) {
            menu.style.display = 'none';
            this.element = menu;
            return menu;
        }

        // Position menu
        this.positionMenu(menu);

        // Menu items
        const moveUp = this.createMenuItem('↑ Move Up', 'moveUp', isFirst);
        const moveDown = this.createMenuItem('↓ Move Down', 'moveDown', isLast);
        const remove = this.createMenuItem('🗑 Delete', 'delete', false, true);

        menu.appendChild(moveUp);
        menu.appendChild(moveDown);
        menu.appendChild(remove);

        // Setup close on outside click
        this.setupCloseHandler();

        this.element = menu;
        return menu;
    }

    private createMenuItem(
        label: string,
        action: TierMenuAction,
        disabled: boolean,
        isDanger: boolean = false
    ): HTMLElement {
        const item = createElement('button', {
            className: `tier-menu__item ${isDanger ? 'tier-menu__item--danger' : ''} ${disabled ? 'tier-menu__item--disabled' : ''}`,
            'data-action': action,
            role: 'menuitem',
        }, [label]);

        if (disabled) {
            item.setAttribute('disabled', 'true');
        }

        item.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            if (disabled) return;

            this.handleAction(action);
            this.close();
        });

        return item;
    }

    private handleAction(action: TierMenuAction): void {
        const { tierId } = this.props;

        switch (action) {
            case 'moveUp':
                this.emit({ type: 'TIER_MOVE_UP', tierId });
                break;
            case 'moveDown':
                this.emit({ type: 'TIER_MOVE_DOWN', tierId });
                break;
            case 'delete':
                this.emit({ type: 'TIER_REMOVED', tierId });
                break;
        }
    }

    private positionMenu(menu: HTMLElement): void {
        const { anchorElement } = this.props;
        const rect = anchorElement.getBoundingClientRect();

        // Use fixed positioning so menu isn't clipped by overflow
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;
    }

    private setupCloseHandler(): void {
        // Remove old handler if exists
        this.removeCloseHandler();

        this.closeHandler = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            if (this.element.contains(target) || this.props.anchorElement.contains(target)) {
                return;
            }
            this.close();
        };

        // Use setTimeout to avoid immediate close
        setTimeout(() => {
            document.addEventListener('pointerdown', this.closeHandler!);
        }, 0);
    }

    private removeCloseHandler(): void {
        if (this.closeHandler) {
            document.removeEventListener('pointerdown', this.closeHandler);
            this.closeHandler = null;
        }
    }

    open(): void {
        this.setState({ isOpen: true });
    }

    close(): void {
        this.removeCloseHandler();
        this.setState({ isOpen: false });
    }

    toggle(): void {
        if (this.state.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    protected cleanup(): void {
        this.removeCloseHandler();
    }
}
