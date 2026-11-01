// tests/tier1-feature/auth.test.js
// Tier 1: Authentication & User Profile Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R1, docs/FEATURES.md §1, survey_specs.md §3

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 1: Auth & User Profile Feature Coverage', () => {
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

  it('test_auto_registration_creates_account_and_session', async () => {
    // R1.1 & R1.2: Entering a new username creates an account and issues a 30-day JWT cookie
    const res = await client.login('new_traveler_1');
    assert.equal(res.status, 200, 'Expected 200 OK on auto-registration');
    assert.ok(res.data.user, 'Expected user object in response');
    assert.equal(res.data.user.username, 'new_traveler_1');
    assert.ok(res.data.user.id, 'Expected user id');
    assert.equal(res.data.user.avatarColor, '#6366F1');

    // Verify session persistence via /api/auth/me
    const meRes = await client.getMe();
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.id, res.data.user.id);
    assert.equal(meRes.data.user.username, 'new_traveler_1');
  });

  it('test_passwordless_quick_login_for_existing_user', async () => {
    // R1.3: Existing user with null passwordHash signs in with username alone
    const userClient = client.fork();
    const regRes = await userClient.login('speedy_traveler');
    assert.equal(regRes.status, 200);

    // Logout
    await userClient.logout();
    const loggedOutMe = await userClient.getMe();
    assert.equal(loggedOutMe.status, 401);

    // Quick login with username alone
    const loginRes = await userClient.login('speedy_traveler');
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.user.username, 'speedy_traveler');
  });

  it('test_password_protected_login_verification', async () => {
    // R1.4: Existing user with password must provide valid credentials
    const secureClient = client.fork();
    const regRes = await secureClient.login('secure_user', 'MyPass123!');
    assert.equal(regRes.status, 200);

    // Attempt login with wrong password
    const badClient = client.fork();
    const badRes = await badClient.login('secure_user', 'WrongPass!');
    assert.equal(badRes.status, 401, 'Expected 401 on incorrect password');

    // Attempt login with omitted password for password-protected account
    const noPassRes = await badClient.login('secure_user');
    assert.equal(noPassRes.status, 401, 'Expected 401 when password omitted for protected user');

    // Login with correct password
    const goodRes = await badClient.login('secure_user', 'MyPass123!');
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.data.user.username, 'secure_user');
  });

  it('test_jwt_session_cookie_validation_and_claims', async () => {
    // R1.5: Stateless HTTP-only JWT cookies via jose with 30-day expiry
    const testClient = client.fork();
    const res = await testClient.login('jwt_tester');
    assert.equal(res.status, 200);

    // Inspect cookie jar
    assert.ok(testClient.cookies.has('auth_token'), 'Expected auth_token cookie to be set');

    const meRes = await testClient.getMe();
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.username, 'jwt_tester');
  });

  it('test_profile_update_avatar_color', async () => {
    // R1.7: User profile modal allows changing avatarColor
    const profClient = client.fork();
    await profClient.login('color_fan');

    const updateRes = await profClient.updateProfile({ avatarColor: '#10B981' });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.user.avatarColor, '#10B981');

    // Confirm state updated in database
    const meRes = await profClient.getMe();
    assert.equal(meRes.data.user.avatarColor, '#10B981');
  });

  it('test_profile_set_change_and_remove_password', async () => {
    // R1.7: Passwordless user sets password, verifies changes, and removes password
    const userClient = client.fork();
    await userClient.login('pw_cycler');

    // 1. Set initial password on passwordless account
    const setRes = await userClient.updateProfile({ newPassword: 'InitialSecret!' });
    assert.equal(setRes.status, 200);

    // 2. Change password requires current password
    const changeFail = await userClient.updateProfile({
      currentPassword: 'WrongPassword',
      newPassword: 'BrandNewSecret!',
    });
    assert.equal(changeFail.status, 401);

    const changeOk = await userClient.updateProfile({
      currentPassword: 'InitialSecret!',
      newPassword: 'BrandNewSecret!',
    });
    assert.equal(changeOk.status, 200);

    // 3. Remove password (revert to passwordless)
    const removeOk = await userClient.updateProfile({
      currentPassword: 'BrandNewSecret!',
      newPassword: null,
    });
    assert.equal(removeOk.status, 200);

    // 4. Verify passwordless sign-in works again
    const freshClient = client.fork();
    const quickRes = await freshClient.login('pw_cycler');
    assert.equal(quickRes.status, 200);
  });

  it('test_logout_clears_session_cookie', async () => {
    // R1: Logout clears session and subsequent requests return 401
    const testClient = client.fork();
    await testClient.login('logout_user');
    const meBefore = await testClient.getMe();
    assert.equal(meBefore.status, 200);

    const logoutRes = await testClient.logout();
    assert.equal(logoutRes.status, 200);
    assert.equal(testClient.cookies.has('auth_token'), false, 'Expected auth_token to be cleared from cookie jar');

    const meAfter = await testClient.getMe();
    assert.equal(meAfter.status, 401);
  });
});
