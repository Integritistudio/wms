/**
 * Shared HTML email layouts for WMS Linker transactional mail.
 * Keep markup table-based + inline styles for broad client support.
 */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roleLabel(role) {
  switch (String(role || "").toLowerCase()) {
    case "root":
      return "Company Root";
    case "warehouse":
      return "Warehouse User";
    case "member":
      return "Company User";
    default:
      return String(role || "User");
  }
}

function buildEmailLayout({
  preheader = "",
  title,
  greeting,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footnote = "",
  metaRows = [],
}) {
  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeCta = escapeHtml(ctaLabel);
  const safeUrl = escapeHtml(ctaUrl);
  const safePreheader = escapeHtml(preheader);
  const safeFootnote = escapeHtml(footnote);

  const metaHtml = (metaRows || [])
    .filter((row) => row && row.label && row.value)
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#8EA3B0;width:120px;vertical-align:top;">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:8px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#161616;font-weight:600;vertical-align:top;">
          ${escapeHtml(row.value)}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#F1EDE4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${safePreheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EDE4;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFCFA;border-radius:14px;overflow:hidden;border:1px solid #D4CEC3;">
          <tr>
            <td style="background:#161616;padding:22px 28px;">
              <p style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#F4E06D;font-weight:700;">
                WMS Linker
              </p>
              <h1 style="margin:8px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#F1EDE4;font-weight:700;">
                ${safeTitle}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;color:#161616;font-weight:600;">
                ${safeGreeting}
              </p>
              <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#3A3A3A;">
                ${bodyHtml}
              </div>
              ${
                metaHtml
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;border-top:1px solid #D4CEC3;border-bottom:1px solid #D4CEC3;">${metaHtml}</table>`
                  : ""
              }
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                <tr>
                  <td style="border-radius:8px;background:#FF4D2E;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      ${safeCta}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8EA3B0;">
                If the button does not work, copy and paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:#FF4D2E;word-break:break-all;">${safeUrl}</a>
              </p>
              ${
                safeFootnote
                  ? `<p style="margin:18px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#8EA3B0;">${safeFootnote}</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;background:#E8E2D6;border-top:1px solid #D4CEC3;">
              <p style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8EA3B0;">
                This message was sent by WMS Linker. If you were not expecting this email, you can ignore it safely.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function inviteEmailContent({ companyName, memberName, role, url, expires = "7 days" }) {
  const company = companyName || "your company";
  const name = memberName || "there";
  const roleText = roleLabel(role);
  const title = "Set your password";
  const subject = `Set your password for ${company} on WMS Linker`;
  const text = [
    `Hi ${name},`,
    "",
    `You've been invited to join ${company} on WMS Linker as a ${roleText}.`,
    "",
    `Set your password to get started:`,
    url,
    "",
    `This secure link expires in ${expires}.`,
    "",
    "If you did not expect this invitation, you can ignore this email.",
  ].join("\n");

  const html = buildEmailLayout({
    preheader: `Join ${company} on WMS Linker — set your password to continue.`,
    title,
    greeting: `Hi ${name},`,
    bodyHtml: `<p style="margin:0 0 12px;">You've been invited to join <strong>${escapeHtml(company)}</strong> on WMS Linker.</p>
      <p style="margin:0;">Use the button below to create your password and access the company portal.</p>`,
    ctaLabel: "Set password & continue",
    ctaUrl: url,
    footnote: `This secure link expires in ${expires}.`,
    metaRows: [
      { label: "Company", value: company },
      { label: "Role", value: roleText },
    ],
  });

  return { subject, text, html };
}

function resetEmailContent({ companyName, memberEmail, url, expires = "24 hours" }) {
  const company = companyName || "your company";
  const subject = "Reset your WMS Linker password";
  const text = [
    `A password reset was requested for ${memberEmail} at ${company}.`,
    "",
    `Reset your password:`,
    url,
    "",
    `This secure link expires in ${expires}.`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = buildEmailLayout({
    preheader: `Password reset for ${company} — link expires in ${expires}.`,
    title: "Reset your password",
    greeting: "Hello,",
    bodyHtml: `<p style="margin:0 0 12px;">We received a request to reset the password for <strong>${escapeHtml(memberEmail)}</strong> on <strong>${escapeHtml(company)}</strong>.</p>
      <p style="margin:0;">Click the button below to choose a new password.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: url,
    footnote: `This secure link expires in ${expires}. If you did not request a reset, no action is needed.`,
    metaRows: [
      { label: "Company", value: company },
      { label: "Account", value: memberEmail },
    ],
  });

  return { subject, text, html };
}

module.exports = {
  escapeHtml,
  roleLabel,
  buildEmailLayout,
  inviteEmailContent,
  resetEmailContent,
};
