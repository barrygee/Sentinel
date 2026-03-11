// Range Rings Control
// Adds geodesic ring GeoJSON source/layers, updates center on selection.
// Depends on: map (global alias), buildRingsGeoJSON (from MapComponent), rangeRingCenter, _overlayStates, _saveOverlayStates

// Custom control for toggling range rings
class RangeRingsControl {
    constructor() {
        this.ringsVisible = _overlayStates.rings;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.title = 'Toggle range rings';
        this.button.textContent = '◎';
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.fontSize = '16px';
        this.button.style.fontWeight = 'bold';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s, color 0.2s';
        this.button.style.opacity = this.ringsVisible ? '1' : '0.3';
        this.button.style.color = this.ringsVisible ? '#c8ff00' : '#ffffff';
        this.button.onclick = () => this.toggleRings();
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout = () => this.button.style.backgroundColor = '#000000';

        this.container.appendChild(this.button);

        if (this.map.isStyleLoaded()) {
            this.initRings();
        } else {
            this.map.once('style.load', () => this.initRings());
        }

        return this.container;
    }

    onRemove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map = undefined;
    }

    initRings() {
        const center = rangeRingCenter || [this.map.getCenter().lng, this.map.getCenter().lat];
        const { lines } = window.MapComponent.buildRingsGeoJSON(center[0], center[1]);

        this.map.addSource('range-rings-lines', { type: 'geojson', data: lines });

        this.map.addLayer({
            id: 'range-rings-lines',
            type: 'line',
            source: 'range-rings-lines',
            layout: { visibility: this.ringsVisible ? 'visible' : 'none' },
            paint: {
                'line-color': 'rgba(255, 255, 255, 0.40)',
                'line-width': 1,
                'line-dasharray': [4, 4]
            }
        });
    }

    updateCenter(lng, lat) {
        if (!this.map || !this.map.getSource('range-rings-lines')) return;
        const { lines } = window.MapComponent.buildRingsGeoJSON(lng, lat);
        this.map.getSource('range-rings-lines').setData(lines);
    }

    toggleRings() {
        this.ringsVisible = !this.ringsVisible;
        const v = this.ringsVisible ? 'visible' : 'none';
        try {
            this.map.setLayoutProperty('range-rings-lines', 'visibility', v);
        } catch (e) {}
        this.button.style.opacity = this.ringsVisible ? '1' : '0.3';
        this.button.style.color = this.ringsVisible ? '#c8ff00' : '#ffffff';
        _saveOverlayStates();
    }
}

rangeRingsControl = new RangeRingsControl();
map.addControl(rangeRingsControl, 'top-right');
