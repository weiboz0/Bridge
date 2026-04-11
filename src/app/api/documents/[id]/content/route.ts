import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDocument } from "@/lib/documents";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await getDocument(db, id);

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return plain text only (for parent viewing, search, etc.)
  return NextResponse.json({
    id: doc.id,
    ownerId: doc.ownerId,
    language: doc.language,
    plainText: doc.plainText,
    updatedAt: doc.updatedAt,
  });
}
