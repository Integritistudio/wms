import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export function assertSafeSftpHost(host: string, allowPrivateHosts: boolean): void {
  const h = String(host || '').trim().toLowerCase();
  if (!h) throw new Error('SFTP host is required');
  if (h.includes('/') || h.includes('\\') || h.includes('@')) {
    throw new Error('Invalid SFTP host');
  }
  if (BLOCKED_HOSTS.has(h) && !allowPrivateHosts) {
    throw new Error('SFTP host is not allowed');
  }
  const ipVersion = isIP(h);
  if (ipVersion === 4 && isPrivateIpv4(h) && !allowPrivateHosts) {
    throw new Error('Private SFTP hosts are blocked');
  }
  if (ipVersion === 6 && !allowPrivateHosts && (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))) {
    throw new Error('Private SFTP hosts are blocked');
  }
}

export function posixJoin(dir: string, fileName: string): string {
  const base = String(dir || '/').replace(/\\/g, '/').replace(/\/+$/, '') || '';
  const name = String(fileName || '').replace(/^\/+/, '');
  if (!name || name.includes('..') || name.includes('\\')) {
    throw new Error('Invalid file name');
  }
  return `${base}/${name}`.replace(/\/+/g, '/');
}

export function matchGlob(fileName: string, glob: string): boolean {
  const g = String(glob || '*').trim();
  if (g === '*' || g === '*.*') return true;
  if (g.startsWith('*.')) {
    return fileName.toLowerCase().endsWith(g.slice(1).toLowerCase());
  }
  return fileName === g;
}
