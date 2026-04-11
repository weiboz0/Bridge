import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDocuments } from "@/lib/documents";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroomId = request.nextUrl.searchParams.get("classroomId") || undefined;
  const studentId = request.nextUrl.searchParams.get("studentId") || undefined;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || undefined;

  const docs = await listDocuments(db, {
    ownerId: studentId,
    classroomId,
    sessionId,
  });

  return NextResponse.json(docs);
}
