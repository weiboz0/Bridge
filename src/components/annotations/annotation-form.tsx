"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AnnotationFormProps {
  documentId: string;
  onCreated: () => void;
}

export function AnnotationForm({ documentId, onCreated }: AnnotationFormProps) {
  const [lineStart, setLineStart] = useState("");
  const [lineEnd, setLineEnd] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lineStart || !content) return;

    setLoading(true);
    const res = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        lineStart,
        lineEnd: lineEnd || lineStart,
        content,
      }),
    });

    if (res.ok) {
      setLineStart("");
      setLineEnd("");
      setContent("");
      onCreated();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border rounded-lg p-2">
      <div className="flex gap-2">
        <Input
          placeholder="Line"
          value={lineStart}
          onChange={(e) => setLineStart(e.target.value)}
          className="w-16 text-sm"
          required
        />
        <span className="text-muted-foreground self-center">-</span>
        <Input
          placeholder="End"
          value={lineEnd}
          onChange={(e) => setLineEnd(e.target.value)}
          className="w-16 text-sm"
        />
      </div>
      <Input
        placeholder="Add a comment..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="text-sm"
        required
      />
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? "Adding..." : "Add Annotation"}
      </Button>
    </form>
  );
}
