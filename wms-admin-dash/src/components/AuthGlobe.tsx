import createGlobe from 'cobe'
import { useEffect, useRef, useState } from 'react'

const MARKERS = [
  { location: [34.05, -118.24] as [number, number], size: 0.06 },
  { location: [40.71, -74.0] as [number, number], size: 0.055 },
  { location: [51.92, 4.48] as [number, number], size: 0.05 },
  { location: [25.2, 55.27] as [number, number], size: 0.05 },
  { location: [1.35, 103.82] as [number, number], size: 0.055 },
  { location: [31.23, 121.47] as [number, number], size: 0.06 },
  { location: [35.68, 139.65] as [number, number], size: 0.045 },
  { location: [-33.87, 151.21] as [number, number], size: 0.045 },
]

const ARCS = [
  { from: [34.05, -118.24] as [number, number], to: [31.23, 121.47] as [number, number] },
  { from: [40.71, -74.0] as [number, number], to: [51.92, 4.48] as [number, number] },
  { from: [51.92, 4.48] as [number, number], to: [25.2, 55.27] as [number, number] },
  { from: [25.2, 55.27] as [number, number], to: [1.35, 103.82] as [number, number] },
  { from: [1.35, 103.82] as [number, number], to: [-33.87, 151.21] as [number, number] },
  { from: [31.23, 121.47] as [number, number], to: [35.68, 139.65] as [number, number] },
]

export default function AuthGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phi = useRef(0.4)
  const drag = useRef(0)
  const origin = useRef<number | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let alive = true
    let shown = false
    let globe: ReturnType<typeof createGlobe> | null = null

    const bufferSize = () => {
      const size = Math.max(canvas.offsetWidth, 2)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      return Math.round(size * dpr)
    }

    try {
      const buffer = bufferSize()
      globe = createGlobe(canvas, {
        devicePixelRatio: 1,
        width: buffer,
        height: buffer,
        phi: phi.current,
        theta: 0.22,
        dark: 0,
        diffuse: 1.2,
        mapSamples: 14000,
        mapBrightness: 3.8,
        baseColor: [0.82, 0.88, 0.96],
        markerColor: [0.961, 0.62, 0.043],
        glowColor: [0.93, 0.96, 0.99],
        markerElevation: 0.01,
        arcColor: [0.22, 0.45, 0.9],
        arcWidth: 0.55,
        arcHeight: 0.28,
        markers: MARKERS,
        arcs: ARCS,
      })
    } catch {
      return
    }

    const tick = () => {
      if (!alive || !globe) return
      if (origin.current === null && !reduce) phi.current += 0.0035
      const buffer = bufferSize()
      globe.update({
        phi: phi.current + drag.current,
        width: buffer,
        height: buffer,
      })
      if (!shown) {
        shown = true
        setReady(true)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()

    const observer = new ResizeObserver(() => {
      const buffer = bufferSize()
      globe?.update({ width: buffer, height: buffer })
    })
    observer.observe(canvas)

    return () => {
      alive = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      globe?.destroy()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={ready ? 'login-globe is-ready' : 'login-globe'}
      aria-label="Drag to rotate shipping routes"
      onPointerDown={(event) => {
        origin.current = event.clientX
        drag.current = 0
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.style.cursor = 'grabbing'
      }}
      onPointerMove={(event) => {
        if (origin.current === null) return
        drag.current = (event.clientX - origin.current) / 260
      }}
      onPointerUp={(event) => {
        phi.current += drag.current
        drag.current = 0
        origin.current = null
        event.currentTarget.style.cursor = 'grab'
      }}
      onPointerCancel={() => {
        phi.current += drag.current
        drag.current = 0
        origin.current = null
      }}
    />
  )
}
