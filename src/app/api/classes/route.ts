import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createClass, listClassesByOrg } from "@/lib/classes";

const createSchema = z.object({
  courseId: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string().min(1).max(255),
  term: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cls = await createClass(db, {
    ...parsed.data,
    createdBy: session.user.id,
  });

  return NextResponse.json(cls, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const classList = await listClassesByOrg(db, orgId);
  return NextResponse.json(classList);
}
