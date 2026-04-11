import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCourse, listCoursesByOrg } from "@/lib/courses";

const createSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  gradeLevel: z.enum(["K-5", "6-8", "9-12"]),
  language: z.enum(["python", "javascript", "blockly"]).optional(),
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

  const course = await createCourse(db, {
    ...parsed.data,
    createdBy: session.user.id,
  });

  return NextResponse.json(course, { status: 201 });
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

  const courses = await listCoursesByOrg(db, orgId);
  return NextResponse.json(courses);
}
