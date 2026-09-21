import type { CSSProperties } from 'react'

function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`oj-skel-bone ${className}`.trim()} style={style} aria-hidden />
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined oj-skel-icon ${className}`.trim()} aria-hidden>
      {name}
    </span>
  )
}

function MetaCard({ icon, label }: { icon: string; label: string }) {
  return (
    <article className="oj-skel-meta">
      <div className="oj-skel-meta-icon">
        <Icon name={icon} />
      </div>
      <div className="oj-skel-meta-body">
        <span className="oj-skel-meta-label">{label}</span>
        <Bone className="oj-skel-bone--lg" style={{ width: '72%' }} />
        <Bone className="oj-skel-bone--sm" style={{ width: '48%' }} />
      </div>
    </article>
  )
}

function JourneyStep({ icon, active }: { icon: string; active?: boolean }) {
  return (
    <div className={`oj-skel-step${active ? ' is-active' : ''}`}>
      <div className="oj-skel-step-node">
        <Icon name={icon} />
      </div>
      <Bone className="oj-skel-bone--sm" style={{ width: '3.5rem' }} />
    </div>
  )
}

export default function OrderDetailSkeleton() {
  return (
    <div className="order-detail order-journey oj-skel" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading order…</span>

      <section className="oj-skel-hero">
        <div className="oj-skel-hero-main">
          <div className="oj-skel-crumb">
            <Icon name="arrow_back" className="oj-skel-icon--sm" />
            <Bone style={{ width: '5.5rem' }} />
            <span className="oj-skel-slash">/</span>
            <Bone style={{ width: '3.25rem' }} />
          </div>
          <div className="oj-skel-title-row">
            <Bone className="oj-skel-bone--title" style={{ width: '9rem' }} />
            <span className="oj-skel-badge">
              <Icon name="replay" className="oj-skel-icon--xs" />
              <Bone style={{ width: '3.5rem', height: '0.55rem' }} />
            </span>
          </div>
          <Bone className="oj-skel-bone--sm" style={{ width: '16rem', maxWidth: '90%' }} />
        </div>
        <div className="oj-skel-hero-aside">
          <div className="oj-skel-hero-actions">
            <span className="oj-skel-chip">
              <Icon name="bolt" className="oj-skel-icon--xs" />
              <Bone style={{ width: '3.25rem', height: '0.5rem' }} />
            </span>
            <span className="oj-skel-chip">
              <Icon name="sync" className="oj-skel-icon--xs oj-skel-spin" />
              <Bone style={{ width: '4.5rem', height: '0.5rem' }} />
            </span>
            <span className="oj-skel-chip oj-skel-chip--solid">
              <Icon name="refresh" className="oj-skel-icon--xs" />
              <Bone style={{ width: '3rem', height: '0.5rem', opacity: 0.35 }} />
            </span>
          </div>
        </div>
      </section>

      <section className="oj-skel-metas">
        <MetaCard icon="calendar_today" label="Created" />
        <MetaCard icon="description" label="940 file" />
        <MetaCard icon="local_shipping" label="Tracking" />
        <MetaCard icon="storefront" label="Shopify sync" />
      </section>

      <nav className="oj-skel-tabs" aria-hidden>
        {['Overview', 'Fulfillment', 'Activity', 'Returns'].map((tab, i) => (
          <span key={tab} className={`oj-skel-tab${i === 0 ? ' is-active' : ''}`}>
            <Icon
              name={['dashboard', 'inventory_2', 'timeline', 'assignment_return'][i]}
              className="oj-skel-icon--sm"
            />
            {tab}
          </span>
        ))}
      </nav>

      <section className="oj-skel-card oj-skel-pipeline">
        <header className="oj-skel-card-head">
          <Icon name="route" />
          <span>Package journey</span>
        </header>
        <div className="oj-skel-flow oj-skel-flow--wide">
          <div className="oj-skel-timeline">
            {[
              { icon: 'check_circle', tone: 'ok' },
              { icon: 'warehouse', tone: 'ok' },
              { icon: 'local_shipping', tone: 'mid' },
              { icon: 'package_2', tone: 'wait' },
              { icon: 'assignment_return', tone: 'wait' },
            ].map((s, i, arr) => (
              <div key={i} className={`oj-skel-tl-item is-${s.tone}`}>
                <div className="oj-skel-tl-rail">
                  <Icon name={s.icon} className="oj-skel-icon--sm" />
                  {i < arr.length - 1 ? <span className="oj-skel-tl-line" /> : null}
                </div>
                <div className="oj-skel-tl-body">
                  <Bone style={{ width: '7rem' }} />
                  <Bone className="oj-skel-bone--xs" style={{ width: '9rem', marginTop: '0.35rem' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="oj-skel-packages">
            {[1, 2].map((n) => (
              <div key={n} className="oj-skel-pkg">
                <div className="oj-skel-pkg-head">
                  <Icon name="inventory_2" className="oj-skel-icon--sm" />
                  <span>Package {n}</span>
                </div>
                <div className="oj-skel-journey oj-skel-journey--wide">
                  <JourneyStep icon="label" />
                  <span className="oj-skel-journey-line" />
                  <JourneyStep icon="local_shipping" active />
                  <span className="oj-skel-journey-line is-dim" />
                  <JourneyStep icon="package_2" />
                  <span className="oj-skel-journey-line is-dim" />
                  <JourneyStep icon="home" />
                  <span className="oj-skel-journey-line is-dim" />
                  <JourneyStep icon="assignment_return" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Big main + small actions — matches screenshot */}
      <div className="oj-skel-grid">
        <div className="oj-skel-main">
          <section className="oj-skel-card oj-skel-card--split">
            <div>
              <header className="oj-skel-card-head">
                <Icon name="person" />
                <span>Customer</span>
              </header>
              <div className="oj-skel-fields">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="oj-skel-field">
                    <Bone className="oj-skel-bone--xs" style={{ width: '30%' }} />
                    <Bone style={{ width: `${58 + (i % 3) * 12}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <header className="oj-skel-card-head">
                <Icon name="location_on" />
                <span>Shipping</span>
              </header>
              <div className="oj-skel-fields">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="oj-skel-field">
                    <Bone className="oj-skel-bone--xs" style={{ width: '34%' }} />
                    <Bone style={{ width: `${50 + (i % 4) * 10}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="oj-skel-card">
            <header className="oj-skel-card-head">
              <Icon name="shopping_bag" />
              <span>Line items</span>
              <Bone className="oj-skel-bone--xs oj-skel-ml" style={{ width: '2.5rem' }} />
            </header>
            <div className="oj-skel-table">
              <div className="oj-skel-table-head">
                {['Item', 'SKU', 'Qty', 'Status'].map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="oj-skel-table-row" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="oj-skel-item">
                    <span className="oj-skel-thumb">
                      <Icon name="image" className="oj-skel-icon--sm" />
                    </span>
                    <div>
                      <Bone style={{ width: '8rem' }} />
                      <Bone className="oj-skel-bone--xs" style={{ width: '5rem', marginTop: '0.35rem' }} />
                    </div>
                  </div>
                  <Bone style={{ width: '4.5rem' }} />
                  <Bone style={{ width: '1.5rem' }} />
                  <span className="oj-skel-pill">
                    <Bone style={{ width: '3.25rem', height: '0.55rem' }} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="oj-skel-card">
            <header className="oj-skel-card-head">
              <Icon name="history" />
              <span>Activity</span>
            </header>
            <ul className="oj-skel-activity">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
                  <span className={`oj-skel-dot is-${['ok', 'mid', 'ok', 'wait'][i]}`} />
                  <div>
                    <Bone style={{ width: `${55 + i * 8}%` }} />
                    <Bone className="oj-skel-bone--xs" style={{ width: '4.5rem', marginTop: '0.35rem' }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="oj-skel-aside">
          <section className="oj-skel-card oj-skel-actions">
            <header className="oj-skel-card-head">
              <Icon name="tune" />
              <span>Actions</span>
            </header>
            <div className="oj-skel-action-block">
              <Bone className="oj-skel-bone--xs" style={{ width: '40%' }} />
              <div className="oj-skel-select">
                <Icon name="warehouse" className="oj-skel-icon--sm" />
                <Bone style={{ width: '60%' }} />
                <Icon name="expand_more" className="oj-skel-icon--sm" />
              </div>
              <span className="oj-skel-btn oj-skel-btn--accent">
                <Icon name="check" className="oj-skel-icon--sm" />
                Assign
              </span>
            </div>
            <div className="oj-skel-action-block">
              <Bone className="oj-skel-bone--xs" style={{ width: '45%' }} />
              <div className="oj-skel-select">
                <Icon name="local_shipping" className="oj-skel-icon--sm" />
                <Bone style={{ width: '55%' }} />
              </div>
              <div className="oj-skel-select">
                <Icon name="qr_code_2" className="oj-skel-icon--sm" />
                <Bone style={{ width: '70%' }} />
              </div>
              <span className="oj-skel-btn oj-skel-btn--accent">
                <Icon name="send" className="oj-skel-icon--sm" />
                Ship
              </span>
            </div>
            <div className="oj-skel-action-block">
              <Bone className="oj-skel-bone--xs" style={{ width: '28%' }} />
              <div className="oj-skel-select oj-skel-select--tall">
                <Bone style={{ width: '80%' }} />
              </div>
              <span className="oj-skel-btn oj-skel-btn--ghost">
                <Icon name="assignment_return" className="oj-skel-icon--sm" />
                Create return
              </span>
            </div>
            <div className="oj-skel-alert">
              <Icon name="info" className="oj-skel-icon--sm" />
              <div>
                <Bone style={{ width: '90%' }} />
                <Bone className="oj-skel-bone--xs" style={{ width: '70%', marginTop: '0.4rem' }} />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
