// tests/tier1-feature/rbac.test.js
// Tier 1: RBAC & Collaboration Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R2, docs/FEATURES.md §3, survey_specs.md §4.3

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 1: RBAC & Collaboration Feature Coverage', () => {
  let env;
  let ownerClient;
  let editorClient;
  let viewerClient;
  let tripId;
  let inviteCode;

  before(async () => {
    env = await setupTestEnv();
    ownerClient = env.client;
    await ownerClient.login('alice_owner');

    editorClient = ownerClient.fork();
    await editorClient.login('bob_editor');

    viewerClient = ownerClient.fork();
    await viewerClient.login('charlie_viewer');

    // Create base trip
    const tripRes = await ownerClient.createTrip({ title: 'RBAC Showcase Expedition' });
    tripId = tripRes.data.trip.id;
    inviteCode = tripRes.data.trip.inviteCode;
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_join_trip_via_invite_code_as_editor', async () => {
    // R2.1: Navigating to /join/[inviteCode] auto-enrolls authenticated user as EDITOR
    const joinRes = await editorClient.joinTrip(inviteCode);
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.data.tripId, tripId);
    assert.equal(joinRes.data.role, 'EDITOR');

    // Check membership on trip
    const tripRes = await editorClient.getTrip(tripId);
    assert.equal(tripRes.status, 200);
    assert.equal(tripRes.data.trip.currentUserRole, 'EDITOR');
  });

  it('test_regenerate_invite_code_invalidates_previous_code', async () => {
    // R2.4: OWNER can regenerate invite code, immediately invalidating old code
    const regenRes = await ownerClient.regenerateInviteCode(tripId);
    assert.equal(regenRes.status, 200);
    const newCode = regenRes.data.inviteCode;
    assert.notEqual(newCode, inviteCode, 'New invite code must differ from previous code');

    // Attempting to join with old code returns 404
    const freshClient = ownerClient.fork();
    await freshClient.login('late_joiner');
    const oldJoinRes = await freshClient.joinTrip(inviteCode);
    assert.equal(oldJoinRes.status, 404, 'Expected 404 when using invalidated invite code');

    // Joining with new code succeeds
    const newJoinRes = await freshClient.joinTrip(newCode);
    assert.equal(newJoinRes.status, 200);
    assert.equal(newJoinRes.data.role, 'EDITOR');
  });

  it('test_owner_can_manage_roles', async () => {
    // R2.5: OWNER can change roles of members (e.g. demote EDITOR to VIEWER)
    // Enroll viewerClient first
    const tripRes = await ownerClient.getTrip(tripId);
    const activeCode = tripRes.data.trip.inviteCode;
    await viewerClient.joinTrip(activeCode);

    const viewerMe = await viewerClient.getMe();
    const viewerUserId = viewerMe.data.user.id;

    // OWNER demotes Charlie to VIEWER
    const demoteRes = await ownerClient.updateMemberRole(tripId, viewerUserId, 'VIEWER');
    assert.equal(demoteRes.status, 200);

    const getRes = await viewerClient.getTrip(tripId);
    assert.equal(getRes.data.trip.currentUserRole, 'VIEWER');
  });

  it('test_editor_permissions_content_management', async () => {
    // R2.7: EDITOR can add, edit, reorder POIs and checklists
    const poiRes = await editorClient.createPoi(tripId, {
      title: 'Editor Spot',
      lat: 45.4642,
      lng: 9.19,
    });
    assert.equal(poiRes.status, 201);
    const poiId = poiRes.data.poi.id;

    const checkRes = await editorClient.createChecklist(tripId, {
      title: 'Passport validity',
      category: 'DOCUMENTS',
    });
    assert.equal(checkRes.status, 201);

    // But EDITOR cannot delete the trip
    const delTripRes = await editorClient.deleteTrip(tripId);
    assert.equal(delTripRes.status, 403, 'Expected 403 when EDITOR attempts to delete trip');
  });

  it('test_viewer_role_strict_read_only_enforcement', async () => {
    // R2.6: VIEWER can view trip but cannot mutate POIs, votes, comments, or checklists (403 Forbidden)
    const tripRes = await viewerClient.getTrip(tripId);
    assert.equal(tripRes.status, 200, 'VIEWER can view trip');

    // Attempt to add POI -> 403
    const poiRes = await viewerClient.createPoi(tripId, {
      title: 'Viewer POI attempt',
      lat: 40.7128,
      lng: -74.006,
    });
    assert.equal(poiRes.status, 403, 'Expected 403 on POI creation by VIEWER');

    // Attempt to add checklist -> 403
    const checkRes = await viewerClient.createChecklist(tripId, {
      title: 'Viewer item',
      category: 'PACKING',
    });
    assert.equal(checkRes.status, 403, 'Expected 403 on checklist creation by VIEWER');
  });

  it('test_voluntary_member_departure', async () => {
    // Non-owner member can leave the trip voluntarily
    const departingClient = ownerClient.fork();
    await departingClient.login('leaver_user');
    const tripRes = await ownerClient.getTrip(tripId);
    await departingClient.joinTrip(tripRes.data.trip.inviteCode);

    const meRes = await departingClient.getMe();
    const userId = meRes.data.user.id;

    // Leave trip
    const leaveRes = await departingClient.removeMember(tripId, userId);
    assert.equal(leaveRes.status, 200);

    // Querying trip now gives 403
    const checkRes = await departingClient.getTrip(tripId);
    assert.equal(checkRes.status, 403);
  });
});
