"use strict";
/* ============================================================
   DOCS PAGE — sidebar active-state via scroll position
   ============================================================ */
(function () {
    var _navItems = [];
    var _sections = [];

    function _init() {
        _navItems = Array.from(document.querySelectorAll('.docs-nav-item[href^="#"]'));
        _sections = _navItems.map(function (a) {
            return document.getElementById(a.getAttribute('href').slice(1));
        }).filter(Boolean);

        if (_sections.length === 0) return;

        var docsBody = document.getElementById('docs-body');
        if (!docsBody) return;

        docsBody.addEventListener('scroll', _updateActive, { passive: true });
        _updateActive();

        // Smooth scroll on nav click
        _navItems.forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var target = document.getElementById(a.getAttribute('href').slice(1));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function _updateActive() {
        var docsBody = document.getElementById('docs-body');
        if (!docsBody) return;

        var scrollTop = docsBody.scrollTop;
        var offset = 32; // px below the top to trigger the next section

        // Find the last section whose top is at or above (scrollTop + offset)
        var active = _sections[0];
        _sections.forEach(function (section) {
            if (section.offsetTop - docsBody.offsetTop <= scrollTop + offset) {
                active = section;
            }
        });

        _navItems.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + active.id);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }
})();
