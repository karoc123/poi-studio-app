// tests/tier2-boundary/trips-boundary.test.js
// Tier 2: Trip Lifecycle Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R1, survey_features.md §6 Edge Cases 8-13

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 2: Trip Lifecycle Boundary & Corner Cases', () => {
  let env;
  let ownerClient;
  let editorClient;

  before(async () => {
    env = await setupTestEnv();
    ownerClient = env.client;
    await ownerClient.login('trip_boundary_owner');

    editorClient = ownerClient.fork();
    await editorClient.login('trip_boundary_editor');
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_missing_title_rejected_with_400', async () => {
    // Edge Case: Missing or whitespace title returns 400 Bad Request
    const noTitleRes = await ownerClient.createTrip({});
    assert.equal(noTitleRes.status, 400);

    const emptyTitleRes = await ownerClient.createTrip({ title: '' });
    assert.equal(emptyTitleRes.status, 400);

    const spaceTitleRes = await ownerClient.createTrip({ title: '   ' });
    assert.equal(spaceTitleRes.status, 400);
  });

  it('test_flexible_undated_trip_allowed', async () => {
    // Edge Case 9: Undated trips (startDate: null, endDate: null) allowed without error
    const tripRes = await ownerClient.createTrip({
      title: 'Someday in Patagonia',
      startDate: null,
      endDate: null,
    });
    assert.equal(tripRes.status, 201);
    assert.equal(tripRes.data.trip.startDate, null);
    assert.equal(tripRes.data.trip.endDate, null);
  });

  it('test_non_owner_cannot_edit_trip_settings', async () => {
    // Edge Case 11: EDITOR attempting to edit trip metadata -> 403 Forbidden
    const tripRes = await ownerClient.createTrip({ title: 'Protected Trip' });
    const tripId = tripRes.data.trip.id;
    await editorClient.joinTrip(tripRes.data.trip.inviteCode);

    const editRes = await editorClient.updateTrip(tripId, {
      title: 'Hijacked Title',
    });
    assert.equal(editRes.status, 403, 'Expected 403 when EDITOR edits metadata');

    // Scratchpad edit by EDITOR is allowed
    const scratchRes = await editorClient.updateTrip(tripId, {
      scratchpad: 'Editor notes are permitted',
    });
    assert.equal(scratchRes.status, 200);
  });

  it('test_non_owner_cannot_delete_trip', async () => {
    // Edge Case 11: Non-owner DELETE /api/trips/[id] returns 403 Forbidden
    const tripRes = await ownerClient.createTrip({ title: 'Indelible Trip' });
    const tripId = tripRes.data.trip.id;
    await editorClient.joinTrip(tripRes.data.trip.inviteCode);

    const delRes = await editorClient.deleteTrip(tripId);
    assert.equal(delRes.status, 403, 'Expected 403 when non-owner attempts deletion');

    // Confirm trip still exists
    const getRes = await ownerClient.getTrip(tripId);
    assert.equal(getRes.status, 200);
  });

  it('test_deletion_cascades_deep_children', async () => {
    // Edge Case 12: OWNER deletes trip with POIs, comments, votes, checklists -> full cascade
    const tripRes = await ownerClient.createTrip({ title: 'Deep Cascade Trip' });
    const tripId = tripRes.data.trip.id;

    const poiRes = await ownerClient.createPoi(tripId, { title: 'Cascade Spot', lat: 10, lng: 10 });
    const poiId = poiRes.data.poi.id;
    await ownerClient.votePoi(tripId, poiId);
    await ownerClient.createComment(tripId, poiId, 'Cascading comment');
    await ownerClient.createChecklist(tripId, { title: 'Cascading task' });

    // Delete trip
    const delRes = await ownerClient.deleteTrip(tripId);
    assert.equal(delRes.status, 200);

    // Verify trip is gone
    const checkRes = await ownerClient.getTrip(tripId);
    assert.equal(checkRes.status, 403, 'Expected deleted trip to be inaccessible');
  });
});
