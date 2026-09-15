import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MermaidDiagram, PageHeader, PageSection } from '../ui'
import {
  PROCESS_TOPICS,
  kindLabel,
  type ProcessDiagram,
  type ProcessTopic,
} from './processDiagrams/catalog'

function diagramsForTopic(topic: ProcessTopic) {
  const main = topic.diagrams.filter((d) => !d.edgeCase)
  const edges = topic.diagrams.filter((d) => d.edgeCase)
  return { main, edges }
}

export default function ProcessDiagramsPanel() {
  const [topicId, setTopicId] = useState(PROCESS_TOPICS[0]?.id || '')
  const [diagramId, setDiagramId] = useState('')

  const topic = useMemo(
    () => PROCESS_TOPICS.find((t) => t.id === topicId) || PROCESS_TOPICS[0],
    [topicId],
  )

  const { main, edges } = useMemo(() => diagramsForTopic(topic), [topic])

  const active: ProcessDiagram | undefined = useMemo(() => {
    const all = topic.diagrams
    return all.find((d) => d.id === diagramId) || main[0] || all[0]
  }, [topic, diagramId, main])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const [tId, dId] = hash.split('/')
    if (tId && PROCESS_TOPICS.some((t) => t.id === tId)) {
      setTopicId(tId)
      if (dId) setDiagramId(dId)
    }
  }, [])

  useEffect(() => {
    if (topic.diagrams.some((d) => d.id === diagramId)) return
    const { main: nextMain } = diagramsForTopic(topic)
    setDiagramId(nextMain[0]?.id || topic.diagrams[0]?.id || '')
  }, [topic, diagramId])

  useEffect(() => {
    if (!topic || !active) return
    const next = `#${topic.id}/${active.id}`
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', `${window.location.pathname}${next}`)
    }
  }, [topic, active])

  return (
    <div className="process-diagrams">
      <PageHeader
        title="Process diagrams"
        description="Flow, sequence, state, and use-case views — including edge cases like split orders."
        actions={
          <Link to="/account/guide" className="demo-btn demo-btn-sm demo-button-secondary">
            User Guide
          </Link>
        }
      />

      <p className="process-diagrams-lede demo-muted">
        This page is not in the sidebar. Bookmark{' '}
        <code className="process-diagrams-path">/account/diagrams</code> or share a deep link with the
        hash (topic + diagram).
      </p>

      <div className="process-diagrams-layout">
        <nav className="process-diagrams-nav" aria-label="Process topics">
          <p className="process-diagrams-nav-label">Topics</p>
          <ul className="process-diagrams-topic-list">
            {PROCESS_TOPICS.map((t) => {
              const edgeCount = t.diagrams.filter((d) => d.edgeCase).length
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`process-diagrams-topic ${t.id === topic.id ? 'is-active' : ''}`}
                    onClick={() => setTopicId(t.id)}
                  >
                    <span className="process-diagrams-topic-title">{t.title}</span>
                    <span className="process-diagrams-topic-meta">
                      {t.diagrams.length} diagram{t.diagrams.length === 1 ? '' : 's'}
                      {edgeCount ? ` · ${edgeCount} edge` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="process-diagrams-main">
          <PageSection title={topic.title} description={topic.summary}>
            <div className="process-diagrams-tabs" role="tablist" aria-label="Diagrams in this topic">
              <div className="process-diagrams-tab-group">
                <span className="process-diagrams-tab-heading">Main</span>
                {main.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="tab"
                    aria-selected={active?.id === d.id}
                    className={`process-diagrams-tab ${active?.id === d.id ? 'is-active' : ''}`}
                    onClick={() => setDiagramId(d.id)}
                  >
                    <span>{d.title}</span>
                    <span className="process-diagrams-kind">{kindLabel(d.kind)}</span>
                  </button>
                ))}
              </div>
              {edges.length ? (
                <div className="process-diagrams-tab-group">
                  <span className="process-diagrams-tab-heading">Edge cases</span>
                  {edges.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="tab"
                      aria-selected={active?.id === d.id}
                      className={`process-diagrams-tab ${active?.id === d.id ? 'is-active' : ''}`}
                      onClick={() => setDiagramId(d.id)}
                    >
                      <span>{d.title}</span>
                      <span className="process-diagrams-kind">{kindLabel(d.kind)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {active ? (
              <div className="process-diagrams-canvas">
                <div className="process-diagrams-canvas-head">
                  <div>
                    <h3 className="process-diagrams-canvas-title">{active.title}</h3>
                    <p className="demo-muted process-diagrams-canvas-desc">{active.description}</p>
                  </div>
                  <span className="process-diagrams-badge">
                    {active.edgeCase ? 'Edge case · ' : ''}
                    {kindLabel(active.kind)}
                  </span>
                </div>
                <MermaidDiagram chart={active.mermaid} />
              </div>
            ) : null}
          </PageSection>
        </div>
      </div>
    </div>
  )
}
