// tests/tier3-combination/cross-feature.test.js
// Tier 3: Cross-Feature Combinations (Pairwise Coverage) Tests
// Authoritative source: ORIGINAL_REQUEST.md, docs/FEATURES.md, PROJECT.md Interface Contracts

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { haversineDistance } = require('../harness/geo-utils.js');

describe('Tier 3: Cross-Feature Combinations (Pairwise Coverage)', () => {
  let env;
  let owner;
  let editor;
  let viewer;

  before(async () => {
    env = await setupTestEnv();
    owner = env.client;
    await owner.login('combo_owner');

    editor = owner.fork();
    await editor.login('combo_editor');

    viewer = owner.fork();
    await viewer.login('combo_viewer');
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_cross_rbac_and_poi_lifecycle', async () => {
    // Pairwise 1: RBAC + POI modifications
    const tripRes = await owner.createTrip({ title: 'RBAC POI Combo Trip' });
    const tripId = tripRes.data.trip.id;
    const inviteCode = tripRes.data.trip.inviteCode;

    // Join editor and viewer
    await editor.joinTrip(inviteCode);
    await viewer.joinTrip(inviteCode);
    const viewerMe = await viewer.getMe();
    await owner.updateMemberRole(tripId, viewerMe.data.user.id, 'VIEWER');

    // 1. Editor adds POI
    const poiRes = await editor.createPoi(tripId, {
      title: 'Editor Cafe',
      category: 'FOOD',
      status: 'IDEA',
      lat: 48.853,
      lng: 2.348,
    });
    assert.equal(poiRes.status, 201);
    const poiId = poiRes.data.poi.id;

    // 2. Viewer attempts to modify POI -> 403
    const viewerMod = await viewer.updatePoi(tripId, poiId, { title: 'Hacked Cafe' });
    assert.equal(viewerMod.status, 403);

    // 3. Owner updates POI status to BOOKED
    const ownerMod = await owner.updatePoi(tripId, poiId, { status: 'BOOKED', estimatedCost: 45 });
    assert.equal(ownerMod.status, 200);

    // 4. Editor upvotes POI
    const voteRes = await editor.votePoi(tripId, poiId);
    assert.equal(voteRes.status, 200);
    assert.equal(voteRes.data.voteCount, 1);

    // 5. Verify final state
    const tripData = await viewer.getTrip(tripId);
    const finalPoi = tripData.data.trip.pois.find((p) => p.id === poiId);
    assert.equal(finalPoi.title, 'Editor Cafe');
    assert.equal(finalPoi.status, 'BOOKED');
    assert.equal(finalPoi.voteCount, 1);
  });

  it('test_cross_hotel_pinning_and_route_tsp_optimization', async () => {
    // Pairwise 2: Multi-day accommodation pinning + Nearest-Neighbor TSP optimization
    const tripRes = await owner.createTrip({ title: 'Hotel + TSP Combo Trip' });
    const tripId = tripRes.data.trip.id;

    // Add hotel spanning days 1..3
    const hotelRes = await owner.createPoi(tripId, {
      title: 'Central Basecamp Hotel',
      category: 'ACCOMMODATION',
      lat: 48.8566, // Paris center (Hotel de Ville)
      lng: 2.3522,
      dayStart: 1,
      dayEnd: 3,
      orderIndex: 0,
    });
    assert.equal(hotelRes.status, 201);

    // Add 3 sightseeing POIs for Day 2 in random order
    // Spot 1: Louvre (near hotel, ~1.5 km)
    const p1 = await owner.createPoi(tripId, {
      title: 'Louvre',
      lat: 48.8606,
      lng: 2.3376,
      dayStart: 2,
      orderIndex: 2,
    });
    // Spot 2: Eiffel Tower (further, ~4.5 km)
    const p2 = await owner.createPoi(tripId, {
      title: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
      dayStart: 2,
      orderIndex: 0,
    });
    // Spot 3: Arc de Triomphe (between Louvre and Eiffel)
    const p3 = await owner.createPoi(tripId, {
      title: 'Arc de Triomphe',
      lat: 48.8738,
      lng: 2.295,
      dayStart: 2,
      orderIndex: 1,
    });

    // Run TSP optimization on Day 2
    const optRes = await owner.optimizeDay(tripId, 2);
    assert.equal(optRes.status, 200);

    const orderedStops = optRes.data.pois;
    // Hotel MUST be Stop #0
    assert.equal(orderedStops[0].category, 'ACCOMMODATION');
    assert.equal(orderedStops[0].title, 'Central Basecamp Hotel');
    assert.equal(orderedStops[0].orderIndex, 0);

    // Stop #1 should be the closest unvisited stop to Hotel (Louvre)
    assert.equal(orderedStops[1].title, 'Louvre');
    assert.equal(orderedStops[1].orderIndex, 1);
  });

  it('test_cross_json_export_and_reimport_integrity', async () => {
    // Pairwise 3: JSON Export + Re-import integrity
    const tripRes = await owner.createTrip({
      title: 'Golden Circle Expedition',
      description: 'Geysers and tectonic rifts',
      startDate: '2026-06-15',
      endDate: '2026-06-20',
      currency: '€',
      scratchpad: 'Flight #FI521; 4x4 rental confirmation #BLUE-991',
    });
    const tripId = tripRes.data.trip.id;

    // Add rich POI
    const poiRes = await owner.createPoi(tripId, {
      title: 'Gullfoss Waterfall',
      category: 'NATURE',
      status: 'BOOKED',
      isMustSee: true,
      lat: 64.3271,
      lng: -20.1199,
      dayStart: 1,
      durationMinutes: 90,
      estimatedCost: 0,
      notes: 'Spectacular double cascade',
    });
    const poiId = poiRes.data.poi.id;

    await owner.votePoi(tripId, poiId);
    await owner.createComment(tripId, poiId, 'Stunning rainbow on sunny days!');
    await owner.createChecklist(tripId, { title: 'Thermal layers', category: 'PACKING' });

    // Export JSON
    const exportRes = await owner.exportJson(tripId);
    assert.equal(exportRes.status, 200);
    const backupData = exportRes.data;

    // Re-import under fresh user
    const freshClient = owner.fork();
    await freshClient.login('independent_traveler');
    const importRes = await freshClient.importJson(backupData);
    assert.equal(importRes.status, 201);
    const importedTripId = importRes.data.tripId;

    // Verify imported trip matches original data exactly
    const imported = await freshClient.getTrip(importedTripId);
    const t = imported.data.trip;
    assert.equal(t.title, 'Golden Circle Expedition');
    assert.equal(t.scratchpad, 'Flight #FI521; 4x4 rental confirmation #BLUE-991');
    assert.equal(t.pois.length, 1);
    assert.equal(t.pois[0].title, 'Gullfoss Waterfall');
    assert.equal(t.pois[0].isMustSee, true);
    assert.equal(t.checklistItems.length, 1);
    assert.equal(t.checklistItems[0].title, 'Thermal layers');
    assert.equal(t.currentUserRole, 'OWNER');
  });

  it('test_cross_duplicate_trip_and_booking_vote_reset', async () => {
    // Pairwise 4: Duplicate Trip + Booking status and vote reset
    const tripRes = await owner.createTrip({ title: 'Original Tour' });
    const tripId = tripRes.data.trip.id;

    const poiRes = await owner.createPoi(tripId, {
      title: 'Booked Flight to Berlin',
      category: 'TRANSPORT',
      status: 'BOOKED',
      lat: 52.3667,
      lng: 13.5033,
    });
    const poiId = poiRes.data.poi.id;
    await owner.votePoi(tripId, poiId);

    // Duplicate trip
    const dupRes = await owner.duplicateTrip(tripId, { title: 'Berlin Tour 2027 Template' });
    assert.equal(dupRes.status, 201);
    const clonedTripId = dupRes.data.trip.id;

    const clonedTrip = await owner.getTrip(clonedTripId);
    assert.equal(clonedTrip.data.trip.title, 'Berlin Tour 2027 Template');
    const clonedPoi = clonedTrip.data.trip.pois[0];
    assert.equal(clonedPoi.status, 'PLANNED', 'Cloned trip POI status must be reset from BOOKED to PLANNED');
    assert.equal(clonedPoi.voteCount, 0, 'Cloned trip POI votes must be empty');
  });

  it('test_cross_ideas_pool_upvoting_and_day_assignment', async () => {
    // Pairwise 5: Ideas pool voting + Day scheduling
    const tripRes = await owner.createTrip({ title: 'Ideas Scheduling Trip' });
    const tripId = tripRes.data.trip.id;
    await editor.joinTrip(tripRes.data.trip.inviteCode);

    // Add 2 ideas (dayStart = null)
    const idea1 = await owner.createPoi(tripId, {
      title: 'Hidden Jazz Bar',
      category: 'NIGHTLIFE',
      lat: 52.5,
      lng: 13.4,
      dayStart: null,
    });
    const idea2 = await owner.createPoi(tripId, {
      title: 'Classic Museum',
      category: 'SIGHTSEEING',
      lat: 52.51,
      lng: 13.41,
      dayStart: null,
    });

    // Both owner and editor vote on idea 1 (Jazz Bar -> 2 votes)
    await owner.votePoi(tripId, idea1.data.poi.id);
    await editor.votePoi(tripId, idea1.data.poi.id);

    // Only owner votes on idea 2 (Museum -> 1 vote)
    await owner.votePoi(tripId, idea2.data.poi.id);

    // Verify vote ranking
    const tripState = await owner.getTrip(tripId);
    const jazz = tripState.data.trip.pois.find((p) => p.id === idea1.data.poi.id);
    const museum = tripState.data.trip.pois.find((p) => p.id === idea2.data.poi.id);
    assert.equal(jazz.voteCount, 2);
    assert.equal(museum.voteCount, 1);

    // Schedule popular idea to Day 1
    const scheduleRes = await owner.updatePoi(tripId, jazz.id, {
      dayStart: 1,
      orderIndex: 0,
      timeSlot: '21:00 - 23:30',
    });
    assert.equal(scheduleRes.status, 200);

    const updatedTrip = await owner.getTrip(tripId);
    const scheduledJazz = updatedTrip.data.trip.pois.find((p) => p.id === jazz.id);
    assert.equal(scheduledJazz.dayStart, 1);
  });

  it('test_cross_checklist_assignment_and_role_security', async () => {
    // Pairwise 6: Checklists + Member Assignment + Role security
    const tripRes = await owner.createTrip({ title: 'Checklist Security Trip' });
    const tripId = tripRes.data.trip.id;

    await editor.joinTrip(tripRes.data.trip.inviteCode);
    const editorMe = await editor.getMe();
    const editorId = editorMe.data.user.id;

    // Owner creates item assigned to editor
    const itemRes = await owner.createChecklist(tripId, {
      title: 'Renew Visa & Travel Insurance',
      category: 'DOCUMENTS',
      assignedToUserId: editorId,
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.item.id;

    // Editor marks item completed
    const completeRes = await editor.updateChecklist(tripId, itemId, { isCompleted: true });
    assert.equal(completeRes.status, 200);

    const tripData = await owner.getTrip(tripId);
    const item = tripData.data.trip.checklistItems.find((c) => c.id === itemId);
    assert.equal(item.isCompleted, true);
    assert.equal(item.assignedToUserId, editorId);
  });
});
