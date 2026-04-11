import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser, createTestOrg, createTestCourse, createTestClass, createTestSession, createTestClassroom } from "../helpers";
import {
  createDocument,
  getDocument,
  listDocuments,
  updateYjsState,
  updatePlainText,
  getOrCreateDocument,
} from "@/lib/documents";

describe("document operations", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    user = await createTestUser({ email: "student@test.edu" });
  });

  it("creates a document", async () => {
    const doc = await createDocument(testDb, {
      ownerId: user.id,
      language: "python",
    });
    expect(doc.id).toBeDefined();
    expect(doc.ownerId).toBe(user.id);
    expect(doc.plainText).toBe("");
  });

  it("gets document by ID", async () => {
    const doc = await createDocument(testDb, { ownerId: user.id });
    const found = await getDocument(testDb, doc.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(doc.id);
  });

  it("returns null for non-existent document", async () => {
    const found = await getDocument(testDb, "00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });

  it("lists documents by owner", async () => {
    await createDocument(testDb, { ownerId: user.id });
    await createDocument(testDb, { ownerId: user.id });

    const docs = await listDocuments(testDb, { ownerId: user.id });
    expect(docs).toHaveLength(2);
  });

  it("lists documents by session", async () => {
    const teacher = await createTestUser({ email: "teacher@test.edu" });
    const classroom = await createTestClassroom(teacher.id);
    const session = await createTestSession(classroom.id, teacher.id);

    await createDocument(testDb, { ownerId: user.id, sessionId: session.id });

    const docs = await listDocuments(testDb, { sessionId: session.id });
    expect(docs).toHaveLength(1);
  });

  it("updates Yjs state", async () => {
    const doc = await createDocument(testDb, { ownerId: user.id });
    const updated = await updateYjsState(testDb, doc.id, "base64encodedstate");
    expect(updated!.yjsState).toBe("base64encodedstate");
  });

  it("updates plain text", async () => {
    const doc = await createDocument(testDb, { ownerId: user.id });
    const updated = await updatePlainText(testDb, doc.id, "print('hello')");
    expect(updated!.plainText).toBe("print('hello')");
  });

  it("getOrCreateDocument creates if not exists", async () => {
    const teacher = await createTestUser({ email: "teacher@test.edu" });
    const classroom = await createTestClassroom(teacher.id);
    const session = await createTestSession(classroom.id, teacher.id);

    const doc = await getOrCreateDocument(testDb, user.id, session.id);
    expect(doc.ownerId).toBe(user.id);
    expect(doc.sessionId).toBe(session.id);
  });

  it("getOrCreateDocument returns existing", async () => {
    const teacher = await createTestUser({ email: "teacher@test.edu" });
    const classroom = await createTestClassroom(teacher.id);
    const session = await createTestSession(classroom.id, teacher.id);

    const first = await getOrCreateDocument(testDb, user.id, session.id);
    const second = await getOrCreateDocument(testDb, user.id, session.id);
    expect(first.id).toBe(second.id);
  });
});
