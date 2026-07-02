import { describe, it, expect } from 'vitest';
import { isBlockedHostname, parseIpv4, parseIpv6 } from '../src/net.js';

// Mirrors the checker worker's SSRF test vector so the two cannot drift.
function hostFor(rawUrl: string): boolean {
  return isBlockedHostname(new URL(rawUrl).hostname);
}

describe('SSRF hostname blocklist', () => {
  const BLOCK = [
    'http://localhost/',
    'http://foo.localhost/',
    'http://x.local/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://169.254.169.254/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://2130706433/',
    'http://[::1]/',
    'http://[::]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[fe80::1]/',
    'http://[fe90::1]/',
    'http://[febf::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
  ];
  const ALLOW = [
    'http://example.com/',
    'https://agentmarkup.dev/',
    'http://93.184.216.34/',
    'http://8.8.8.8/',
    'http://100.63.255.255/',
    'http://100.128.0.1/',
    'http://172.15.0.1/',
    'http://172.32.0.1/',
    'http://192.169.0.1/',
    'http://[2606:4700::1]/',
    'http://[2001:db8::1]/',
    'http://1.1.1.1/',
  ];

  it('blocks private, loopback, link-local, CGNAT and IPv6 bypass forms', () => {
    for (const url of BLOCK) {
      expect(hostFor(url), `${url} should be blocked`).toBe(true);
    }
  });

  it('allows public hosts including boundary addresses', () => {
    for (const url of ALLOW) {
      expect(hostFor(url), `${url} should be allowed`).toBe(false);
    }
  });
});

describe('IP parsers', () => {
  it('parses dotted-quad IPv4 and rejects out-of-range octets', () => {
    expect(parseIpv4('192.168.0.1')).toEqual([192, 168, 0, 1]);
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('example.com')).toBeNull();
  });

  it('expands IPv6 including :: and IPv4-mapped suffixes', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x7f00, 1,
    ]);
    expect(parseIpv6('not-ipv6')).toBeNull();
  });
});
