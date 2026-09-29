import { useEffect, useId, useRef, useState } from 'react'

type MermaidDiagramProps = {
  chart: string
  className?: string
}

function isDarkMode() {
  const root = document.documentElement
  if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark') return true
  if (root.classList.contains('light') || root.getAttribute('data-theme') === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, '')
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const sync = () => setDark(isDarkMode())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    setError('')
    host.innerHTML = '<p class="diagram-mermaid-loading">Rendering diagram…</p>'

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'neutral',
          flowchart: { htmlLabels: true, curve: 'basis' },
          sequence: { mirrorActors: false },
        })
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await mermaid.render(id, chart.trim())
        if (cancelled || !hostRef.current) return
        hostRef.current.innerHTML = svg
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unable to render diagram')
        if (hostRef.current) hostRef.current.innerHTML = ''
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, dark, reactId])

  return (
    <div className={`diagram-mermaid ${className}`.trim()}>
      {error ? <p className="diagram-mermaid-error">{error}</p> : null}
      <div ref={hostRef} className="diagram-mermaid-svg" />
    </div>
  )
}
