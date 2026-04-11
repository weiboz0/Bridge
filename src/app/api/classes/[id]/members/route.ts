import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { addClassMember, listClassMembers } from "@/lib/class-memberships";

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(["instructor", "ta", "student", "observer", "guest", "parent"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: classId } = await params;
  const body = await request.json();
  const parsed = addSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const member = await addClassMember(db, {
    classId,
    userId: user.id,
    role: parsed.data.role,
  });

  return NextResponse.json(member, { status: 201 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: classId } = await params;
  const members = await listClassMembers(db, classId);
  return NextResponse.json(members);
}
