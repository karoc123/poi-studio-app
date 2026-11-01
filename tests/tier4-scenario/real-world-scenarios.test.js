// tests/tier4-scenario/real-world-scenarios.test.js
// Tier 4: Real-World Application Scenarios Tests
// Authoritative source: ORIGINAL_REQUEST.md, docs/FEATURES.md §4 (Workflows 1-5), survey_features.md §4

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { parseMapUrlOrCoordinates, haversineDistance } = require('../harness/geo-utils.js');

describe('Tier 4: Real-World Application Scenarios', () => {
  let env;

  before(async () => {
    env = await setupTestEnv();
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('scenario_complete_trip_planning_lifecycle', async () => {
    // Scenario 1: Complete end-to-end trip planning workflow from auth to optimization
    const alice = env.client.fork();

    // 1. Frictionless auto-registration
    const regRes = await alice.login('alice_adventurer');
    assert.equal(regRes.status, 200);

    // 2. Avatar customization
    await alice.updateProfile({ avatarColor: '#3B82F6' });

    // 3. Trip Creation
    const tripRes = await alice.createTrip({
      title: 'Scottish Highlands Roadtrip 2026',
      description: 'Lochs, castles, and scenic glens',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      currency: '£',
    });
    assert.equal(tripRes.status, 201);
    const tripId = tripRes.data.trip.id;

    // 4. Pin accommodation via Google Maps URL extraction
    const hotelGmapsUrl = 'https://www.google.com/maps/place/Inverness+Palace+Hotel/@57.4764,-4.2285,16z';
    const parsedHotel = parseMapUrlOrCoordinates(hotelGmapsUrl);
    assert.ok(parsedHotel);

    const hotelPoi = await alice.createPoi(tripId, {
      title: parsedHotel.title || 'Inverness Palace Hotel',
      category: 'ACCOMMODATION',
      status: 'BOOKED',
      lat: parsedHotel.lat,
      lng: parsedHotel.lng,
      dayStart: 1,
      dayEnd: 3,
      estimatedCost: 380,
      costType: 'TOTAL',
      bookingReference: 'INV-77491',
    });
    assert.equal(hotelPoi.status, 201);

    // 5. Add day stops
    const spots = [
      { title: 'Loch Ness Urquhart Castle', lat: 57.3241, lng: -4.4423, day: 2, cost: 30 },
      { title: 'Eilean Donan Castle', lat: 57.274, lng: -5.5161, day: 2, cost: 25 },
      { title: 'Glenfinnan Viaduct', lat: 56.8763, lng: -5.4318, day: 2, cost: 0 },
    ];

    for (let i = 0; i < spots.length; i++) {
      await alice.createPoi(tripId, {
        title: spots[i].title,
        category: 'SIGHTSEEING',
        status: 'PLANNED',
        lat: spots[i].lat,
        lng: spots[i].lng,
        dayStart: spots[i].day,
        orderIndex: i + 1,
        estimatedCost: spots[i].cost,
      });
    }

    // 6. Run Nearest-Neighbor TSP optimization on Day 2
    const optRes = await alice.optimizeDay(tripId, 2);
    assert.equal(optRes.status, 200);
    // Accommodation must remain as origin (stop #0)
    assert.equal(optRes.data.pois[0].category, 'ACCOMMODATION');

    // 7. Add collaborative checklists
    await alice.createChecklist(tripId, { title: 'Midges repellent', category: 'PACKING' });
    await alice.createChecklist(tripId, { title: 'UK driving license', category: 'DOCUMENTS' });

    // 8. Shared scratchpad notes
    await alice.updateTrip(tripId, {
      scratchpad: 'Enterprise Car Rental confirmation #SC-8921. Ferry booking for Skye on Day 3 at 14:00.',
    });

    // 9. Verify trip summary
    const tripState = await alice.getTrip(tripId);
    assert.equal(tripState.data.trip.title, 'Scottish Highlands Roadtrip 2026');
    assert.equal(tripState.data.trip.pois.length, 4);
    assert.equal(tripState.data.trip.checklistItems.length, 2);
    assert.ok(tripState.data.trip.scratchpad.includes('Enterprise Car Rental'));
  });

  it('scenario_multi_member_collaboration_and_governance', async () => {
    // Scenario 2: Multi-member collaboration, invite links, role management & moderation
    const alice = env.client.fork();
    await alice.login('alice_leader');

    const bob = env.client.fork();
    await bob.login('bob_collaborator');

    const charlie = env.client.fork();
    await charlie.login('charlie_guest');

    // 1. Alice creates trip
    const tripRes = await alice.createTrip({ title: 'Swiss Alps Trail' });
    const tripId = tripRes.data.trip.id;
    const inviteCode = tripRes.data.trip.inviteCode;

    // 2. Bob joins via invite link -> becomes EDITOR
    const bobJoin = await bob.joinTrip(inviteCode);
    assert.equal(bobJoin.status, 200);
    assert.equal(bobJoin.data.role, 'EDITOR');

    // 3. Charlie joins via invite link -> becomes EDITOR
    const charlieJoin = await charlie.joinTrip(inviteCode);
    assert.equal(charlieJoin.status, 200);
    assert.equal(charlieJoin.data.role, 'EDITOR');

    // 4. Bob adds mountain hut POI
    const hutRes = await bob.createPoi(tripId, {
      title: 'Zermatt Alpine Hut',
      category: 'ACCOMMODATION',
      lat: 45.9765,
      lng: 7.7491,
      estimatedCost: 150,
    });
    assert.equal(hutRes.status, 201);
    const hutId = hutRes.data.poi.id;

    // 5. Bob posts comment
    const commentRes = await bob.createComment(tripId, hutId, 'Remember to bring cash for the hut!');
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.data.comment.id;

    // 6. Charlie upvotes hut
    const voteRes = await charlie.votePoi(tripId, hutId);
    assert.equal(voteRes.status, 200);
    assert.equal(voteRes.data.voteCount, 1);

    // 7. Alice as OWNER demotes Charlie to VIEWER
    const charlieMe = await charlie.getMe();
    await alice.updateMemberRole(tripId, charlieMe.data.user.id, 'VIEWER');

    // 8. Charlie as VIEWER attempts mutations -> blocked 403
    const charliePoiFail = await charlie.createPoi(tripId, { title: 'Unauthorized Spot', lat: 46.0, lng: 7.8 });
    assert.equal(charliePoiFail.status, 403);

    const charlieCommentDeleteFail = await charlie.deleteComment(tripId, hutId, commentId);
    assert.equal(charlieCommentDeleteFail.status, 403);

    // 9. Alice as OWNER moderates/deletes comment
    const aliceDeleteComment = await alice.deleteComment(tripId, hutId, commentId);
    assert.equal(aliceDeleteComment.status, 200);

    // 10. Bob voluntarily leaves trip
    const bobMe = await bob.getMe();
    const bobLeave = await bob.removeMember(tripId, bobMe.data.user.id);
    assert.equal(bobLeave.status, 200);

    // 11. Verify member roster
    const membersRes = await alice.getMembers(tripId);
    assert.equal(membersRes.data.members.length, 2, 'Only Alice and Charlie should remain');
  });

  it('scenario_field_traveler_offline_utility_and_multi_export', async () => {
    // Scenario 3: Complete field preparation, offline exports, print booklet & migration
    const traveler = env.client.fork();
    await traveler.login('norway_explorer');

    // Create rich trip
    const tripRes = await traveler.createTrip({
      title: 'Geirangerfjord Expedition',
      description: 'UNESCO World Heritage Fjord Roadtrip',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      currency: 'NOK',
      scratchpad: 'Emergency Mountain Rescue: 112\nToll tags: AutoPass active',
    });
    const tripId = tripRes.data.trip.id;

    await traveler.createPoi(tripId, {
      title: 'Flydalsjuvet Viewpoint',
      category: 'SIGHTSEEING',
      status: 'BOOKED',
      lat: 62.0911,
      lng: 7.2231,
      dayStart: 1,
      orderIndex: 0,
      notes: 'Classic fjord panorama view',
    });

    await traveler.createPoi(tripId, {
      title: 'Seven Sisters Waterfall',
      category: 'NATURE',
      status: 'PLANNED',
      lat: 62.1083,
      lng: 7.0917,
      dayStart: 1,
      orderIndex: 1,
    });

    await traveler.createChecklist(tripId, { title: 'Camera polarizer filter', category: 'PACKING' });

    // 1. Export GPX 1.1 for Organic Maps
    const gpxRes = await traveler.exportGpx(tripId);
    assert.equal(gpxRes.status, 200);
    assert.ok(gpxRes.data.includes('<gpx version="1.1"'));
    assert.ok(gpxRes.data.includes('Flydalsjuvet Viewpoint'));

    // 2. Export GeoJSON for QGIS / Google My Maps
    const geoJsonRes = await traveler.exportGeoJson(tripId);
    assert.equal(geoJsonRes.status, 200);
    const parsedGeoJson = JSON.parse(geoJsonRes.data);
    assert.equal(parsedGeoJson.features.length, 2);

    // 3. Export iCal for iPhone Calendar
    const icsRes = await traveler.exportIcs(tripId);
    assert.equal(icsRes.status, 200);
    assert.ok(icsRes.data.includes('BEGIN:VCALENDAR'));

    // 4. Inspect offline printable travel booklet
    const printRes = await traveler.getPrintBooklet(tripId);
    assert.equal(printRes.status, 200);
    assert.ok(printRes.data.includes('Geirangerfjord Expedition'));
    assert.ok(printRes.data.includes('Flydalsjuvet Viewpoint'));
    assert.ok(printRes.data.includes('Camera polarizer filter'));

    // 5. JSON Backup Export & Restore on field device
    const jsonRes = await traveler.exportJson(tripId);
    assert.equal(jsonRes.status, 200);
    const fullBackup = jsonRes.data;

    const offlineDevice = env.client.fork();
    await offlineDevice.login('offline_sync_user');
    const restoreRes = await offlineDevice.importJson(fullBackup);
    assert.equal(restoreRes.status, 201);
    const restoredTripId = restoreRes.data.tripId;

    const restoredTrip = await offlineDevice.getTrip(restoredTripId);
    assert.equal(restoredTrip.data.trip.title, 'Geirangerfjord Expedition');
    assert.equal(restoredTrip.data.trip.pois.length, 2);
    assert.equal(restoredTrip.data.trip.currentUserRole, 'OWNER');
  });
});
