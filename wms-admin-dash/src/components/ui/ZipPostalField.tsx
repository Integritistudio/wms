import { useEffect, useState } from 'react'
import { getPostalRules, type PostalRules } from '../../lib/api'
import FormField from './FormField'

type ZipPostalFieldProps = {
  country: string
  state: string
  value: string
  onChange: (value: string) => void
  label?: string
}

export default function ZipPostalField({
  country,
  state,
  value,
  onChange,
  label = 'ZIP / postal code',
}: ZipPostalFieldProps) {
  const [rules, setRules] = useState<PostalRules | null>(null)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!country) {
      setRules(null)
      return
    }
    let cancelled = false
    void getPostalRules(country, state || undefined)
      .then((next) => {
        if (!cancelled) setRules(next)
      })
      .catch(() => {
        if (!cancelled) setRules(null)
      })
    return () => {
      cancelled = true
    }
  }, [country, state])

  function validate(next: string) {
    if (!rules?.pattern || !next.trim()) {
      setLocalError('')
      return
    }
    try {
      const re = new RegExp(rules.pattern, 'i')
      setLocalError(re.test(next.trim()) ? '' : rules.hint)
    } catch {
      setLocalError('')
    }
  }

  return (
    <FormField label={label} hint={localError || rules?.hint}>
      <input
        className="demo-input"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          validate(event.target.value)
        }}
        onBlur={() => validate(value)}
        required
        placeholder={rules?.example || 'Postal code'}
        autoComplete="postal-code"
      />
    </FormField>
  )
}
