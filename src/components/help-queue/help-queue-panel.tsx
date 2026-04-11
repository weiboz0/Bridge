"use client";

import { useState, useEffect } from "react";

interface QueueItem {
  studentId: string;
  name: string;
  status: string;
  joinedAt: string;
}

interface HelpQueuePanelProps {
  sessionId: string;
}

export function HelpQueuePanel({ sessionId }: HelpQueuePanelProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    async function fetchQueue() {
      const res = await fetch(`/api/sessions/${sessionId}/help-queue`);
      if (res.ok) {
        setQueue(await res.json());
      }
    }
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (queue.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No students need help right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        Help Queue ({queue.length})
      </h3>
      {queue.map((item) => (
        <div
          key={item.studentId}
          className="flex items-center justify-between p-2 border rounded-lg"
        >
          <span className="text-sm font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">
            Needs help
          </span>
        </div>
      ))}
    </div>
  );
}
