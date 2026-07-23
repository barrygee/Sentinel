import type maplibregl from 'maplibre-gl'

/**
 * Zoom in / out control for the Land map — a stacked "+" / "−" pair styled to
 * match the dark map controls (the SentinelControlBase family is single-button,
 * so this small two-button control implements IControl directly).
 */
export class LandZoomControl implements maplibregl.IControl {
  private _map!: maplibregl.Map
  private _container!: HTMLDivElement

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map
    this._container = document.createElement('div')
    this._container.className = 'maplibregl-ctrl'
    this._container.style.cssText = 'background:#000;border-radius:0;margin-top:4px'

    this._container.appendChild(this._makeButton('+', 'Zoom in', () => this._map.zoomIn()))
    this._container.appendChild(this._makeButton('−', 'Zoom out', () => this._map.zoomOut()))
    return this._container
  }

  onRemove(): void {
    this._container?.parentNode?.removeChild(this._container)
    this._map = undefined!
  }

  private _makeButton(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = glyph
    button.title = title
    button.setAttribute('aria-label', title)
    button.style.cssText =
      'display:block;width:29px;height:29px;border:none;background:#000;color:#fff;cursor:pointer;' +
      'font-size:18px;font-weight:bold;line-height:29px;text-align:center;transition:background 0.2s'
    button.addEventListener('click', onClick)
    button.addEventListener('mouseover', () => {
      button.style.background = '#111'
    })
    button.addEventListener('mouseout', () => {
      button.style.background = '#000'
    })
    return button
  }
}
