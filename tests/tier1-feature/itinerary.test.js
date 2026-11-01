// tests/tier1-feature/itinerary.test.js
// Tier 1: Itinerary Scheduling, Routing & Social Tools Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R4, docs/FEATURES.md §6-§9, survey_specs.md §4.4-§4.6 & §7

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { calculateDayWorkload } = require('../harness/geo-utils.js');

describe('Tier 1: Itinerary Scheduling, Routing & Social Tools Feature Coverage', () => {
  let env;
  let client;
  let tripId;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('itinerary_pro');

    const tripRes = await client.createTrip({
      title: 'Nordic Explorer',
      currency: '€',
    });
    tripId = tripRes.data.trip.id;
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_create_poi_with_rich_fields', async () => {
    // R4.1: Comprehensive POI fields
    const poiRes = await client.createPoi(tripId, {
      title: 'Gamla Stan Historic Walk',
      category: 'SIGHTSEEING',
      status: 'PLANNED',
      isMustSee: true,
      lat: 59.325,
      lng: 18.07,
      address: 'Gamla Stan, Stockholm',
      dayStart: 1,
      orderIndex: 1,
      timeSlot: '10:00 - 12:00',
      durationMinutes: 120,
      transportMode: 'WALKING',
      estimatedCost: 25,
      costType: 'PER_PERSON',
      bookingReference: 'TKT-8841',
      notes: 'Cobblestone streets, wear comfortable shoes.',
    });

    assert.equal(poiRes.status, 201);
    const poi = poiRes.data.poi;
    assert.equal(poi.title, 'Gamla Stan Historic Walk');
    assert.equal(poi.category, 'SIGHTSEEING');
    assert.equal(poi.status, 'PLANNED');
    assert.equal(poi.isMustSee, true);
    assert.equal(poi.lat, 59.325);
    assert.equal(poi.lng, 18.07);
  });

  it('test_multi_day_accommodation_pinning', async () => {
    // R4.2: Accommodations spanning days 1..3 pin to each day
    const hotelRes = await client.createPoi(tripId, {
      title: 'Grand Hotel Stockholm',
      category: 'ACCOMMODATION',
      status: 'BOOKED',
      lat: 59.33,
      lng: 18.075,
      dayStart: 1,
      dayEnd: 3,
      orderIndex: 0,
      estimatedCost: 600,
    });
    assert.equal(hotelRes.status, 201);

    const tripData = await client.getTrip(tripId);
    const hotel = tripData.data.trip.pois.find((p) => p.title === 'Grand Hotel Stockholm');
    assert.ok(hotel);
    assert.equal(hotel.category, 'ACCOMMODATION');
    assert.equal(hotel.dayStart, 1);
    assert.equal(hotel.dayEnd, 3);
  });

  it('test_within_day_stop_reordering', async () => {
    // R4.7: Reorder stops within a day via batch update
    const p1 = await client.createPoi(tripId, { title: 'Stop A', lat: 59.331, lng: 18.07, dayStart: 2, orderIndex: 0 });
    const p2 = await client.createPoi(tripId, { title: 'Stop B', lat: 59.332, lng: 18.071, dayStart: 2, orderIndex: 1 });

    const reorderRes = await client.reorderPois(tripId, [
      { id: p2.data.poi.id, orderIndex: 0, dayStart: 2 },
      { id: p1.data.poi.id, orderIndex: 1, dayStart: 2 },
    ]);
    assert.equal(reorderRes.status, 200);

    const trip = await client.getTrip(tripId);
    const stopA = trip.data.trip.pois.find((p) => p.id === p1.data.poi.id);
    const stopB = trip.data.trip.pois.find((p) => p.id === p2.data.poi.id);
    assert.equal(stopB.orderIndex, 0);
    assert.equal(stopA.orderIndex, 1);
  });

  it('test_nearest_neighbor_tsp_route_optimization', async () => {
    // R4.8: 1-click route optimization re-sequences day stops
    const optRes = await client.optimizeDay(tripId, 2);
    assert.equal(optRes.status, 200);
    assert.ok(Array.isArray(optRes.data.pois));
    assert.ok(optRes.data.pois.length >= 2);
    assert.equal(optRes.data.pois[0].orderIndex, 0);
    assert.equal(optRes.data.pois[1].orderIndex, 1);
  });

  it('test_daily_workload_and_pace_alert', () => {
    // R4.9: Workload summary flags alert when schedule > 10 hours (600 minutes)
    const normalPois = [
      { durationMinutes: 120 },
      { durationMinutes: 180 },
    ];
    const normalLegs = [{ durationMinutes: 30, distanceKm: 25 }];
    const normalWorkload = calculateDayWorkload(normalPois, normalLegs);
    assert.equal(normalWorkload.isOverloaded, false);

    // Overloaded schedule (700 minutes total)
    const heavyPois = [
      { durationMinutes: 360 },
      { durationMinutes: 240 },
    ];
    const heavyLegs = [{ durationMinutes: 120, distanceKm: 110 }];
    const heavyWorkload = calculateDayWorkload(heavyPois, heavyLegs);
    assert.equal(heavyWorkload.isOverloaded, true, 'Expected isOverloaded=true when duration > 600 min');
  });

  it('test_poi_upvoting_and_voter_roster', async () => {
    // R4.10: Toggle upvote increments count and provides voter roster
    const poiRes = await client.createPoi(tripId, { title: 'Vasa Museum', lat: 59.328, lng: 18.091 });
    const poiId = poiRes.data.poi.id;

    // First vote toggles ON
    const vote1 = await client.votePoi(tripId, poiId);
    assert.equal(vote1.status, 200);
    assert.equal(vote1.data.voted, true);
    assert.equal(vote1.data.voteCount, 1);
    assert.ok(vote1.data.voters.includes('itinerary_pro'));

    // Second vote toggles OFF
    const vote2 = await client.votePoi(tripId, poiId);
    assert.equal(vote2.status, 200);
    assert.equal(vote2.data.voted, false);
    assert.equal(vote2.data.voteCount, 0);
  });

  it('test_poi_comment_thread_lifecycle', async () => {
    // R4.11: Chronological discussion thread per POI and comment deletion
    const poiRes = await client.createPoi(tripId, { title: 'Skansen Open-Air', lat: 59.325, lng: 18.1 });
    const poiId = poiRes.data.poi.id;

    const commentRes = await client.createComment(tripId, poiId, 'Buy tickets online to skip line!');
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.data.comment.id;
    assert.equal(commentRes.data.comment.content, 'Buy tickets online to skip line!');

    // Delete comment
    const delRes = await client.deleteComment(tripId, poiId, commentId);
    assert.equal(delRes.status, 200);
  });

  it('test_collaborative_checklists_crud', async () => {
    // R4.13: Collaborative Checklists across BEFORE_TRIP, PACKING, DOCUMENTS
    const itemRes = await client.createChecklist(tripId, {
      title: 'Rain jacket & hiking boots',
      category: 'PACKING',
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.item.id;
    assert.equal(itemRes.data.item.isCompleted, false);

    // Toggle complete
    const toggleRes = await client.updateChecklist(tripId, itemId, { isCompleted: true });
    assert.equal(toggleRes.status, 200);

    // Verify persistence
    const tripData = await client.getTrip(tripId);
    const item = tripData.data.trip.checklistItems.find((c) => c.id === itemId);
    assert.ok(item);
    assert.equal(item.isCompleted, true);

    // Delete item
    const delRes = await client.deleteChecklist(tripId, itemId);
    assert.equal(delRes.status, 200);
  });
});
