import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, tripMembers, checklistItems, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId } = await params;

    // Check membership
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    const items = await db
      .select({
        id: checklistItems.id,
        tripId: checklistItems.tripId,
        title: checklistItems.title,
        category: checklistItems.category,
        isCompleted: checklistItems.isCompleted,
        assignedToUserId: checklistItems.assignedToUserId,
        createdAt: checklistItems.createdAt,
        assignedUsername: users.username,
        assignedAvatarColor: users.avatarColor,
      })
      .from(checklistItems)
      .leftJoin(users, eq(checklistItems.assignedToUserId, users.id))
      .where(eq(checklistItems.tripId, tripId))
      .orderBy(asc(checklistItems.createdAt));

    const detailedItems = items.map((ci) => ({
      id: ci.id,
      tripId: ci.tripId,
      title: ci.title,
      category: ci.category,
      isCompleted: Boolean(ci.isCompleted),
      assignedToUserId: ci.assignedToUserId,
      assignedTo: ci.assignedToUserId
        ? {
            id: ci.assignedToUserId,
            username: ci.assignedUsername || '',
            avatarColor: ci.assignedAvatarColor || '#6366F1',
          }
        : null,
      createdAt: ci.createdAt,
    }));

    return NextResponse.json({
      items: detailedItems,
      checklistItems: detailedItems,
    });
  } catch (error) {
    console.error('Error fetching checklists:', error);
    return NextResponse.json({ error: 'Failed to retrieve checklists' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId } = await params;

    // Check membership and role
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    if (membership.role === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot create checklist items' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.title || !String(body.title).trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const title = String(body.title).trim();
    const allowedCategories = ['BEFORE_TRIP', 'PACKING', 'DOCUMENTS'];
    const category =
      body.category && allowedCategories.includes(body.category.toUpperCase())
        ? body.category.toUpperCase()
        : 'BEFORE_TRIP';

    const assignedToUserId =
      typeof body.assignedToUserId === 'string' && body.assignedToUserId.trim()
        ? body.assignedToUserId.trim()
        : null;

    const itemId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(checklistItems).values({
      id: itemId,
      tripId,
      title,
      category,
      isCompleted: false,
      assignedToUserId,
      createdAt: now,
    });

    return NextResponse.json(
      {
        item: {
          id: itemId,
          tripId,
          title,
          category,
          isCompleted: false,
          assignedToUserId,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating checklist item:', error);
    return NextResponse.json({ error: 'Failed to create checklist item' }, { status: 500 });
  }
}
