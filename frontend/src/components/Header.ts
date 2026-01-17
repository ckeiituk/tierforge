/**
 * Header Component - Game switcher, sheet tabs, and action buttons
 */

import { Component, createElement } from './Component';
import type { FilterConfig, Game, SheetConfig, TierListPreset } from '@/types';

export interface HeaderProps {
    game: Game | null;
    games: Game[];
    currentSheet: SheetConfig | null;
    canUndo: boolean;
    canRedo: boolean;
    shareCode?: string;
    presets?: TierListPreset[];
    activePresetId?: string | null;
    activeFilters?: Record<string, string[]>;
    filters?: FilterConfig[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type ToastTone = 'neutral' | 'success' | 'error';

interface HeaderState {
    isGameMenuOpen: boolean;
    saveStatus: SaveStatus;
    editingPresetId: string | null;
    toastMessage: string | null;
    toastTone: ToastTone;
}

const DOS2_SCHOOL_LABELS: Record<string, string> = {
    'Аэротеургия': 'Aerotheurge',
    'Геомантия': 'Geomancer',
    'Гидрософистика': 'Hydrosophist',
    'Пирокинетика': 'Pyrokinetic',
    'Некромантия': 'Necromancer',
    'Призывание': 'Summoning',
    'Превращение': 'Polymorph',
    'Искусство убийства': 'Scoundrel',
    'Мастерство охоты': 'Huntsman',
    'Военное дело': 'Warfare',
    'Магия Истока': 'Source',
    'Особые навыки': 'Special Skills',
};

const getFilterOptionLabel = (filter: FilterConfig, option: string): string => {
    if (filter.id !== 'school') return option;
    return DOS2_SCHOOL_LABELS[option] ?? option;
};

export class Header extends Component<HeaderState, HeaderProps> {
    private editingPresetDraft: string | null = null;
    private saveStatusTimeoutId: number | null = null;
    private toastTimeoutId: number | null = null;
    private gameMenuCloseHandler: ((event: PointerEvent) => void) | null = null;
    private gameMenuKeyHandler: ((event: KeyboardEvent) => void) | null = null;
    private readonly gameMenuId = 'tierforge-game-menu';

    constructor(props: HeaderProps) {
        super(props, {
            initialState: {
                isGameMenuOpen: false,
                saveStatus: 'idle',
                editingPresetId: null,
                toastMessage: null,
                toastTone: 'neutral',
            },
            className: 'header',
        });

        this.setupAutosaveListeners();
    }

    private setupAutosaveListeners(): void {
        this.on('autosave:start', () => this.setSaveStatus('saving'));
        this.on('autosave:success', () => {
            this.setSaveStatus('saved', 2000);
        });
        this.on('autosave:error', () => this.setSaveStatus('error', 4000));
    }

    private setSaveStatus(status: SaveStatus, autoClearMs?: number): void {
        if (this.saveStatusTimeoutId !== null) {
            window.clearTimeout(this.saveStatusTimeoutId);
            this.saveStatusTimeoutId = null;
        }
        this.setState({ saveStatus: status });
        if (autoClearMs) {
            this.saveStatusTimeoutId = window.setTimeout(() => {
                this.setState({ saveStatus: 'idle' });
                this.saveStatusTimeoutId = null;
            }, autoClearMs);
        }
    }

    private showToast(message: string, tone: ToastTone = 'neutral'): void {
        if (this.toastTimeoutId !== null) {
            window.clearTimeout(this.toastTimeoutId);
            this.toastTimeoutId = null;
        }
        this.setState({ toastMessage: message, toastTone: tone });
        this.toastTimeoutId = window.setTimeout(() => {
            this.setState({ toastMessage: null, toastTone: 'neutral' });
            this.toastTimeoutId = null;
        }, 2600);
    }

    private async copyToClipboard(text: string): Promise<boolean> {
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                console.warn('Clipboard API failed', error);
            }
        }
        return this.fallbackCopyToClipboard(text);
    }

    private fallbackCopyToClipboard(text: string): boolean {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.select();

        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (error) {
            console.warn('Fallback copy failed', error);
        }

        document.body.removeChild(textarea);
        return success;
    }

    private closeGameMenu(): void {
        if (!this.state.isGameMenuOpen) return;
        this.setState({ isGameMenuOpen: false });
        this.removeGameMenuHandlers();
    }

    private attachGameMenuHandlers(dropdown: HTMLElement): void {
        this.removeGameMenuHandlers();

        this.gameMenuCloseHandler = (event: PointerEvent) => {
            if (!dropdown.isConnected) {
                this.closeGameMenu();
                return;
            }
            const target = event.target as Node | null;
            if (!target) return;
            if (dropdown.contains(target)) return;
            this.closeGameMenu();
        };

        this.gameMenuKeyHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.closeGameMenu();
        };

        document.addEventListener('pointerdown', this.gameMenuCloseHandler);
        document.addEventListener('keydown', this.gameMenuKeyHandler);
    }

    private removeGameMenuHandlers(): void {
        if (this.gameMenuCloseHandler) {
            document.removeEventListener('pointerdown', this.gameMenuCloseHandler);
            this.gameMenuCloseHandler = null;
        }
        if (this.gameMenuKeyHandler) {
            document.removeEventListener('keydown', this.gameMenuKeyHandler);
            this.gameMenuKeyHandler = null;
        }
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
        const tabs = createElement('div', { className: 'header__tabs' });
        tabs.appendChild(this.renderSheetTabs());
        const presets = this.renderPresetTabs();
        if (presets) {
            tabs.appendChild(presets);
        }
        const filters = this.renderFilters();
        if (filters) {
            tabs.appendChild(filters);
        }
        left.appendChild(tabs);

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
            type: 'button',
            'aria-haspopup': 'listbox',
            'aria-controls': this.gameMenuId,
            'aria-expanded': isGameMenuOpen ? 'true' : 'false',
        });

        const name = createElement('span', {
            className: 'game-switcher__name',
        }, [game?.name || 'Select Game']);

        const arrow = createElement('span', {
            className: 'game-switcher__arrow',
            'aria-hidden': 'true',
        }, ['▼']);

        btn.appendChild(name);
        btn.appendChild(arrow);

        btn.addEventListener('click', () => {
            if (this.state.isGameMenuOpen) {
                this.closeGameMenu();
            } else {
                this.setState({ isGameMenuOpen: true });
            }
        });

        btn.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown' && !this.state.isGameMenuOpen) {
                event.preventDefault();
                this.setState({ isGameMenuOpen: true });
            }
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
            id: this.gameMenuId,
            role: 'listbox',
            'aria-label': 'Game list',
        });

        games.forEach(g => {
            const item = createElement('button', {
                className: `game-switcher__item ${g.id === game?.id ? 'game-switcher__item--active' : ''}`,
                type: 'button',
                role: 'option',
                'aria-selected': g.id === game?.id ? 'true' : 'false',
            }, [g.name]);

            item.addEventListener('click', () => {
                this.closeGameMenu();
                window.location.href = `?game=${g.id}`;
            });

            dropdown.appendChild(item);
        });

        this.attachGameMenuHandlers(dropdown);

        requestAnimationFrame(() => {
            if (!dropdown.isConnected) return;
            const active = dropdown.querySelector<HTMLButtonElement>('[aria-selected="true"]');
            const first = dropdown.querySelector<HTMLButtonElement>('button');
            (active ?? first)?.focus();
        });

        return dropdown;
    }

    private renderSheetTabs(): HTMLElement {
        const { game, currentSheet } = this.props;

        const tabs = createElement('div', {
            className: 'sheet-tabs',
            role: 'group',
            'aria-label': 'Sheets',
        });

        if (!game?.sheets) return tabs;

        game.sheets.forEach(sheet => {
            const tab = createElement('button', {
                className: `sheet-tabs__tab ${sheet.id === currentSheet?.id ? 'sheet-tabs__tab--active' : ''}`,
                type: 'button',
                'aria-pressed': sheet.id === currentSheet?.id ? 'true' : 'false',
            }, [sheet.name]);

            tab.addEventListener('click', () => {
                this.emit({ type: 'SHEET_CHANGE_REQUESTED', sheet });
            });

            tabs.appendChild(tab);
        });

        return tabs;
    }

    private renderPresetTabs(): HTMLElement | null {
        const { presets, activePresetId } = this.props;
        if (!presets) return null;

        const wrapper = createElement('div', {
            className: 'preset-tabs',
        });

        const label = createElement('span', {
            className: 'preset-tabs__label',
        }, ['Presets']);
        wrapper.appendChild(label);

        const list = createElement('div', {
            className: 'preset-tabs__list',
            role: 'group',
            'aria-label': 'Presets',
        });

        const editingPresetId = presets.some((preset) => preset.id === this.state.editingPresetId)
            ? this.state.editingPresetId
            : null;

        presets.forEach((preset) => {
            const isActive = preset.id === activePresetId;
            const item = createElement('div', {
                className: 'preset-tabs__item',
            });

            if (editingPresetId === preset.id) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'preset-tabs__input';
                input.setAttribute('data-preset-id', preset.id);
                input.setAttribute('aria-label', 'Preset name');
                input.value = this.editingPresetDraft ?? preset.name;

                input.addEventListener('input', (event: Event) => {
                    const target = event.target as HTMLInputElement;
                    this.editingPresetDraft = target.value;
                });

                input.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this.commitPresetRename(preset.id);
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        this.cancelPresetRename();
                    }
                });

                input.addEventListener('blur', () => {
                    this.commitPresetRename(preset.id);
                });

                this.schedulePresetInputFocus(preset.id);
                item.appendChild(input);
                list.appendChild(item);
                return;
            }

            const button = createElement('button', {
                className: `sheet-tabs__tab ${isActive ? 'sheet-tabs__tab--active' : ''}`,
                type: 'button',
                'aria-pressed': isActive ? 'true' : 'false',
            }, [preset.name]);

            button.addEventListener('click', () => {
                if (isActive) return;
                this.emit({ type: 'PRESET_SWITCH_REQUESTED', presetId: preset.id });
            });

            button.addEventListener('dblclick', (event: MouseEvent) => {
                event.preventDefault();
                this.startPresetRename(preset);
            });

            const deleteButton = createElement('button', {
                className: 'sheet-tabs__tab preset-tabs__delete',
                type: 'button',
                'aria-label': `Delete preset ${preset.name}`,
            }, ['x']);

            deleteButton.addEventListener('click', (event: MouseEvent) => {
                event.stopPropagation();
                this.emit({ type: 'PRESET_DELETE_REQUESTED', presetId: preset.id });
            });

            item.appendChild(button);
            item.appendChild(deleteButton);
            list.appendChild(item);
        });

        const addButton = createElement('button', {
            className: 'sheet-tabs__tab preset-tabs__add',
            type: 'button',
            'aria-label': 'Create preset',
        }, ['+']);

        addButton.addEventListener('click', () => {
            this.emit({ type: 'PRESET_CREATE_REQUESTED' });
        });

        list.appendChild(addButton);
        wrapper.appendChild(list);

        return wrapper;
    }

    private renderFilters(): HTMLElement | null {
        const filters = this.props.filters ?? [];
        if (filters.length === 0) return null;

        const activeFilters = this.props.activeFilters ?? {};

        const wrapper = createElement('div', {
            className: 'header-filters',
            role: 'group',
            'aria-label': 'Filters',
        });

        filters.forEach((filter) => {
            const activeValues = activeFilters[filter.id] ?? [];
            const group = createElement('div', {
                className: 'header-filters__group',
                role: 'group',
                'aria-label': filter.name,
            });

            const label = createElement('span', {
                className: 'header-filters__label',
            }, [filter.name]);
            group.appendChild(label);

            const list = createElement('div', {
                className: 'header-filters__list',
                role: 'group',
                'aria-label': filter.name,
            });

            const allButton = createElement('button', {
                className: `filter-chip ${activeValues.length === 0 ? 'filter-chip--active' : ''}`,
                type: 'button',
                'aria-pressed': activeValues.length === 0 ? 'true' : 'false',
            }, ['All']);

            allButton.addEventListener('click', () => {
                this.emit({ type: 'FILTER_CHANGED', filterId: filter.id, values: [] });
            });
            list.appendChild(allButton);

            const options = filter.type === 'toggle' && filter.options.length === 0
                ? ['true']
                : filter.options;

            const isSingleSelect = filter.type === 'select' || filter.type === 'toggle';

            options.forEach((option: string) => {
                const value = filter.type === 'toggle' && filter.options.length === 0 ? 'true' : option;
                const optionLabel = filter.type === 'toggle' && filter.options.length === 0 ? 'Yes' : option;
                const labelText = getFilterOptionLabel(filter, optionLabel);
                const isActive = activeValues.includes(value);
                const button = createElement('button', {
                    className: `filter-chip ${isActive ? 'filter-chip--active' : ''}`,
                    type: 'button',
                    'aria-pressed': isActive ? 'true' : 'false',
                }, [labelText]);

                button.addEventListener('click', () => {
                    let nextValues: string[] = [];
                    if (isSingleSelect) {
                        nextValues = isActive ? [] : [value];
                    } else {
                        nextValues = isActive
                            ? activeValues.filter((entry) => entry !== value)
                            : [...activeValues, value];
                    }
                    this.emit({ type: 'FILTER_CHANGED', filterId: filter.id, values: nextValues });
                });

                list.appendChild(button);
            });

            group.appendChild(list);
            wrapper.appendChild(group);
        });

        return wrapper;
    }

    private startPresetRename(preset: TierListPreset): void {
        this.editingPresetDraft = preset.name;
        this.setState({ editingPresetId: preset.id });
        this.schedulePresetInputFocus(preset.id);
    }

    private cancelPresetRename(): void {
        this.editingPresetDraft = null;
        this.setState({ editingPresetId: null });
    }

    private commitPresetRename(presetId: string): void {
        const draft = (this.editingPresetDraft ?? '').trim();
        this.editingPresetDraft = null;
        this.setState({ editingPresetId: null });

        if (!draft) return;

        const preset = this.props.presets?.find((entry) => entry.id === presetId);
        if (!preset || preset.name === draft) return;

        this.emit({ type: 'PRESET_RENAME_REQUESTED', presetId, name: draft });
    }

    private schedulePresetInputFocus(presetId: string): void {
        requestAnimationFrame(() => {
            if (this.state.editingPresetId !== presetId) return;
            const input = this.element.querySelector<HTMLInputElement>(
                `input[data-preset-id="${presetId}"]`
            );
            if (!input) return;
            input.focus();
            input.select();
        });
    }

    private renderRight(): HTMLElement {
        const { canUndo, canRedo, shareCode } = this.props;

        const right = createElement('div', {
            className: 'header__right',
        });

        const status = this.renderStatusMessage();
        if (status) {
            const statusContainer = createElement('div', {
                className: 'header__status',
                role: 'status',
                'aria-live': 'polite',
                'aria-atomic': 'true',
            });
            statusContainer.appendChild(status);
            right.appendChild(statusContainer);
        }

        const actions = createElement('div', {
            className: 'header__actions',
        });

        // Undo button
        const undoBtn = createElement('button', {
            className: `btn btn--ghost ${!canUndo ? 'btn--disabled' : ''}`,
            title: 'Undo (Ctrl+Z)',
            type: 'button',
            'aria-label': 'Undo',
        }, ['↶']);

        undoBtn.addEventListener('click', () => {
            if (canUndo) this.emit({ type: 'UNDO' });
        });
        undoBtn.toggleAttribute('disabled', !canUndo);

        // Redo button
        const redoBtn = createElement('button', {
            className: `btn btn--ghost ${!canRedo ? 'btn--disabled' : ''}`,
            title: 'Redo (Ctrl+Y)',
            type: 'button',
            'aria-label': 'Redo',
        }, ['↷']);

        redoBtn.addEventListener('click', () => {
            if (canRedo) this.emit({ type: 'REDO' });
        });
        redoBtn.toggleAttribute('disabled', !canRedo);

        // Share button
        const shareBtn = createElement('button', {
            className: 'btn btn--primary',
            type: 'button',
            'aria-label': 'Copy share link',
        }, ['Share']);

        shareBtn.addEventListener('click', async () => {
            if (!shareCode) return;
            const url = `${window.location.origin}?s=${shareCode}`;
            const copied = await this.copyToClipboard(url);
            if (copied) {
                this.showToast('Link copied', 'success');
            } else {
                this.showToast('Copy failed', 'error');
            }
        });
        shareBtn.toggleAttribute('disabled', !shareCode);

        actions.appendChild(undoBtn);
        actions.appendChild(redoBtn);
        actions.appendChild(shareBtn);
        right.appendChild(actions);

        return right;
    }
    private renderStatusMessage(): HTMLElement | null {
        const { saveStatus, toastMessage, toastTone } = this.state;
        if (toastMessage) {
            return createElement('div', {
                className: `header-toast header-toast--${toastTone}`,
            }, [toastMessage]);
        }

        if (saveStatus === 'idle') return null;

        let text = '';
        if (saveStatus === 'saving') {
            text = 'Saving...';
        } else if (saveStatus === 'saved') {
            text = 'Saved';
        } else if (saveStatus === 'error') {
            text = 'Save failed';
        }

        return createElement('div', {
            className: `save-status save-status--${saveStatus}`,
        }, [text]);
    }

    protected cleanup(): void {
        if (this.saveStatusTimeoutId !== null) {
            window.clearTimeout(this.saveStatusTimeoutId);
            this.saveStatusTimeoutId = null;
        }
        if (this.toastTimeoutId !== null) {
            window.clearTimeout(this.toastTimeoutId);
            this.toastTimeoutId = null;
        }
        this.removeGameMenuHandlers();
    }
}
