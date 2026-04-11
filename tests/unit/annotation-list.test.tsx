// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnotationList } from "@/components/annotations/annotation-list";

describe("AnnotationList", () => {
  it("shows empty state when no annotations", () => {
    render(<AnnotationList annotations={[]} onDelete={() => {}} />);
    expect(screen.getByText("No annotations yet.")).toBeInTheDocument();
  });

  it("renders annotations with line numbers and content", () => {
    const annotations = [
      {
        id: "1",
        lineStart: "5",
        lineEnd: "5",
        content: "Good use of a loop!",
        authorType: "teacher" as const,
        createdAt: "2026-04-10T12:00:00Z",
      },
      {
        id: "2",
        lineStart: "10",
        lineEnd: "12",
        content: "Consider using a function here",
        authorType: "ai" as const,
        createdAt: "2026-04-10T12:05:00Z",
      },
    ];
    render(<AnnotationList annotations={annotations} onDelete={() => {}} />);
    expect(screen.getByText("Line 5")).toBeInTheDocument();
    expect(screen.getByText("Good use of a loop!")).toBeInTheDocument();
    expect(screen.getByText("Lines 10-12")).toBeInTheDocument();
    expect(screen.getByText("Consider using a function here")).toBeInTheDocument();
  });

  it("shows author type badge", () => {
    const annotations = [
      {
        id: "1",
        lineStart: "1",
        lineEnd: "1",
        content: "test",
        authorType: "teacher" as const,
        createdAt: "2026-04-10T12:00:00Z",
      },
    ];
    render(<AnnotationList annotations={annotations} onDelete={() => {}} />);
    expect(screen.getByText("Teacher")).toBeInTheDocument();
  });
});
