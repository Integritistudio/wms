#!/usr/bin/env node
/**
 * Shopify Admin API only — client_credentials + GraphQL.
 * No browser login.
 */


async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

(async () => {
  const tok = await getToken();
  console.log("TOKEN_SCOPES:", tok.scope);
  console.log("EXPIRES_IN:", tok.expires_in);

  const scopes = await gql(
    tok.access_token,
    `{
      currentAppInstallation {
        accessScopes { handle }
      }
    }`
  );
  console.log(
    "INSTALL_SCOPES:",
    JSON.stringify(scopes.data?.currentAppInstallation?.accessScopes?.map((s) => s.handle) || scopes, null, 2)
  );

  const locations = await gql(
    tok.access_token,
    `{ locations(first: 20) { nodes { id name isActive fulfillsOnlineOrders } } }`
  );
  console.log("LOCATIONS:", JSON.stringify(locations, null, 2));

  const product = await gql(
    tok.access_token,
    `{
      product(id: "gid://shopify/Product/10318546993402") {
        id title
        variants(first: 5) {
          nodes {
            id sku
            inventoryItem { id tracked }
            inventoryQuantity
          }
        }
      }
    }`
  );
  console.log("PRODUCT:", JSON.stringify(product, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
