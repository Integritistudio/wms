const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > 320) return false;
  return EMAIL_RE.test(email);
}

export function assertEmails(values: string[], label: string): string[] {
  const out: string[] = [];
  for (const raw of values || []) {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) {
      throw new Error(`Invalid ${label}: ${raw}`);
    }
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** Safe mustache-like {{var}} substitution — no code execution */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown> = {},
): string {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const parts = key.split('.');
    let cur: unknown = variables;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[p];
    }
    if (cur == null) return '';
    if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') {
      return String(cur);
    }
    return '';
  });
}
