import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { Card, CardContent } from "@/components/ui/card";
import { StartSessionButton } from "@/components/teacher/start-session-button";

// Plan 090 phase 5 — role-neutral session browse directory.
//
// Any authenticated user (PortalShell portalRole=null admits them, plan 090
// phase 4) can see public, live, ad-hoc sessions and join one, or start their
// own via StartSessionButton mode="orphan" (which now routes a class-less
// host to /sessions/{id} — see start-session-button.tsx).

interface PublicSessionItem {
  id: string;
  title: string;
  hostName: string;
  participantCount: number;
  startedAt: string;
}

interface PublicSessionsResponse {
  items: PublicSessionItem[];
  nextCursor?: string | null;
}

function formatStartedAt(startedAt: string): string {
  return new Date(startedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SessionsBrowsePage() {
  let sessions: PublicSessionItem[] = [];
  try {
    const resp = await api<PublicSessionsResponse>("/api/sessions/public");
    sessions = resp.items ?? [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    // Other errors: render the empty state rather than crashing the page —
    // this is a browse surface, not a critical path.
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Join a public live session, or start your own.
          </p>
        </div>
        <StartSessionButton mode="orphan" />
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No public sessions right now. Start one to get things going.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {s.title || "Untitled session"}
                </p>
                <p className="text-xs text-zinc-500">
                  Hosted by {s.hostName} · {s.participantCount} participant
                  {s.participantCount !== 1 ? "s" : ""} · Started{" "}
                  {formatStartedAt(s.startedAt)}
                </p>
              </div>
              <Link
                href={`/sessions/${s.id}`}
                className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Join
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
