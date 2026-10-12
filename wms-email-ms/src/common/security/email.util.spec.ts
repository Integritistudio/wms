import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail, renderTemplate } from './email.util.js';

describe('email.util', () => {
  it('validates and normalizes emails', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(isValidEmail('foo@bar.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('renders templates safely', () => {
    expect(renderTemplate('Hi {{ name }}', { name: 'Ada' })).toBe('Hi Ada');
    expect(renderTemplate('Hi {{ user.name }}', { user: { name: 'Ada' } })).toBe(
      'Hi Ada',
    );
    expect(renderTemplate('Hi {{ missing }}', {})).toBe('Hi ');
  });
});
