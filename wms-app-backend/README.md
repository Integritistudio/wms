# wms-app-backend

Fastify API for WMS Linker. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm install
npm run dev
```

Platform console path is `ADMIN_CONSOLE_PATH` (default `c-7f3k91qx`). Open:

`http://localhost:5173/c-7f3k91qx/login`

Warehouse uploaders: `http://localhost:5173/u/login`


## Email delivery

All email is sent directly by this backend through Nodemailer/SMTP. The email
microservice is paused; `EMAIL_MS_BASE_URL` and `EMAIL_MS_ADMIN_SECRET` are ignored.

- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`
  on the main backend for platform email (company signup/approval, file links,
  and platform DLQ alerts). Port 465 uses implicit TLS.
- Configure company SMTP in the portal Email Settings for notification alerts
  and company-user invitations/password resets. Invitations and resets use
  backend environment SMTP when company SMTP is not configured.
- SMTP settings and test emails use the main backend and MongoDB directly.
  Saved passwords stay on the server; a blank password retains the saved value.
- If credentials existed only in the email microservice, re-enter them in the
  company portal. No remote credential migration is performed.

Run `node scripts/test-local-email.cjs` for isolated delivery regression checks
using mocked SMTP transports (no real emails are sent).
