import http from "http";
import { URL } from "url";
import express from "express";

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
  <head><meta charset="utf-8"><title>WMS Linker</title></head>
  <body style="font-family:sans-serif;padding:2rem">
    <h1>Connected to WMS Linker</h1>
    <p>This Shopify app is a connector. Orders are processed by the WMS backend after the shop domain is allowlisted.</p>
  </body>
</html>`);
});

app.listen(PORT);
