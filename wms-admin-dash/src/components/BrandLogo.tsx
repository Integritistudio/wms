type BrandLogoProps = {
  className?: string
  title?: string
}

/** Site wordmark from /public/logo.svg */
export default function BrandLogo({ className = '', title = 'Synovia' }: BrandLogoProps) {
  return (
    <img
      src="/logo.svg"
      alt={title}
      title={title}
      className={`brand-logo${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  )
}
