import{t as e}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__maplibre_mf_2_gl__loadShare__.js-Bb-fCmPf.js";var t=`var(--map-location-dot)`;function n(e=t){return`
        <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" overflow="visible">
            <circle cx="30" cy="30" r="13.1"
                fill="none" stroke-width="2.2"
                stroke-dasharray="82.31" stroke-dashoffset="82.31"
                style="stroke: var(--map-overlay-ink); animation: marker-circle-draw 0.6s ease forwards" />
            <circle cx="30" cy="30" r="5.2" style="fill: ${e}" />
        </svg>`}function r(e){let t=document.createElement(`div`);return t.className=e,t.innerHTML=n(),t}var i=class{_marker=null;_map=null;_cssClass;constructor(e=`user-location-marker`){this._cssClass=e}addTo(e){this._map=e}update(t,n){if(this._map)if(this._marker)this._marker.setLngLat([t,n]);else{let i=r(this._cssClass);this._marker=new e({element:i,anchor:`center`}).setLngLat([t,n]).addTo(this._map)}}setHidden(e){let t=this._marker?.getElement();t&&(t.style.display=e?`none`:``)}remove(){this._marker?.remove(),this._marker=null}destroy(){this.remove(),this._map=null}};export{t as LOCATION_MARKER_DOT_COLOR,i as UserLocationMarker,n as buildLocationMarkerSvg};