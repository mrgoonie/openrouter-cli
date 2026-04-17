import { describe, expect, test } from 'bun:test';
import { base64url, codeChallenge, generateCodeVerifier } from '../../../src/lib/oauth/pkce.ts';

describe('generateCodeVerifier', () => {
  test('returns exactly 64 characters', () => {
    const v = generateCodeVerifier();
    expect(v).toHaveLength(64);
  });

  test('only contains URL-safe base64 characters (no +, /, =)', () => {
    for (let i = 0; i < 20; i++) {
      const v = generateCodeVerifier();
      expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test('produces different values on each call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('codeChallenge', () => {
  test('is deterministic for a fixed verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const c1 = await codeChallenge(verifier);
    const c2 = await codeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  test('output is base64url with no padding', async () => {
    const v = generateCodeVerifier();
    const challenge = await codeChallenge(v);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
  });

  test('SHA-256 output is 43 base64url chars (256 bits / 6 bits per char, no padding)', async () => {
    const v = generateCodeVerifier();
    const challenge = await codeChallenge(v);
    // base64url of 32 bytes = ceil(32 * 4/3) without padding = 43 chars
    expect(challenge).toHaveLength(43);
  });

  test('known verifier produces expected challenge', async () => {
    // RFC 7636 Appendix B test vector (adapted for base64url)
    // verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // challenge = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const result = await codeChallenge(verifier);
    expect(result).toBe(expected);
  });
});

describe('base64url', () => {
  test('encodes ArrayBuffer without padding or unsafe chars', () => {
    const buf = new Uint8Array([0xfb, 0xff, 0xfe]).buffer;
    const result = base64url(buf);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  test('encodes Uint8Array correctly', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02]);
    const result = base64url(bytes);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
