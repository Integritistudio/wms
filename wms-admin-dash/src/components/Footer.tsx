export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer mt-16 px-4 pb-10 pt-8 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm text-[var(--text-muted)]">
          &copy; {year} WMS Linker
        </p>
        <p className="m-0 text-sm text-[var(--text-muted)]">Warehouse operations console</p>
      </div>
    </footer>
  )
}
