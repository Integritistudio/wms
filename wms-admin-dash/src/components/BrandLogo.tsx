type BrandLogoProps = {
  className?: string
  title?: string
  compact?: boolean
}

/** Both wordmarks share the original vector geometry and brand symbol. */
export default function BrandLogo({ className = '', title = 'Synovia', compact = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo${className ? ` ${className}` : ''}`}>
      <img className="brand-logo-light" src={compact ? '/SVG-ICon.svg' : '/logo.svg'} alt={title} title={title} draggable={false} />
      <img className="brand-logo-dark" src={compact ? '/SVG-ICon.svg' : '/logo-dark.svg'} alt={title} title={title} draggable={false} />
    </span>
  )
}
