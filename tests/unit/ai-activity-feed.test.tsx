// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiActivityFeed } from "@/components/ai/ai-activity-feed";

describe("AiActivityFeed", () => {
  it("shows empty state when no interactions", () => {
    render(<AiActivityFeed interactions={[]} />);
    expect(screen.getByText("No AI interactions yet.")).toBeInTheDocument();
  });

  it("renders interaction entries", () => {
    const interactions = [
      {
        id: "1",
        studentId: "s1",
        studentName: "Alice",
        messageCount: 3,
        createdAt: "2026-04-10T12:00:00Z",
      },
      {
        id: "2",
        studentId: "s2",
        studentName: "Bob",
        messageCount: 1,
        createdAt: "2026-04-10T12:05:00Z",
      },
    ];
    render(<AiActivityFeed interactions={interactions} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("3 messages")).toBeInTheDocument();
    expect(screen.getByText("1 message")).toBeInTheDocument();
  });
});
