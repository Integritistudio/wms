export default function OrderDetailSkeleton() {
  return (
    <div className="oc-screen oc-skel" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading order…</span>

      <header className="oc-topbar">
        <span className="oc-icon-button oc-skel-bone" aria-hidden />
        <div className="oc-topbar-id">
          <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '3.5rem' }} />
          <strong className="oc-skel-bone" style={{ width: '4rem', height: '1.1rem' }} />
        </div>
        <span className="oc-live"><span /> LIVE</span>
        <div className="oc-topbar-actions">
          <span className="oc-skel-chip" />
          <span className="oc-skel-chip" />
        </div>
      </header>

      <section className="oc-hero">
        <div className="oc-hero-mist" aria-hidden />
        <div className="oc-hero-orb oc-hero-orb--a" aria-hidden />
        <div className="oc-hero-orb oc-hero-orb--b" aria-hidden />
        <div className="oc-hero-copy">
          <div className="oc-eyebrow">
            <span className="oc-skel-bone" style={{ width: 22, height: 22, borderRadius: 6 }} />
            <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '8rem' }} />
          </div>
          <div className="oc-hero-title-row">
            <span className="oc-skel-bone" style={{ width: '11rem', height: '2rem' }} />
            <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '5rem', height: '1.4rem', borderRadius: 999 }} />
          </div>
          <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '16rem', maxWidth: '90%' }} />
        </div>
        <div className="oc-intro-status" aria-hidden>
          <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '5rem', opacity: 0.4 }} />
          <span className="oc-skel-bone" style={{ width: '7rem', height: '1.25rem', opacity: 0.5 }} />
          <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '9rem', opacity: 0.35 }} />
        </div>
      </section>

      <section className="oc-pulse" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '55%' }} />
            <strong className="oc-skel-bone" style={{ width: '40%', height: '0.95rem' }} />
          </div>
        ))}
      </section>

      <section className="oc-map" aria-hidden>
        <div className="oc-section-heading">
          <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '5rem' }} />
          <strong className="oc-skel-bone" style={{ width: '10rem', height: '0.9rem' }} />
        </div>
        <div className="oc-map-grid" style={{ minHeight: 120 }}>
          <div className="oc-map-node oc-map-source" style={{ minHeight: 100 }} />
          <div className="oc-map-arrow" />
          <div className="oc-map-node oc-map-route" style={{ minHeight: 100 }} />
          <div className="oc-map-arrow" />
          <div className="oc-map-node oc-map-carrier" style={{ minHeight: 100 }} />
          <div className="oc-map-arrow" />
          <div className="oc-map-node oc-map-destination" style={{ minHeight: 100 }} />
        </div>
      </section>

      <div className="oc-content">
        <div className="oc-primary">
          <section className="oc-panel">
            <div className="oc-panel-heading">
              <div>
                <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '4rem' }} />
                <h2 className="oc-skel-bone" style={{ width: '8rem', height: '1.1rem', marginTop: 6 }} />
              </div>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="oc-item-row" style={{ borderBottom: i < 2 ? '1px solid var(--oc-line)' : 0 }}>
                <div className="oc-item-name">
                  <span className="oc-item-symbol oc-skel-bone" />
                  <strong>
                    <span className="oc-skel-bone" style={{ width: '9rem', height: '0.75rem' }} />
                    <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '5rem', marginTop: 4 }} />
                  </strong>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside className="oc-rail">
          <section className="oc-panel oc-person">
            <div className="oc-panel-heading">
              <div>
                <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '4rem' }} />
                <h2 className="oc-skel-bone" style={{ width: '6rem', height: '1rem', marginTop: 6 }} />
              </div>
            </div>
            <span className="oc-skel-bone" style={{ width: '70%', height: '0.85rem' }} />
            <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '90%', marginTop: 8 }} />
            <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '60%', marginTop: 6 }} />
          </section>
          <section className="oc-panel oc-finance">
            <div className="oc-panel-heading">
              <div>
                <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '5rem' }} />
                <h2 className="oc-skel-bone" style={{ width: '5rem', height: '1rem', marginTop: 6 }} />
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '35%' }} />
                <span className="oc-skel-bone oc-skel-bone--xs" style={{ width: '25%' }} />
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
