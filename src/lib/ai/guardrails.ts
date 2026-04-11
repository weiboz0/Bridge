const SOLUTION_PATTERNS = [
  /```python\n[\s\S]{200,}```/,  // Long code blocks (>200 chars)
  /def\s+\w+\s*\([^)]*\):[\s\S]{100,}/,  // Complete function definitions
  /class\s+\w+[\s\S]{150,}/,  // Complete class definitions
  /here(?:'s| is) the (?:complete |full )?(?:solution|answer|code)/i,
  /just (?:copy|paste|use) this/i,
];

export function containsSolution(text: string): boolean {
  return SOLUTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function filterResponse(text: string): string {
  if (containsSolution(text)) {
    return "I was about to give you too much! Let me try again with a hint instead. 🤔\n\nWhat part of the problem are you finding most confusing? Let's break it down together.";
  }
  return text;
}
