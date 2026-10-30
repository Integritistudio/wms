import { useEffect, useId, useRef, useState } from 'react'

type MermaidDiagramProps = {
  chart: string
  className?: string
}

export default function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, '')
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
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
          theme: 'neutral',
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
  }, [chart, reactId])

  return (
    <div className={`diagram-mermaid ${className}`.trim()}>
      {error ? <p className="diagram-mermaid-error">{error}</p> : null}
      <div ref={hostRef} className="diagram-mermaid-svg" />
    </div>
  )
}
