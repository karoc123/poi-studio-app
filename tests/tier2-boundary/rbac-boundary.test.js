// tests/tier2-boundary/rbac-boundary.test.js
// Tier 2: RBAC & Collaboration Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R2, survey_features.md §6 Edge Cases 14-18

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 2: RBAC & Collaboration Boundary & Corner Cases', () => {
  let env;
  let ownerClient;
  let viewerClient;
  let tripId;
  let inviteCode;

  before(async () => {
    env = await setupTestEnv();
    ownerClient = env.client;
    await ownerClient.login('rbac_bound_owner');

    viewerClient = ownerClient.fork();
    await viewerClient.login('rbac_bound_viewer');

    const tripRes = await ownerClient.createTrip({ title: 'Boundary RBAC Fortress' });
    tripId = tripRes.data.trip.id;
    inviteCode = tripRes.data.trip.inviteCode;

    // Join viewer and demote to VIEWER
    await viewerClient.joinTrip(inviteCode);
    const viewerMe = await viewerClient.getMe();
    await ownerClient.updateMemberRole(tripId, viewerMe.data.user.id, 'VIEWER');
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_invalid_or_nonexistent_invite_code_404', async () => {
    // Edge Case 15: Invalid or non-existent code returns 404 Not Found
    const freshClient = ownerClient.fork();
    await freshClient.login('lost_traveler');

    const badCodeRes = await freshClient.joinTrip('nonexistent123');
    assert.equal(badCodeRes.status, 404, 'Expected 404 for nonexistent code');

    const emptyCodeRes = await freshClient.joinTrip('');
    assert.equal(emptyCodeRes.status, 400);
  });

  it('test_duplicate_invite_enrollment_idempotent', async () => {
    // Edge Case 14: Visiting invite code when already enrolled does not duplicate membership
    const memberClient = ownerClient.fork();
    await memberClient.login('idempotent_member');

    // First join
    const join1 = await memberClient.joinTrip(inviteCode);
    assert.equal(join1.status, 200);

    // Second join
    const join2 = await memberClient.joinTrip(inviteCode);
    assert.equal(join2.status, 200);

    // Check member roster count
    const membersRes = await ownerClient.getMembers(tripId);
    const matches = membersRes.data.members.filter((m) => m.user.username === 'idempotent_member');
    assert.equal(matches.length, 1, 'User must not have duplicate membership entries');
  });

  it('test_sole_owner_cannot_demote_themselves', async () => {
    // Edge Case 17: Trip must always retain at least one OWNER; demoting sole owner blocked
    const ownerMe = await ownerClient.getMe();
    const demoteRes = await ownerClient.updateMemberRole(tripId, ownerMe.data.user.id, 'EDITOR');
    assert.equal(demoteRes.status, 400, 'Expected 400 when demoting sole OWNER');

    // Verify still OWNER
    const tripRes = await ownerClient.getTrip(tripId);
    assert.equal(tripRes.data.trip.currentUserRole, 'OWNER');
  });

  it('test_sole_owner_cannot_leave_trip', async () => {
    // Edge Case 17: Sole owner cannot leave trip without transferring ownership
    const ownerMe = await ownerClient.getMe();
    const leaveRes = await ownerClient.removeMember(tripId, ownerMe.data.user.id);
    assert.equal(leaveRes.status, 400, 'Expected 400 when sole OWNER attempts to leave');
  });

  it('test_viewer_all_mutations_blocked_403', async () => {
    // Edge Case 18: VIEWER attempting any mutation receives 403 Forbidden
    const createPoiRes = await viewerClient.createPoi(tripId, { title: 'Illegal POI', lat: 0, lng: 0 });
    assert.equal(createPoiRes.status, 403);

    // Create a POI via owner first to test update/delete/vote
    const validPoi = await ownerClient.createPoi(tripId, { title: 'Target Spot', lat: 10, lng: 10 });
    const poiId = validPoi.data.poi.id;

    const updatePoiRes = await viewerClient.updatePoi(tripId, poiId, { title: 'Hacked POI' });
    assert.equal(updatePoiRes.status, 403);

    const deletePoiRes = await viewerClient.deletePoi(tripId, poiId);
    assert.equal(deletePoiRes.status, 403);

    const voteRes = await viewerClient.votePoi(tripId, poiId);
    assert.equal(voteRes.status, 403);

    const commentRes = await viewerClient.createComment(tripId, poiId, 'Hacked Comment');
    assert.equal(commentRes.status, 403);

    const checkRes = await viewerClient.createChecklist(tripId, { title: 'Hacked Item' });
    assert.equal(checkRes.status, 403);
  });
});
