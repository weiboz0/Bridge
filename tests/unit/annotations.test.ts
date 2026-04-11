import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser } from "../helpers";
import {
  createAnnotation,
  listAnnotations,
  deleteAnnotation,
  resolveAnnotation,
} from "@/lib/annotations";

describe("annotation operations", () => {
  let teacher: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    teacher = await createTestUser({ role: "teacher", email: "teacher@test.edu" });
  });

  it("creates an annotation", async () => {
    const annotation = await createAnnotation(testDb, {
      documentId: "session:abc:user:xyz",
      authorId: teacher.id,
      authorType: "teacher",
      lineStart: "5",
      lineEnd: "7",
      content: "Good use of a for loop here!",
    });
    expect(annotation.id).toBeDefined();
    expect(annotation.content).toBe("Good use of a for loop here!");
  });

  it("lists annotations by document", async () => {
    const docId = "session:abc:user:xyz";
    await createAnnotation(testDb, {
      documentId: docId,
      authorId: teacher.id,
      authorType: "teacher",
      lineStart: "1",
      lineEnd: "1",
      content: "First comment",
    });
    await createAnnotation(testDb, {
      documentId: docId,
      authorId: teacher.id,
      authorType: "teacher",
      lineStart: "5",
      lineEnd: "5",
      content: "Second comment",
    });

    const annotations = await listAnnotations(testDb, docId);
    expect(annotations).toHaveLength(2);
  });

  it("deletes an annotation", async () => {
    const annotation = await createAnnotation(testDb, {
      documentId: "session:abc:user:xyz",
      authorId: teacher.id,
      authorType: "teacher",
      lineStart: "1",
      lineEnd: "1",
      content: "To be deleted",
    });
    const deleted = await deleteAnnotation(testDb, annotation.id);
    expect(deleted).not.toBeNull();

    const remaining = await listAnnotations(testDb, "session:abc:user:xyz");
    expect(remaining).toHaveLength(0);
  });

  it("resolves an annotation", async () => {
    const annotation = await createAnnotation(testDb, {
      documentId: "session:abc:user:xyz",
      authorId: teacher.id,
      authorType: "teacher",
      lineStart: "1",
      lineEnd: "1",
      content: "Fix this",
    });
    const resolved = await resolveAnnotation(testDb, annotation.id);
    expect(resolved!.resolved).not.toBeNull();
  });
});
