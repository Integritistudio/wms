import express from 'express';

const app = express();
const port = process.env.PORT ?? 9090;
const requests = [];

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

app.post('/hook', (req, res) => {
  requests.push({
    headers: req.headers,
    body: req.body,
    rawBody: req.rawBody,
    at: new Date().toISOString(),
  });
  res.status(200).json({ ok: true });
});

app.post('/hook-fail', (_req, res) => {
  res.status(500).json({ ok: false });
});

app.get('/requests', (_req, res) => {
  res.json(requests);
});

app.delete('/requests', (_req, res) => {
  requests.length = 0;
  res.status(204).end();
});

app.listen(port, () => {
  console.log(`Webhook receiver listening on ${port}`);
});
