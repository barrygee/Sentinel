// Roads Toggle Control
// Toggles 15 road layer IDs via map.setLayoutProperty.
// Depends on: map (global alias), _overlayStates, _saveOverlayStates

// ---- RoadsToggleControl ----
// Inputs:  none (reads _overlayStates.roads from constructor)
// Outputs: toggles visibility on 15 road layer IDs via map.setLayoutProperty
// Button:  'R' — lime when roads visible, white+dim when hidden
class RoadsToggleControl {
    constructor() {
        this.roadsVisible = _overlayStates.roads;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        this.container.style.backgroundColor = '#000000';
        this.container.style.borderRadius = '0';
        this.container.style.marginTop = '4px';

        this.button = document.createElement('button');
        this.button.className = 'roads-toggle-btn';
        this.button.title = 'Toggle road lines and names';
        this.button.textContent = 'R';
        this.button.style.width = '29px';
        this.button.style.height = '29px';
        this.button.style.border = 'none';
        this.button.style.backgroundColor = '#000000';
        this.button.style.cursor = 'pointer';
        this.button.style.fontSize = '16px';
        this.button.style.color = '#ffffff';
        this.button.style.fontWeight = 'bold';
        this.button.style.display = 'flex';
        this.button.style.alignItems = 'center';
        this.button.style.justifyContent = 'center';
        this.button.style.transition = 'opacity 0.2s';
        this.button.style.opacity = '0.3';
        this.button.onclick = () => this.toggleRoads();
        this.button.onmouseover = () => this.button.style.backgroundColor = '#111111';
        this.button.onmouseout = () => this.button.style.backgroundColor = '#000000';

        this.container.appendChild(this.button);

        // Listen to zoom changes to update button state
        this.map.on('zoom', () => this.updateButtonState());

        // Set initial visibility based on zoom and toggle state
        this.updateRoadsVisibility();

        // Re-apply visibility after style loads (initial call may fail if style not loaded)
        this.map.once('style.load', () => this.updateRoadsVisibility());

        return this.container;
    }

    onRemove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map = undefined;
    }

    updateButtonState() {
        const zoomAllowsRoads = true;
        const shouldBeVisible = this.roadsVisible && zoomAllowsRoads;
        this.button.style.opacity = shouldBeVisible ? '1' : '0.3';
        this.button.style.color = shouldBeVisible ? '#c8ff00' : '#ffffff';
    }

    updateRoadsVisibility() {
        const zoomAllowsRoads = true;
        const visibility = (this.roadsVisible && zoomAllowsRoads) ? 'visible' : 'none';

        const roadLayerIds = [
            'highway_path', 'highway_minor', 'highway_major_casing',
            'highway_major_inner', 'highway_major_subtle',
            'highway_motorway_casing', 'highway_motorway_inner',
            'highway_motorway_subtle', 'highway_name_motorway',
            'highway_name_other', 'highway_ref', 'tunnel_motorway_casing',
            'tunnel_motorway_inner', 'road_area_pier', 'road_pier'
        ];

        roadLayerIds.forEach(layerId => {
            try {
                this.map.setLayoutProperty(layerId, 'visibility', visibility);
            } catch (e) {
                // Layer might not exist, skip it
            }
        });

        this.updateButtonState();
    }

    toggleRoads() {
        this.roadsVisible = !this.roadsVisible;
        this.updateRoadsVisibility();
        _saveOverlayStates();
    }
}

roadsControl = new RoadsToggleControl();
map.addControl(roadsControl, 'top-right');
