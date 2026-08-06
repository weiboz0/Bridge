"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

type SessionVisibility = "unlisted" | "public";

interface TeacherHeaderProps {
  sessionId: string;
  studentCount: number;
  inviteToken?: string | null;
  inviteExpiresAt?: string | null;
  onEndSession: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftVisible: boolean;
  rightVisible: boolean;
}

export function TeacherHeader({
  sessionId,
  studentCount,
  inviteToken: initialInviteToken,
  inviteExpiresAt: _initialInviteExpiresAt,
  onEndSession,
  onToggleLeft,
  onToggleRight,
  leftVisible,
  rightVisible,
}: TeacherHeaderProps) {
  const { data: session } = useSession();
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState(initialInviteToken ?? null);
  const [inviteRevoked, setInviteRevoked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // Plan 090 phase 5: visibility toggle, host-only. TeacherHeader is also
  // mounted for a class-bound session's instructor/TA (GetTeacherPage
  // authorizes them too, not just the literal host) — PATCH /api/sessions/{id}
  // is host/admin-only on the backend, so the control must only render for
  // the actual host. Self-contained fetch (rather than a new prop) keeps
  // this local to the header and correct on every route that mounts it.
  const [isHost, setIsHost] = useState(false);
  const [visibility, setVisibility] = useState<SessionVisibility | null>(null);
  const [visibilityUpdating, setVisibilityUpdating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setVisibility(data.visibility === "public" ? "public" : "unlisted");
      const userId = session?.user?.id;
      setIsHost(Boolean(userId) && (data.teacherId === userId || Boolean(session?.user?.isPlatformAdmin)));
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId, session?.user?.id, session?.user?.isPlatformAdmin]);

  const toggleVisibility = useCallback(async () => {
    if (!visibility) return;
    const next: SessionVisibility = visibility === "public" ? "unlisted" : "public";
    setVisibilityUpdating(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) {
        setVisibility(next);
      }
    } finally {
      setVisibilityUpdating(false);
    }
  }, [sessionId, visibility]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  const inviteLink = inviteToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${inviteToken}`
    : null;

  const copyLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignore clipboard errors
    }
  }, [inviteLink]);

  const rotateToken = useCallback(async () => {
    setRotating(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/rotate-invite`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setInviteToken(data.inviteToken ?? null);
        setInviteRevoked(false);
      }
    } finally {
      setRotating(false);
    }
  }, [sessionId]);

  const revokeToken = useCallback(async () => {
    setRevoking(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/invite`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setInviteToken(null);
        setInviteRevoked(true);
      }
    } finally {
      setRevoking(false);
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col border-b bg-muted/20">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Live Session</span>
          <span className="text-xs text-muted-foreground font-mono">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
          <span className="text-xs text-muted-foreground">
            {studentCount} student{studentCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isHost && visibility && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleVisibility}
              disabled={visibilityUpdating}
              title="Toggle whether this session is listed on the public /sessions directory"
              data-testid="visibility-toggle"
            >
              {visibilityUpdating
                ? "Updating..."
                : visibility === "public"
                  ? "Public"
                  : "List publicly"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInviteOpen((o) => !o)}
            className={inviteOpen ? "bg-zinc-100" : ""}
          >
            Invite
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleLeft}
            className={leftVisible ? "" : "opacity-50"}
          >
            Students
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRight}
            className={rightVisible ? "" : "opacity-50"}
          >
            AI
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setEnding(true);
              onEndSession();
            }}
            disabled={ending}
          >
            {ending ? "Ending..." : "End Session"}
          </Button>
        </div>
      </div>

      {inviteOpen && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-200 bg-zinc-50">
          {inviteRevoked && !inviteToken ? (
            <>
              <span className="text-xs text-muted-foreground">
                Invite link revoked.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={rotateToken}
                disabled={rotating}
              >
                {rotating ? "Generating..." : "Generate New Link"}
              </Button>
            </>
          ) : inviteToken ? (
            <>
              <code className="flex-1 min-w-0 truncate rounded bg-white px-2 py-1 text-xs border border-zinc-200 font-mono">
                {inviteLink}
              </code>
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={rotateToken}
                disabled={rotating}
              >
                {rotating ? "Rotating..." : "Rotate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={revokeToken}
                disabled={revoking}
              >
                {revoking ? "Closing..." : "Close Lobby"}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={rotateToken}
              disabled={rotating}
            >
              {rotating ? "Generating..." : "Generate Invite Link"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
