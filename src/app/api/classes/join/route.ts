import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { joinClassByCode } from "@/lib/class-memberships";

const joinSchema = z.object({
  joinCode: z.string().length(8),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = joinSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid join code" }, { status: 400 });
  }

  const result = await joinClassByCode(db, parsed.data.joinCode, session.user.id);

  if (!result) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  return NextResponse.json(result.class);
}
