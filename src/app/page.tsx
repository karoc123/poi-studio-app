import { redirect } from 'next/navigation';
import { eq, inArray, desc } from 'drizzle-orm';
import { db, trips, tripMembers, users, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { DashboardClient } from '@/components/dashboard';
import type { Role, TripCardData } from '@/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect('/login');
  }

  // Fetch fresh user record
  const [userRecord] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarColor: users.avatarColor,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!userRecord) {
    redirect('/login');
  }

  // Fetch all trips for this user
  const userMemberships = await db
    .select({
      tripId: tripMembers.tripId,
      role: tripMembers.role,
    })
    .from(tripMembers)
    .where(eq(tripMembers.userId, sessionUser.id));

  let initialTrips: TripCardData[] = [];

  if (userMemberships.length > 0) {
    const tripIds = userMemberships.map((m) => m.tripId);
    const roleMap = new Map<string, Role>(
      userMemberships.map((m) => [m.tripId, m.role as Role])
    );

    const tripRecords = await db
      .select()
      .from(trips)
      .where(inArray(trips.id, tripIds))
      .orderBy(desc(trips.updatedAt));

    const allMembers = await db
      .select({
        tripId: tripMembers.tripId,
        userId: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: tripMembers.role,
      })
      .from(tripMembers)
      .innerJoin(users, eq(tripMembers.userId, users.id))
      .where(inArray(tripMembers.tripId, tripIds));

    const membersByTrip = new Map<string, typeof allMembers>();
    for (const member of allMembers) {
      const list = membersByTrip.get(member.tripId) || [];
      list.push(member);
      membersByTrip.set(member.tripId, list);
    }

    const allPois = await db
      .select({
        tripId: pois.tripId,
        status: pois.status,
        estimatedCost: pois.estimatedCost,
      })
      .from(pois)
      .where(inArray(pois.tripId, tripIds));

    const poisByTrip = new Map<
      string,
      { plannedCount: number; ideaCount: number; totalCost: number }
    >();

    for (const poi of allPois) {
      const stats = poisByTrip.get(poi.tripId) || {
        plannedCount: 0,
        ideaCount: 0,
        totalCost: 0,
      };

      if (poi.status === 'IDEA') {
        stats.ideaCount += 1;
      } else {
        stats.plannedCount += 1;
      }

      stats.totalCost += Number(poi.estimatedCost || 0);
      poisByTrip.set(poi.tripId, stats);
    }

    initialTrips = tripRecords.map((t) => {
      const tripMemberList = membersByTrip.get(t.id) || [];
      const stats = poisByTrip.get(t.id) || {
        plannedCount: 0,
        ideaCount: 0,
        totalCost: 0,
      };

      return {
        ...t,
        role: roleMap.get(t.id) || 'VIEWER',
        members: tripMemberList.map((m) => ({
          id: m.userId,
          username: m.username,
          avatarColor: m.avatarColor,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        memberCount: tripMemberList.length,
        plannedPoiCount: stats.plannedCount,
        ideaPoiCount: stats.ideaCount,
        totalEstimatedCost: stats.totalCost,
      };
    });
  }

  return (
    <DashboardClient
      initialUser={{
        id: userRecord.id,
        username: userRecord.username,
        avatarColor: userRecord.avatarColor,
        hasPassword: Boolean(userRecord.passwordHash),
      }}
      initialTrips={initialTrips}
    />
  );
}
