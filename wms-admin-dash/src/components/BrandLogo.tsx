type BrandLogoProps = {
  className?: string
  title?: string
  compact?: boolean
}

/** Site wordmark from /public/logo.svg */
export default function BrandLogo({ className = '', title = 'Synovia', compact = false }: BrandLogoProps) {
  return (
    <img
      src={compact ? '/SVG-ICon.svg' : '/logo.svg'}
      alt={title}
      title={title}
      className={`brand-logo${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  )
}
