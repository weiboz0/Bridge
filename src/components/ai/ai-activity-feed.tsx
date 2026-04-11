"use client";

interface InteractionSummary {
  id: string;
  studentId: string;
  studentName: string;
  messageCount: number;
  createdAt: string;
}

interface AiActivityFeedProps {
  interactions: InteractionSummary[];
}

export function AiActivityFeed({ interactions }: AiActivityFeedProps) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No AI interactions yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">AI Activity</h3>
      {interactions.map((interaction) => (
        <div
          key={interaction.id}
          className="flex items-center justify-between p-2 border rounded-lg text-sm"
        >
          <div>
            <span className="font-medium">{interaction.studentName}</span>
            <span className="text-muted-foreground ml-2">
              {interaction.messageCount} message{interaction.messageCount !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(interaction.createdAt).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
