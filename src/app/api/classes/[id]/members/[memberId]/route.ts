import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getClassMembership, updateClassMemberRole, removeClassMember } from "@/lib/class-memberships";

const updateSchema = z.object({
  role: z.enum(["instructor", "ta", "student", "observer", "guest", "parent"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: classId, memberId } = await params;

  // Verify membership belongs to this class
  const membership = await getClassMembership(db, memberId);
  if (!membership || membership.classId !== classId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await updateClassMemberRole(db, memberId, parsed.data.role);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: classId, memberId } = await params;

  const membership = await getClassMembership(db, memberId);
  if (!membership || membership.classId !== classId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = await removeClassMember(db, memberId);
  return NextResponse.json(removed);
}
