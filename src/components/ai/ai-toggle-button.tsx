"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AiToggleButtonProps {
  sessionId: string;
  studentId: string;
  initialEnabled?: boolean;
}

export function AiToggleButton({
  sessionId,
  studentId,
  initialEnabled = false,
}: AiToggleButtonProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch("/api/ai/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        studentId,
        enabled: !enabled,
      }),
    });

    if (res.ok) {
      setEnabled(!enabled);
    }
    setLoading(false);
  }

  return (
    <Button
      variant={enabled ? "default" : "outline"}
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={loading}
    >
      {enabled ? "AI On" : "AI Off"}
    </Button>
  );
}
