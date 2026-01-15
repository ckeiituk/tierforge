/**
 * Header Component - Game switcher, sheet tabs, and action buttons
 */

import { Component, createElement } from './Component';
import type { Game, SheetConfig } from '@/types';

export interface HeaderProps {
    game: Game | null;
    games: Game[];
    currentSheet: SheetConfig | null;
    canUndo: boolean;
    canRedo: boolean;
    shareCode?: string;
}

interface HeaderState {
    isGameMenuOpen: boolean;
}

export class Header extends Component<HeaderState, HeaderProps> {
    constructor(props: HeaderProps) {
        super(props, {
            initialState: { isGameMenuOpen: false },
            className: 'header',
        });
    }

    render(): HTMLElement {
        const header = createElement('header', {
            className: 'header',
        });

        const content = createElement('div', {
            className: 'header__content',
        });

        content.appendChild(this.renderLeft());
        content.appendChild(this.renderRight());

        header.appendChild(content);
        this.element = header;
        return header;
    }

    private renderLeft(): HTMLElement {
        const left = createElement('div', {
            className: 'header__left',
        });

        left.appendChild(this.renderGameSwitcher());
        left.appendChild(this.renderSheetTabs());

        return left;
    }

    private renderGameSwitcher(): HTMLElement {
        const { game, games } = this.props;
        const { isGameMenuOpen } = this.state;

        const switcher = createElement('div', {
            className: 'game-switcher',
        });

        const btn = createElement('button', {
            className: 'game-switcher__btn',
            'aria-expanded': isGameMenuOpen ? 'true' : 'false',
        });

        const name = createElement('span', {
            className: 'game-switcher__name',
        }, [game?.name || 'Select Game']);

        const arrow = createElement('span', {
            className: 'game-switcher__arrow',
        }, ['▼']);

        btn.appendChild(name);
        btn.appendChild(arrow);

        btn.addEventListener('click', () => {
            this.setState({ isGameMenuOpen: !isGameMenuOpen });
        });

        switcher.appendChild(btn);

        // Dropdown
        if (isGameMenuOpen && games.length > 0) {
            const dropdown = this.renderGameDropdown();
            switcher.appendChild(dropdown);
        }

        return switcher;
    }

    private renderGameDropdown(): HTMLElement {
        const { game, games } = this.props;

        const dropdown = createElement('div', {
            className: 'game-switcher__dropdown',
        });

        games.forEach(g => {
            const item = createElement('button', {
                className: `game-switcher__item ${g.id === game?.id ? 'game-switcher__item--active' : ''}`,
            }, [g.name]);

            item.addEventListener('click', () => {
                window.location.href = `?game=${g.id}`;
            });

            dropdown.appendChild(item);
        });

        // Close on outside click
        setTimeout(() => {
            const closeHandler = (e: PointerEvent) => {
                if (!dropdown.contains(e.target as Node)) {
                    this.setState({ isGameMenuOpen: false });
                    document.removeEventListener('pointerdown', closeHandler);
                }
            };
            document.addEventListener('pointerdown', closeHandler);
        }, 0);

        return dropdown;
    }

    private renderSheetTabs(): HTMLElement {
        const { game, currentSheet } = this.props;

        const tabs = createElement('div', {
            className: 'sheet-tabs',
        });

        if (!game?.sheets) return tabs;

        game.sheets.forEach(sheet => {
            const tab = createElement('button', {
                className: `sheet-tabs__tab ${sheet.id === currentSheet?.id ? 'sheet-tabs__tab--active' : ''}`,
            }, [sheet.name]);

            tab.addEventListener('click', () => {
                this.emit({ type: 'SHEET_CHANGE_REQUESTED', sheet });
            });

            tabs.appendChild(tab);
        });

        return tabs;
    }

    private renderRight(): HTMLElement {
        const { canUndo, canRedo, shareCode } = this.props;

        const right = createElement('div', {
            className: 'header__right',
        });

        const actions = createElement('div', {
            className: 'header__actions',
        });

        // Undo button
        const undoBtn = createElement('button', {
            className: `btn btn--ghost ${!canUndo ? 'btn--disabled' : ''}`,
            title: 'Undo (Ctrl+Z)',
        }, ['↶']);

        undoBtn.addEventListener('click', () => {
            if (canUndo) this.emit({ type: 'UNDO' });
        });
        undoBtn.toggleAttribute('disabled', !canUndo);

        // Redo button
        const redoBtn = createElement('button', {
            className: `btn btn--ghost ${!canRedo ? 'btn--disabled' : ''}`,
            title: 'Redo (Ctrl+Y)',
        }, ['↷']);

        redoBtn.addEventListener('click', () => {
            if (canRedo) this.emit({ type: 'REDO' });
        });
        redoBtn.toggleAttribute('disabled', !canRedo);

        // Share button
        const shareBtn = createElement('button', {
            className: 'btn btn--primary',
        }, ['Share']);

        shareBtn.addEventListener('click', async () => {
            if (!shareCode) return;
            const url = `${window.location.origin}?s=${shareCode}`;
            await navigator.clipboard.writeText(url);
            alert('Link copied to clipboard!');
        });
        shareBtn.toggleAttribute('disabled', !shareCode);

        actions.appendChild(undoBtn);
        actions.appendChild(redoBtn);
        actions.appendChild(shareBtn);
        right.appendChild(actions);

        return right;
    }
}
