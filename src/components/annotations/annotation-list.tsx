"use client";

import { Button } from "@/components/ui/button";

interface Annotation {
  id: string;
  lineStart: string;
  lineEnd: string;
  content: string;
  authorType: "teacher" | "ai";
  createdAt: string;
}

interface AnnotationListProps {
  annotations: Annotation[];
  onDelete: (id: string) => void;
}

export function AnnotationList({ annotations, onDelete }: AnnotationListProps) {
  if (annotations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No annotations yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {annotations.map((annotation) => (
        <div key={annotation.id} className="border rounded-lg p-2 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {annotation.lineStart === annotation.lineEnd
                  ? `Line ${annotation.lineStart}`
                  : `Lines ${annotation.lineStart}-${annotation.lineEnd}`}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                annotation.authorType === "teacher"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-purple-100 text-purple-700"
              }`}>
                {annotation.authorType === "teacher" ? "Teacher" : "AI"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={() => onDelete(annotation.id)}
            >
              ×
            </Button>
          </div>
          <p className="whitespace-pre-wrap">{annotation.content}</p>
        </div>
      ))}
    </div>
  );
}
