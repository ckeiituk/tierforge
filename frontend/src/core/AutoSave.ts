import { stateManager } from './StateManager';
import * as api from '@/api/client';
import { eventBus } from './EventBus';

const AUTOSAVE_DELAY_MS = 2000;

/**
 * AutoSave module - debounced persistence of tier list changes
 */
class AutoSave {
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private isSaving = false;
    private pendingSave = false;
    private lastSavedSnapshot: { id: string; tiersJson: string } | null = null;
    private unsubscribe: (() => void) | null = null;

    start(): void {
        // Subscribe to tier list changes
        this.unsubscribe = stateManager.subscribe(
            (state) => state.tierList?.tiers,
            (tiers, _prev) => {
                if (tiers) {
                    this.scheduleSave();
                }
            },
            { immediate: false }
        );

        console.log('[AutoSave] Started');
    }

    stop(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        console.log('[AutoSave] Stopped');
    }

    private scheduleSave(): void {
        // Debounce - reset timer on each change
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.save();
        }, AUTOSAVE_DELAY_MS);
    }

    private async save(): Promise<void> {
        const state = stateManager.getState();
        const tierList = state.tierList;

        if (!tierList || !tierList.id) {
            return;
        }

        // Check if tiers actually changed
        const tiersJson = JSON.stringify(tierList.tiers);
        if (this.lastSavedSnapshot
            && this.lastSavedSnapshot.id === tierList.id
            && this.lastSavedSnapshot.tiersJson === tiersJson
        ) {
            return;
        }

        // Prevent concurrent saves
        if (this.isSaving) {
            this.pendingSave = true;
            return;
        }

        this.isSaving = true;
        eventBus.emit({ type: 'autosave:start' });

        try {
            await api.updateTierList(tierList.id, {
                tiers: tierList.tiers,
            });

            this.lastSavedSnapshot = { id: tierList.id, tiersJson };
            eventBus.emit({ type: 'autosave:success' });
            console.log('[AutoSave] Saved successfully');
        } catch (error) {
            console.error('[AutoSave] Failed:', error);
            eventBus.emit({ type: 'autosave:error', error });
        } finally {
            this.isSaving = false;

            // If there was a pending save request, do it now
            if (this.pendingSave) {
                this.pendingSave = false;
                this.scheduleSave();
            }
        }
    }

    // Force immediate save (e.g., on page unload)
    async saveNow(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        await this.save();
    }
}

export const autoSave = new AutoSave();
