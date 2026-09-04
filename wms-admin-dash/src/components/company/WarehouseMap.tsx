import { useEffect, useMemo } from 'react'
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

function markerColor(orderCount: number, returnCount: number, maxOrders: number) {
  if (returnCount > 0 && returnCount >= orderCount * 0.2) return '#b45309'
  if (maxOrders > 0 && orderCount >= maxOrders * 0.7) return '#ea580c'
  return '#0f766e'
}

export default function WarehouseMap({ points, height = 360 }: WarehouseMapProps) {
  const maxOrders = useMemo(
    () => points.reduce((max, p) => Math.max(max, p.orderCount), 0),
    [points],
  )

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-[var(--border,#e5e7eb)] bg-[var(--card-subtle,#f9fafb)] text-sm text-[var(--muted,#6b7280)]"
        style={{ height }}
      >
        No warehouse coordinates yet. Add warehouse addresses so they can be geocoded onto the map.
      </div>
    )
  }

  const center: [number, number] = [points[0].latitude, points[0].longitude]

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border,#e5e7eb)]" style={{ height }}>
      <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
              fillColor: markerColor(p.orderCount, p.returnCount, maxOrders),
              fillOpacity: 0.85,
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
