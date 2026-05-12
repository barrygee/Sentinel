import type { Map as MapLibreGlMap, MapMouseEvent } from 'maplibre-gl'

export function useMapContextMenu() {
  let _ctxMenu: HTMLElement | null = null

  function remove(): void {
    if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null }
  }

  function _onDocKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') remove()
  }

  function show(e: MapMouseEvent): void {
    remove()
    const { lng, lat } = e.lngLat
    const latStr = lat.toFixed(5)
    const lonStr = lng.toFixed(5)
    const cx = e.originalEvent.clientX
    const cy = e.originalEvent.clientY

    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;background:#000000;border:1px solid rgba(255,255,255,0.08);font-family:\'Barlow Condensed\',\'Barlow\',sans-serif;font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,0.4);z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.95);min-width:200px;user-select:none'
    el.style.left = cx + 'px'
    el.style.top  = cy + 'px'

    const coordRow = document.createElement('div')
    coordRow.style.cssText = 'padding:8px 12px 6px;color:rgba(255,255,255,0.25);font-size:9px;letter-spacing:.14em;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06)'
    coordRow.textContent = `${latStr}° N  ${lonStr}° E`
    el.appendChild(coordRow)

    const setLocBtn = document.createElement('div')
    setLocBtn.style.cssText = 'padding:10px 12px;cursor:pointer;white-space:nowrap;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:8px'
    setLocBtn.innerHTML =
      `<svg width="11" height="11" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">` +
      `<circle cx="7" cy="7" r="5.5" stroke="#c8ff00" stroke-width="1.5"/>` +
      `<circle cx="7" cy="7" r="2" fill="#c8ff00"/>` +
      `<line x1="7" y1="1" x2="7" y2="3" stroke="#c8ff00" stroke-width="1.5" stroke-linecap="square"/>` +
      `<line x1="7" y1="11" x2="7" y2="13" stroke="#c8ff00" stroke-width="1.5" stroke-linecap="square"/>` +
      `<line x1="1" y1="7" x2="3" y2="7" stroke="#c8ff00" stroke-width="1.5" stroke-linecap="square"/>` +
      `<line x1="11" y1="7" x2="13" y2="7" stroke="#c8ff00" stroke-width="1.5" stroke-linecap="square"/>` +
      `</svg>SET MY LOCATION`
    setLocBtn.addEventListener('mouseenter', () => { setLocBtn.style.background = 'rgba(255,255,255,0.06)' })
    setLocBtn.addEventListener('mouseleave', () => { setLocBtn.style.background = '' })
    setLocBtn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      window.dispatchEvent(new CustomEvent('sentinel:setUserLocation', { detail: { longitude: lng, latitude: lat } }))
      remove()
    })
    el.appendChild(setLocBtn)

    document.body.appendChild(el)
    _ctxMenu = el

    requestAnimationFrame(() => {
      if (!_ctxMenu) return
      const rect = _ctxMenu.getBoundingClientRect()
      if (rect.right  > window.innerWidth)  _ctxMenu.style.left = (cx - rect.width)  + 'px'
      if (rect.bottom > window.innerHeight) _ctxMenu.style.top  = (cy - rect.height) + 'px'
    })
  }

  function attach(m: MapLibreGlMap): void {
    m.on('contextmenu', show)
    m.on('click', remove)
    document.addEventListener('keydown', _onDocKeydown, { capture: true })
  }

  function detach(m: MapLibreGlMap | null): void {
    remove()
    document.removeEventListener('keydown', _onDocKeydown, { capture: true })
    if (m) {
      m.off('contextmenu', show)
      m.off('click', remove)
    }
  }

  return { attach, detach, remove, show }
}
