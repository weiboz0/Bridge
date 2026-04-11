import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrganization } from "@/lib/organizations";
import { getUserRoleInOrg } from "@/lib/org-memberships";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const org = await getOrganization(db, id);

  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check user has membership in this org (or is platform admin)
  if (!session.user.isPlatformAdmin) {
    const roles = await getUserRoleInOrg(db, id, session.user.id);
    if (roles.length === 0) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
  }

  return NextResponse.json(org);
}
