import { describe, it, expect } from "vitest";
import { containsSolution, filterResponse } from "@/lib/ai/guardrails";

describe("containsSolution", () => {
  it("detects long code blocks", () => {
    const text = "Here you go:\n```python\n" + "x = 1\n".repeat(50) + "```";
    expect(containsSolution(text)).toBe(true);
  });

  it("allows short code snippets", () => {
    const text = "Try this: `print(x)`";
    expect(containsSolution(text)).toBe(false);
  });

  it("detects 'here is the solution' language", () => {
    expect(containsSolution("Here's the complete solution:")).toBe(true);
    expect(containsSolution("here is the answer")).toBe(true);
  });

  it("detects 'just copy this' language", () => {
    expect(containsSolution("Just paste this code")).toBe(true);
  });

  it("allows hint-style responses", () => {
    expect(containsSolution("Look at line 5 — what value does x have there?")).toBe(false);
  });
});

describe("filterResponse", () => {
  it("replaces solution responses with redirect", () => {
    const result = filterResponse("Here's the complete solution:\ndef foo(): pass");
    expect(result).toContain("hint instead");
  });

  it("passes through hint responses unchanged", () => {
    const hint = "What do you think happens when x is 0?";
    expect(filterResponse(hint)).toBe(hint);
  });
});
