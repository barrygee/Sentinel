// Reset View Control
// Fly-to home button: center [-4.4815, 54.1453] zoom 6.
// Depends on: map (global alias)

// ---- ResetViewControl ----
// On click: map.flyTo({ center: [-4.4815, 54.1453], zoom: 6 }) (Irish Sea / central UK home)
// Button: SVG lime corner-bracket icon
class ResetViewControl {
    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.title = 'Reset view to home';
        this.button.innerHTML = `<svg viewBox="14 15 32 30" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
            <polyline points="21,17 16,17 16,22" fill="none" stroke="#c8ff00" stroke-width="2" stroke-linecap="square"/>
            <polyline points="39,17 44,17 44,22" fill="none" stroke="#c8ff00" stroke-width="2" stroke-linecap="square"/>
            <polyline points="21,43 16,43 16,38" fill="none" stroke="#c8ff00" stroke-width="2" stroke-linecap="square"/>
            <polyline points="39,43 44,43 44,38" fill="none" stroke="#c8ff00" stroke-width="2" stroke-linecap="square"/>
            <rect x="28" y="28" width="4" height="4" fill="white"/>
        </svg>`;
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s';
        this.button.onclick = () => {
            this.map.flyTo({ center: [-4.4815, 54.1453], zoom: 6, pitch: 0, bearing: 0 });
        };
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout = () => this.button.style.backgroundColor = '#000000';

        this.container.appendChild(this.button);
        return this.container;
    }

    onRemove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map = undefined;
    }
}

map.addControl(new ResetViewControl(), 'top-right');
