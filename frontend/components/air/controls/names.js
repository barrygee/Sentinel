// Names Toggle Control
// Toggles place_* and water_name layers.
// Depends on: map (global alias), _overlayStates, _saveOverlayStates

// Custom control for toggling city names
class NamesToggleControl {
    constructor() {
        this.namesVisible = _overlayStates.names;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.className = 'names-toggle-btn';
        this.button.title = 'Toggle city names';
        this.button.textContent = 'N';
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
        this.button.style.opacity = this.namesVisible ? '1' : '0.3';
        this.button.style.color = this.namesVisible ? '#c8ff00' : '#ffffff';
        this.button.onclick = () => this.toggleNames();
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout = () => this.button.style.backgroundColor = '#000000';

        this.container.appendChild(this.button);

        if (this.map.isStyleLoaded()) {
            this.applyNamesVisibility();
        } else {
            this.map.once('style.load', () => this.applyNamesVisibility());
        }

        return this.container;
    }

    onRemove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map = undefined;
    }

    applyNamesVisibility() {
        const visibility = this.namesVisible ? 'visible' : 'none';
        const nameLayerIds = [
            'place_suburb', 'place_village', 'place_town',
            'place_city', 'place_state', 'place_country',
            'place_country_other', 'water_name'
        ];
        nameLayerIds.forEach(layerId => {
            try { this.map.setLayoutProperty(layerId, 'visibility', visibility); } catch (e) {}
        });
        this.button.style.opacity = this.namesVisible ? '1' : '0.3';
        this.button.style.color = this.namesVisible ? '#c8ff00' : '#ffffff';
    }

    toggleNames() {
        this.namesVisible = !this.namesVisible;
        this.applyNamesVisibility();
        _saveOverlayStates();
    }
}

namesControl = new NamesToggleControl();
map.addControl(namesControl, 'top-right');
