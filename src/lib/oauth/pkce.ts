/**
 * PKCE (Proof Key for Code Exchange) helpers for OAuth 2.0 authorization code flow.
 * Uses Web Crypto API (available in Bun natively) — no external dependencies.
 */

/**
 * Convert an ArrayBuffer or Uint8Array to base64url encoding (no padding,
 * `+` → `-`, `/` → `_`) as required by RFC 7636.
 */
export function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // btoa works on binary strings
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a cryptographically random code verifier (64 URL-safe chars).
 * Spec: 48 random bytes → base64url → trim to 64 chars.
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, 64);
}

/**
 * Derive the code challenge from the verifier.
 * challenge = base64url(SHA-256(ASCII(verifier)))
 */
export async function codeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(digest);
}
