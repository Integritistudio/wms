'use strict'

/** Shopify Admin GraphQL client — keep API version / auth here. */
async function shopifyGraphQL(shopDomain, token, query, variables) {
  const version = process.env.SHOPIFY_API_VERSION || '2026-04'
  const res = await fetch(`https://${shopDomain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json
}

module.exports = { shopifyGraphQL }
