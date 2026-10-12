import { describe, expect, it } from 'vitest';
import { assertSafeSftpHost, matchGlob, posixJoin } from './host.util.js';

describe('host.util', () => {
  it('joins remote paths safely', () => {
    expect(posixJoin('/inbound/940', 'a.edi')).toBe('/inbound/940/a.edi');
    expect(() => posixJoin('/x', '../etc/passwd')).toThrow();
  });

  it('matches simple globs', () => {
    expect(matchGlob('a.edi', '*.edi')).toBe(true);
    expect(matchGlob('a.txt', '*.edi')).toBe(false);
  });

  it('blocks private hosts when disabled', () => {
    expect(() => assertSafeSftpHost('127.0.0.1', false)).toThrow();
    expect(() => assertSafeSftpHost('sftp.example.com', false)).not.toThrow();
  });
});
