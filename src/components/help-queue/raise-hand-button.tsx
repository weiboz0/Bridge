"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RaiseHandButtonProps {
  sessionId: string;
}

export function RaiseHandButton({ sessionId }: RaiseHandButtonProps) {
  const [raised, setRaised] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggleHand() {
    setLoading(true);
    const res = await fetch(`/api/sessions/${sessionId}/help-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raised: !raised }),
    });

    if (res.ok) {
      setRaised(!raised);
    }
    setLoading(false);
  }

  return (
    <Button
      variant={raised ? "destructive" : "outline"}
      size="sm"
      onClick={toggleHand}
      disabled={loading}
    >
      {raised ? "Lower Hand" : "Raise Hand"}
    </Button>
  );
}
