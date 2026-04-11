import { describe, it, expect } from "vitest";
import { getSystemPrompt } from "@/lib/ai/system-prompts";

describe("getSystemPrompt", () => {
  it("returns K-5 prompt with simple vocabulary guidance", () => {
    const prompt = getSystemPrompt("K-5");
    expect(prompt).toContain("Elementary");
    expect(prompt).toContain("simple vocabulary");
    expect(prompt).toContain("Never provide complete function implementations");
  });

  it("returns 6-8 prompt with line number references", () => {
    const prompt = getSystemPrompt("6-8");
    expect(prompt).toContain("Middle School");
    expect(prompt).toContain("line numbers");
  });

  it("returns 9-12 prompt with technical terminology", () => {
    const prompt = getSystemPrompt("9-12");
    expect(prompt).toContain("High School");
    expect(prompt).toContain("technical terminology");
  });

  it("all prompts include base rules", () => {
    for (const level of ["K-5", "6-8", "9-12"] as const) {
      const prompt = getSystemPrompt(level);
      expect(prompt).toContain("patient coding tutor");
      expect(prompt).toContain("guiding questions");
      expect(prompt).toContain("Never provide complete");
    }
  });
});
