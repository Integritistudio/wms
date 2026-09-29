'use strict'

/**
 * ModernWMS REST client — swap/edit this file for a different MWMS host layout.
 * Keep service.js / index.js orchestration unchanged.
 */
async function login(wmsConfig) {
  const baseUrl = wmsConfig.baseUrl || process.env.MODERNWMS_BASE_URL
  if (!baseUrl || process.env.MOCK_MODERNWMS === '1') {
    return { token: 'mock-token' }
  }
  const res = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: wmsConfig.username,
      password: wmsConfig.password,
    }),
  })
  if (!res.ok) throw new Error(`ModernWMS login failed: ${res.status}`)
  return res.json()
}

async function createDispatch(wmsConfig, token, body) {
  const baseUrl = wmsConfig.baseUrl || process.env.MODERNWMS_BASE_URL
  if (!baseUrl || process.env.MOCK_MODERNWMS === '1') {
    return { dispatchNo: `MOCK-${Date.now()}`, mock: true }
  }
  const res = await fetch(`${baseUrl}/api/dispatchlist/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`ModernWMS createDispatch failed: ${res.status}`)
  return res.json()
}

module.exports = { login, createDispatch }
