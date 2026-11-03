import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberToken, hashMemberToken } from './memberTokens.js';

test('tokens have 256 random bits and distinct values', () => {
  const tokens = Array.from({ length: 100 }, createMemberToken);
  assert.equal(new Set(tokens).size, 100);
  for (const token of tokens) assert.match(token, /^RONW-[a-f0-9]{64}$/);
});
test('lookup uses a stable SHA-256 hash and permits pasted whitespace', async () => {
  const token = `RONW-${'a'.repeat(64)}`;
  const hash = await hashMemberToken(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token.slice(5));
  assert.equal(await hashMemberToken(` ${token}\n`), hash);
  assert.notEqual(await hashMemberToken(`RONW-${'b'.repeat(64)}`), hash);
});
test('malformed tokens are rejected before authentication', async () => {
  for (const token of ['', 'test', 'RONW-short', `RONW-${'g'.repeat(64)}`, `OTHER-${'a'.repeat(64)}`]) await assert.rejects(hashMemberToken(token));
});
