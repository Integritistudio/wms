import { Link } from '@tanstack/react-router'
import { MermaidDiagram, PageHeader, PageSection } from '../ui'
import { PROCESS_TOPICS, kindLabel, type ProcessDiagram } from './processDiagrams/catalog'

export default function ProcessDiagramsPanel() {
  const total = PROCESS_TOPICS.reduce((n, t) => n + t.diagrams.length, 0)

  return (
    <div className="process-diagrams">
      <PageHeader
        title="Process diagrams"
        description={`All ${total} flow, sequence, state, and use-case diagrams on one page — including edge cases like split orders.`}
        actions={
          <Link to="/account/guide" className="demo-btn demo-btn-sm demo-button-secondary">
            User Guide
          </Link>
        }
      />

      <p className="process-diagrams-lede demo-muted">
        Not in the sidebar — open via{' '}
        <code className="process-diagrams-path">/account/diagrams</code> or the User Guide link. Use the
        table of contents to jump; scroll to see every diagram.
      </p>

      <PageSection title="Jump to a topic" description="All topics and diagrams are listed below on this page.">
        <nav className="process-diagrams-toc" aria-label="Diagram topics">
          {PROCESS_TOPICS.map((topic) => (
            <a key={topic.id} className="process-diagrams-toc-link" href={`#diagram-topic-${topic.id}`}>
              {topic.title}
              <span className="process-diagrams-toc-count">{topic.diagrams.length}</span>
            </a>
          ))}
        </nav>
      </PageSection>

      <div className="process-diagrams-stack">
        {PROCESS_TOPICS.map((topic) => {
          const main = topic.diagrams.filter((d) => !d.edgeCase)
          const edges = topic.diagrams.filter((d) => d.edgeCase)
          return (
            <section
              key={topic.id}
              id={`diagram-topic-${topic.id}`}
              className="process-diagrams-topic-block"
            >
              <PageSection title={topic.title} description={topic.summary}>
                <DiagramGroup heading="Main diagrams" diagrams={main} topicId={topic.id} />
                {edges.length ? (
                  <DiagramGroup heading="Edge cases" diagrams={edges} topicId={topic.id} />
                ) : null}
              </PageSection>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function DiagramGroup({
  heading,
  diagrams,
  topicId,
}: {
  heading: string
  diagrams: ProcessDiagram[]
  topicId: string
}) {
  if (!diagrams.length) return null
  return (
    <div className="process-diagrams-group">
      <h3 className="process-diagrams-group-heading">{heading}</h3>
      <div className="process-diagrams-cards">
        {diagrams.map((d) => (
          <article
            key={d.id}
            id={`diagram-${topicId}-${d.id}`}
            className="process-diagrams-canvas"
          >
            <div className="process-diagrams-canvas-head">
              <div>
                <h4 className="process-diagrams-canvas-title">{d.title}</h4>
                <p className="demo-muted process-diagrams-canvas-desc">{d.description}</p>
              </div>
              <span className="process-diagrams-badge">
                {d.edgeCase ? 'Edge case · ' : ''}
                {kindLabel(d.kind)}
              </span>
            </div>
            <MermaidDiagram chart={d.mermaid} />
          </article>
        ))}
      </div>
    </div>
  )
}
