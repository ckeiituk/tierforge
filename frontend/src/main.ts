import '@/themes/base.css';
import '@/themes/dos2.css';
import '@/themes/bg3.css';

import { TierEngine } from '@/core/TierEngine';


// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app');

    if (!container) {
        console.error('App container not found');
        return;
    }

    // Check for share code in URL
    const params = new URLSearchParams(window.location.search);
    const shareCode = params.get('s');
    const gameId = params.get('game');

    // Create tier engine
    new TierEngine({
        container,
        shareCode: shareCode || undefined,
        gameId: gameId || undefined,
    });
});
