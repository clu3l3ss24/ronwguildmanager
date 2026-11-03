// Login uses the SHA-256 digest. Recoverable copies are kept in leader-only tokenSecrets.
export function createMemberToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `RONW-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function hashMemberToken(token) {
  const normalized = String(token || '').trim();
  if (!/^RONW-[a-f0-9]{64}$/.test(normalized)) throw new Error('Enter a complete member token beginning with RONW-.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
