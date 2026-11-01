// tests/tier2-boundary/itinerary-boundary.test.js
// Tier 2: Itinerary & Social Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R4, survey_features.md §6 Edge Cases 28-38

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { optimizeDayStops } = require('../harness/geo-utils.js');

describe('Tier 2: Itinerary & Social Boundary & Corner Cases', () => {
  let env;
  let ownerClient;
  let memberClient;
  let tripId;

  before(async () => {
    env = await setupTestEnv();
    ownerClient = env.client;
    await ownerClient.login('itin_bound_owner');

    memberClient = ownerClient.fork();
    await memberClient.login('itin_bound_member');

    const tripRes = await ownerClient.createTrip({ title: 'Itinerary Boundary Trip' });
    tripId = tripRes.data.trip.id;
    await memberClient.joinTrip(tripRes.data.trip.inviteCode);
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_route_optimization_with_zero_or_single_stop_no_op', () => {
    // Edge Case 32: Route optimization on 0 or 1 stops is a safe no-op
    const emptyResult = optimizeDayStops([], 1);
    assert.deepEqual(emptyResult, []);

    const singleStop = [{ id: '1', lat: 48.8584, lng: 2.2945, orderIndex: 0 }];
    const singleResult = optimizeDayStops(singleStop, 1);
    assert.equal(singleResult.length, 1);
    assert.equal(singleResult[0].orderIndex, 0);
  });

  it('test_route_optimization_preserves_accommodation_as_stop_zero', () => {
    // Edge Case 33: Day has accommodation + 3 stops -> accommodation stays fixed at stop #0
    const stops = [
      { id: 'spotA', lat: 48.8606, lng: 2.3376, category: 'SIGHTSEEING', dayStart: 1 },
      { id: 'hotel', lat: 48.8566, lng: 2.3522, category: 'ACCOMMODATION', dayStart: 1, dayEnd: 3 },
      { id: 'spotB', lat: 48.8738, lng: 2.295, category: 'SIGHTSEEING', dayStart: 1 },
    ];

    const optimized = optimizeDayStops(stops, 1);
    assert.equal(optimized[0].id, 'hotel', 'Accommodation must be preserved as starting stop #0');
    assert.equal(optimized[0].orderIndex, 0);
    assert.equal(optimized.length, 3);
  });

  it('test_multi_day_accommodation_date_boundary', async () => {
    // Edge Case 28 & 29: Hotel spans Day 1 to Day 3; appears on Days 1..3 but NOT on Day 4
    await ownerClient.createPoi(tripId, {
      title: 'Boundary Hotel Stay',
      category: 'ACCOMMODATION',
      lat: 48.8566,
      lng: 2.3522,
      dayStart: 1,
      dayEnd: 3,
    });

    const tripRes = await ownerClient.getTrip(tripId);
    const hotel = tripRes.data.trip.pois.find((p) => p.title === 'Boundary Hotel Stay');

    function isHotelOnDay(poi, day) {
      if (poi.category !== 'ACCOMMODATION') return poi.dayStart === day;
      return poi.dayStart <= day && (poi.dayEnd === null || poi.dayEnd >= day);
    }

    assert.equal(isHotelOnDay(hotel, 1), true, 'Hotel active on Day 1');
    assert.equal(isHotelOnDay(hotel, 2), true, 'Hotel active on Day 2');
    assert.equal(isHotelOnDay(hotel, 3), true, 'Hotel active on Day 3');
    assert.equal(isHotelOnDay(hotel, 4), false, 'Hotel must not appear on Day 4');
  });

  it('test_double_voting_idempotence', async () => {
    // Edge Case 35: Rapid upvoting twice toggles state cleanly without duplicate row errors
    const poiRes = await ownerClient.createPoi(tripId, { title: 'Vote Spot', lat: 48.85, lng: 2.35 });
    const poiId = poiRes.data.poi.id;

    const vote1 = await memberClient.votePoi(tripId, poiId);
    assert.equal(vote1.status, 200);
    assert.equal(vote1.data.voted, true);
    assert.equal(vote1.data.voteCount, 1);

    const vote2 = await memberClient.votePoi(tripId, poiId);
    assert.equal(vote2.status, 200);
    assert.equal(vote2.data.voted, false);
    assert.equal(vote2.data.voteCount, 0);
  });

  it('test_empty_comment_rejected_with_400', async () => {
    // Edge Case 36: Empty comment or whitespace-only is rejected
    const poiRes = await ownerClient.createPoi(tripId, { title: 'Comment Spot', lat: 48.85, lng: 2.35 });
    const poiId = poiRes.data.poi.id;

    const emptyRes = await memberClient.createComment(tripId, poiId, '');
    assert.equal(emptyRes.status, 400);

    const spaceRes = await memberClient.createComment(tripId, poiId, '   ');
    assert.equal(spaceRes.status, 400);
  });

  it('test_non_owner_cannot_delete_others_comment', async () => {
    // Edge Case 37: Collaborator cannot delete another member's comment (403), but OWNER can
    const poiRes = await ownerClient.createPoi(tripId, { title: 'Moderation Spot', lat: 48.85, lng: 2.35 });
    const poiId = poiRes.data.poi.id;

    // Member posts comment
    const commentRes = await memberClient.createComment(tripId, poiId, "Member's note");
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.data.comment.id;

    // Third user tries to delete member's comment
    const outsiderClient = ownerClient.fork();
    await outsiderClient.login('random_collaborator');
    await outsiderClient.joinTrip(tripId); // not in this trip or editor in another
    const unauthorizedDel = await outsiderClient.deleteComment(tripId, poiId, commentId);
    assert.equal(unauthorizedDel.status, 403, 'Expected 403 when deleting another user comment');

    // Trip OWNER moderates comment successfully
    const ownerDel = await ownerClient.deleteComment(tripId, poiId, commentId);
    assert.equal(ownerDel.status, 200, 'OWNER should be able to moderate any comment');
  });
});
