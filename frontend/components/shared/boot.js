"use strict";
// ============================================================
// SHARED BOOT — non-air domain pages (SEA / LAND / SPACE)
//
// Responsibilities:
//   1. Initialise notifications and tracking panels
//   2. Play the SENTINEL logo animation
//
// Dependencies: window._Notifications, window._Tracking
// ============================================================

// ---- 1. Panel initialisation ----
window._Notifications.init();
window._Tracking.init();

// ---- 2. Logo animation ----
(function () {
    const logoSvg = document.getElementById('logo-img');
    const logoTextEl = document.getElementById('logo-text-el');
    if (!logoSvg || !logoTextEl) return;

    let typeTimer = null;
    let blinkTimer = null;

    function playLogoAnimation() {
        if (typeTimer) clearTimeout(typeTimer);
        if (blinkTimer) clearInterval(blinkTimer);
        logoTextEl.textContent = '';

        const corners = logoSvg.querySelectorAll('.logo-corner');
        const bg = logoSvg.querySelector('.logo-bg');
        const dot = logoSvg.querySelector('.logo-dot');
        [...Array.from(corners), bg, dot].forEach(el => {
            if (!el) return;
            el.style.animation = 'none';
            el.getBoundingClientRect();
            el.style.animation = '';
        });

        const WORD = 'SENTINEL';
        let i = 0;

        function typeNextChar() {
            if (i < WORD.length) {
                logoTextEl.textContent = WORD.slice(0, ++i) + '|';
                typeTimer = setTimeout(typeNextChar, 75);
            } else {
                let blinks = 0;
                blinkTimer = setInterval(() => {
                    blinks++;
                    logoTextEl.textContent = WORD + (blinks % 2 === 0 ? '|' : ' ');
                    if (blinks >= 6) {
                        clearInterval(blinkTimer);
                        logoTextEl.textContent = WORD;
                    }
                }, 300);
            }
        }

        typeTimer = setTimeout(typeNextChar, 1250);
    }

    playLogoAnimation();
    logoSvg.style.cursor = 'pointer';
    logoSvg.addEventListener('click', playLogoAnimation);
})();
