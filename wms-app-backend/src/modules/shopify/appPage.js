const { logoUrl, iconUrl } = require('./brand');

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function renderAppPage({ shop = "", title, message, state = "info", head = "", script = "", retry = false }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Synovia · Shopify connection</title>
  <meta name="theme-color" content="#2364e4">
  <link rel="icon" type="image/svg+xml" href="${iconUrl}">
  ${head}
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f6f7f8;color:#202223;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .shell{max-width:1000px;margin:auto;padding:32px 24px 48px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:32px;font-size:21px;font-weight:700;letter-spacing:-.6px}
    .brand{gap:20px;flex-wrap:wrap;letter-spacing:0}.brand-logo{display:block;width:175px;height:50px;object-fit:contain}.brand small{display:block;border-left:1px solid #dce4ef;padding-left:20px;font-size:12px;font-weight:500;color:#64748b}
    .intro{margin-bottom:24px}.eyebrow{margin:0 0 6px;color:#527167;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px}h1{font-size:30px;line-height:1.2;letter-spacing:-1px;margin:0 0 12px}p{margin:0 0 12px}.muted{color:#646c69}
    .grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(230px,1fr);gap:20px}.card{background:white;border:1px solid #e0e5e2;border-radius:16px;padding:24px;box-shadow:0 2px 3px #172b2304}h2{font-size:16px;margin:0 0 16px;letter-spacing:-.3px}
    .store{font-size:13px;overflow-wrap:anywhere;border-bottom:1px solid #edf0ee;padding-bottom:16px;margin-bottom:20px}.store span{display:block;font-size:11px;color:#68716e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
    .status{padding:16px;border-radius:10px;background:#f1f5f4;border:1px solid #dce5e1;margin-bottom:18px}.status p{margin:0}.status strong{display:block;margin-bottom:6px}.status[data-state="success"]{background:#edf8f1;border-color:#c7e8d1}.status[data-state="warning"]{background:#fff8e9;border-color:#eeddb6}.status[data-state="error"]{background:#fff1f0;border-color:#f1cbc7}
    button{font:inherit;font-weight:600;background:#263e35;color:white;border:1px solid #263e35;border-radius:8px;padding:9px 16px;cursor:pointer}button:hover{background:#174d43}button:focus-visible{outline:3px solid #75bda7;outline-offset:3px}button:disabled{opacity:.55;cursor:wait}
    ol{padding:0;margin:0;list-style:none;counter-reset:steps}li{position:relative;padding:0 0 20px 36px;counter-increment:steps}li:last-child{padding-bottom:0}li:before{content:counter(steps);position:absolute;left:0;top:1px;display:grid;place-items:center;width:24px;height:24px;background:#edf3f0;border-radius:50%;font-size:12px;color:#365d4f;font-weight:700}li strong{display:block;margin-bottom:3px}li p{font-size:13px;color:#646c69;margin:0}
    .flow{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px;padding-top:20px;border-top:1px solid #edf0ee;font-size:12px;color:#646c69}.flow span{background:#f5f7f6;padding:5px 10px;border-radius:6px}footer{margin-top:24px;color:#727b76;font-size:12px;text-align:center}
    @media(max-width:650px){.shell{padding:20px 16px}.grid{grid-template-columns:1fr}.card{padding:20px}h1{font-size:25px}.brand{margin-bottom:24px}}
    .eyebrow{color:#2364e4}button{background:#2364e4;border-color:#2364e4}button:hover{background:#1d4ed8}button:focus-visible{outline-color:#93b4ff}li:before{background:#edf3ff;color:#2364e4}li:last-child:before{background:#fff4e3;color:#9a5800}.flow span{background:#f0f5ff;color:#42618a}
    @media(max-width:480px){.brand{gap:4px;align-items:flex-start;flex-direction:column}.brand small{border:0;padding:0}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="brand"><img class="brand-logo" src="${logoUrl}" alt="Synovia" width="175" height="50"><small>Shopify &amp; warehouse operations</small></header>
    <div class="intro"><p class="eyebrow">Your fulfillment connection</p><h1>Keep your store and warehouse in sync.</h1><p class="muted">Connect Shopify to your warehouse workflow, from incoming orders to shipment tracking.</p></div>
    <div class="grid">
      <section class="card" aria-labelledby="connection-heading">
        <h2 id="connection-heading">Store connection</h2>
        <div class="store"><span>Shopify store</span>${escapeHtml(shop || "Open from Shopify Admin to select your store")}</div>
        <div class="status" id="connection-state" data-state="${escapeHtml(state)}" role="status" aria-live="polite" aria-atomic="true"><strong id="status-title">${escapeHtml(title)}</strong><p id="status">${escapeHtml(message)}</p></div>
        ${retry ? '<button type="button" id="retry-connection" hidden>Retry connection</button>' : ""}
        <p class="muted">Manage warehouse links, routing, inventory, and orders in your company portal under <strong>Stores &amp; Warehouses</strong>.</p>
        <div class="flow" aria-label="Fulfillment workflow"><span>Shopify orders</span><span aria-hidden="true">→</span><span>Warehouse fulfillment</span><span aria-hidden="true">→</span><span>Shipment tracking</span></div>
      </section>
      <aside class="card" aria-labelledby="setup-heading"><h2 id="setup-heading">Connection checklist</h2><ol>
        <li><strong>Add your store</strong><p>Company Root adds the Shopify domain in Stores &amp; Warehouses.</p></li>
        <li><strong>Authorize Synovia</strong><p>Open the app in Shopify Admin to complete the connection.</p></li>
        <li><strong>Link your warehouses</strong><p>Confirm stock, location mappings, and routing in your company portal.</p></li>
      </ol></aside>
    </div>
    <footer>Synovia · WMS inventory is the source of truth. Review inventory mappings before syncing.</footer>
  </main>
  ${script}
</body>
</html>`;
}

module.exports = { renderAppPage };
