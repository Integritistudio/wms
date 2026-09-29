import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'demo-button',
  secondary: 'demo-button demo-button-secondary',
  ghost: 'demo-btn demo-btn-ghost',
  danger: 'demo-button demo-button-danger',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'ui-btn-sm' : ''
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} ${sizeClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  )
}
