import http from "http";
import { URL } from "url";
import express from "express";
import { readFileSync } from "node:fs";

const logoUrl = `data:image/svg+xml;base64,${readFileSync(new URL("./frontend/public/brand/synovia-logo.svg", import.meta.url)).toString("base64")}`;
const iconUrl = `data:image/svg+xml;base64,${readFileSync(new URL("./frontend/public/brand/synovia-icon.svg", import.meta.url)).toString("base64")}`;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);
const WMS_BACKEND_URL = process.env.WMS_BACKEND_URL || "http://127.0.0.1:3000";

const app = express();

function proxyToBackend(req, res, pathname = req.originalUrl) {
  const target = new URL(pathname, WMS_BACKEND_URL);
  const headers = { ...req.headers, host: target.host };
  const proxyReq = http.request(
    target,
    {
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error) => {
    res.status(502).json({
      success: false,
      message: "WMS backend unreachable. Start wms-app-backend on port 3000.",
      errors: [error.message],
    });
  });

  req.pipe(proxyReq);
}

app.use("/shopify", (req, res) => {
  proxyToBackend(req, res);
});

app.post("/api/webhooks", (req, res) => {
  proxyToBackend(req, res, `/shopify/webhooks${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
});

app.get("/api/auth", (req, res) => {
  const shop = req.query.shop || "";
  res.redirect(`/shopify/auth?shop=${encodeURIComponent(String(shop))}`);
});

app.get("/api/auth/callback", (req, res) => {
  const search = new URL(req.originalUrl, "http://localhost").search;
  proxyToBackend(req, res, `/shopify/auth/callback${search}`);
});

app.get("/", (req, res) => {
  if (req.query.shop) {
    return res.redirect(`/shopify/auth?shop=${encodeURIComponent(String(req.query.shop))}`);
  }

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#2364e4"><title>Synovia</title>
    <link rel="icon" type="image/svg+xml" href="${iconUrl}">
    <style>*{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#0f172a;font:15px/1.7 system-ui,sans-serif}.welcome{max-width:720px;margin:48px auto;padding:32px;background:white;border:1px solid #dce4ef;border-radius:16px}.welcome img{display:block;width:175px;height:50px;object-fit:contain;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2364e4;font-weight:700}h1{font-size:28px;line-height:1.2;letter-spacing:-1px}p{color:#64748b}.note{padding:16px;background:#f0f5ff;border-left:3px solid #2364e4;border-radius:6px}@media(max-width:600px){.welcome{margin:20px 16px;padding:24px}}</style>
  </head>
  <body><main class="welcome">
    <img src="${logoUrl}" alt="Synovia" width="175" height="50">
    <p class="eyebrow">Shopify &amp; warehouse operations</p>
    <h1>Welcome to Synovia</h1>
    <p>Connect your Shopify store to your warehouse workflow, from incoming orders to shipment tracking.</p>
    <p class="note">Open Synovia from Apps in Shopify Admin to authorize your store. Company Root can manage store and warehouse connections in the company portal.</p>
  </main></body>
</html>`);
});

app.listen(PORT);
