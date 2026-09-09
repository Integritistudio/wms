import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-3.5">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight text-[var(--sea-ink)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-[var(--lagoon-deep)]" />
            WMS Linker
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
