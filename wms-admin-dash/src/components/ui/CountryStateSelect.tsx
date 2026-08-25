import { useEffect, useState } from 'react'
import { listCountries, listStates, type LocationCountry, type LocationState } from '../../lib/api'
import FormField from './FormField'

type CountryStateSelectProps = {
  country: string
  state: string
  onCountryChange: (isoCode: string) => void
  onStateChange: (isoCode: string) => void
}

export default function CountryStateSelect({
  country,
  state,
  onCountryChange,
  onStateChange,
}: CountryStateSelectProps) {
  const [countries, setCountries] = useState<LocationCountry[]>([])
  const [states, setStates] = useState<LocationState[]>([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingStates, setLoadingStates] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listCountries()
      .then((rows) => {
        if (cancelled) return
        setCountries(rows)
        if (!country && rows.length) {
          const us = rows.find((item) => item.isoCode === 'US')
          onCountryChange((us || rows[0]).isoCode)
        }
      })
      .catch(() => {
        if (!cancelled) setCountries([])
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!country) {
      setStates([])
      return
    }
    let cancelled = false
    setLoadingStates(true)
    void listStates(country)
      .then((rows) => {
        if (cancelled) return
        setStates(rows)
        if (state && !rows.some((item) => item.isoCode === state)) {
          onStateChange('')
        }
      })
      .catch(() => {
        if (!cancelled) setStates([])
      })
      .finally(() => {
        if (!cancelled) setLoadingStates(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country])

  return (
    <>
      <FormField label="Country">
        <select
          className="demo-input"
          value={country}
          required
          disabled={loadingCountries || countries.length === 0}
          onChange={(event) => {
            onCountryChange(event.target.value)
            onStateChange('')
          }}
        >
          <option value="">{loadingCountries ? 'Loading…' : 'Select country'}</option>
          {countries.map((item) => (
            <option key={item.id} value={item.isoCode}>
              {item.name} ({item.isoCode})
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="State / province">
        <select
          className="demo-input"
          value={state}
          required={states.length > 0}
          disabled={!country || loadingStates || states.length === 0}
          onChange={(event) => onStateChange(event.target.value)}
        >
          <option value="">
            {!country
              ? 'Select a country first'
              : loadingStates
                ? 'Loading…'
                : states.length === 0
                  ? 'No states for this country'
                  : 'Select state'}
          </option>
          {states.map((item) => (
            <option key={item.id} value={item.isoCode}>
              {item.name} ({item.isoCode})
            </option>
          ))}
        </select>
      </FormField>
    </>
  )
}
