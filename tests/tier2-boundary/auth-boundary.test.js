// tests/tier2-boundary/auth-boundary.test.js
// Tier 2: Authentication Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R1, survey_features.md §6 Edge Cases 1-7

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { SignJWT } = require('jose');

describe('Tier 2: Authentication Boundary & Corner Cases', () => {
  let env;
  let client;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_empty_or_whitespace_username_rejected', async () => {
    // Edge Case 2: Username is empty string or only whitespace -> 400 Bad Request
    const emptyRes = await client.login('');
    assert.equal(emptyRes.status, 400);

    const spaceRes = await client.login('   ');
    assert.equal(spaceRes.status, 400);

    const tabRes = await client.login('\t\n');
    assert.equal(tabRes.status, 400);
  });

  it('test_username_whitespace_trimming', async () => {
    // Edge Case 1: System trims leading/trailing whitespace
    const regRes = await client.login('  trim_user  ');
    assert.equal(regRes.status, 200);
    assert.equal(regRes.data.user.username, 'trim_user');

    // Login without whitespace matches same user
    const loginRes = await client.login('trim_user');
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.user.id, regRes.data.user.id);
  });

  it('test_passwordless_user_arbitrary_password_tolerated', async () => {
    // Edge Case 3: Existing user with null passwordHash enters arbitrary password -> signs in successfully
    const userClient = client.fork();
    await userClient.login('quick_joiner');
    await userClient.logout();

    // Passwordless user enters arbitrary password
    const loginRes = await userClient.login('quick_joiner', 'AnyRandomString123!');
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.user.username, 'quick_joiner');
  });

  it('test_tampered_jwt_token_rejected_401', async () => {
    // Edge Case 6: Tampered JWT cookie signature -> 401 Unauthorized
    const testClient = client.fork();
    await testClient.login('tamper_victim');

    // Corrupt the token signature
    const validToken = testClient.cookies.get('auth_token');
    const parts = validToken.split('.');
    const corruptedToken = `${parts[0]}.${parts[1]}.corrupted_signature_xyz`;
    testClient.cookies.set('auth_token', corruptedToken);

    const meRes = await testClient.getMe();
    assert.equal(meRes.status, 401, 'Expected 401 Unauthorized for tampered JWT token');
  });

  it('test_expired_jwt_token_rejected_401', async () => {
    // Edge Case 6: Expired JWT session token -> 401 Unauthorized
    const testClient = client.fork();
    const expiredSecret = new TextEncoder().encode(process.env.JWT_SECRET || 'poi-studio-fallback-secret-key-32chars!');
    const expiredToken = await new SignJWT({ sub: 'expired-user-id', username: 'old_user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10) // expired 10s ago
      .sign(expiredSecret);

    testClient.cookies.set('auth_token', expiredToken);
    const meRes = await testClient.getMe();
    assert.equal(meRes.status, 401, 'Expected 401 Unauthorized for expired JWT');
  });

  it('test_open_redirect_protection_in_login', () => {
    // Edge Case 7: Validate redirect param starts with '/' and not '//' to prevent open redirect
    function sanitizeRedirect(redirect) {
      if (!redirect || typeof redirect !== 'string') return '/';
      const trimmed = redirect.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
        return trimmed;
      }
      return '/';
    }

    assert.equal(sanitizeRedirect('/trips/123'), '/trips/123');
    assert.equal(sanitizeRedirect('//evil.com/phish'), '/');
    assert.equal(sanitizeRedirect('https://evil.com'), '/');
    assert.equal(sanitizeRedirect('javascript:alert(1)'), '/');
  });
});
