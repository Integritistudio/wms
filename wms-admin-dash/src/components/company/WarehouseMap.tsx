import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type WarehouseMapPoint = {
  id: string
  name: string
  code?: string
  latitude: number
  longitude: number
  geoPlaceName?: string
  orderCount: number
  returnCount: number
}

type WarehouseMapProps = {
  points: WarehouseMapPoint[]
  height?: number
}

function FitBounds({ points }: { points: WarehouseMapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 6)
      return
    }
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]))
    map.fitBounds(bounds.pad(0.25))
  }, [map, points])
  return null
}

function markerRadius(orderCount: number, maxOrders: number) {
  if (maxOrders <= 0) return 10
  return 8 + Math.round((orderCount / maxOrders) * 18)
}

/** Palette-driven marker colour — brighter shades on dark tiles. */
function markerColor(orderCount: number, returnCount: number, maxOrders: number, dark: boolean) {
  if (returnCount > 0 && returnCount >= orderCount * 0.2) return dark ? '#f87171' : '#dc2626'
  if (maxOrders > 0 && orderCount >= maxOrders * 0.7) return dark ? '#fbbf24' : '#f59e0b'
  return dark ? '#60a5fa' : '#2563eb'
}

function useIsDark() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export default function WarehouseMap({ points, height = 360 }: WarehouseMapProps) {
  const dark = useIsDark()
  const maxOrders = useMemo(
    () => points.reduce((max, p) => Math.max(max, p.orderCount), 0),
    [points],
  )

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        No warehouse coordinates yet. Add warehouse addresses so they can be geocoded onto the map.
      </div>
    )
  }

  const center: [number, number] = [points[0].latitude, points[0].longitude]

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--line)]" style={{ height }}>
      <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url={`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={markerRadius(p.orderCount, maxOrders)}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: markerColor(p.orderCount, p.returnCount, maxOrders, dark),
              fillOpacity: 0.72,
              opacity: 0.95,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.name}</div>
                {p.code ? <div className="opacity-70">{p.code}</div> : null}
                {p.geoPlaceName ? <div className="mt-1 opacity-70">{p.geoPlaceName}</div> : null}
                <div className="mt-2">Orders: <strong>{p.orderCount}</strong></div>
                <div>Returns: <strong>{p.returnCount}</strong></div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
