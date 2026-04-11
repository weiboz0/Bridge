import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser, createTestClassroom, createTestSession } from "../helpers";
import { setMockUser, createRequest, parseResponse } from "../api-helpers";
import { GET } from "@/app/api/documents/route";
import { GET as GET_DOC } from "@/app/api/documents/[id]/route";
import { GET as GET_CONTENT } from "@/app/api/documents/[id]/content/route";
import { createDocument } from "@/lib/documents";

describe("Documents API", () => {
  let owner: Awaited<ReturnType<typeof createTestUser>>;
  let otherUser: Awaited<ReturnType<typeof createTestUser>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    owner = await createTestUser({ name: "Owner", email: "owner@test.edu" });
    otherUser = await createTestUser({ name: "Other", email: "other@test.edu" });
    admin = await createTestUser({ name: "Admin", email: "admin@test.edu", isPlatformAdmin: true });
  });

  describe("GET /api/documents", () => {
    it("lists own documents", async () => {
      setMockUser({ id: owner.id, name: owner.name, email: owner.email });
      await createDocument(testDb, { ownerId: owner.id, language: "python" });
      await createDocument(testDb, { ownerId: owner.id, language: "python" });

      const req = createRequest("/api/documents", {
        searchParams: { studentId: owner.id },
      });
      const { status, body } = await parseResponse<any[]>(await GET(req));
      expect(status).toBe(200);
      expect(body).toHaveLength(2);
    });

    it("non-admin defaults to own documents", async () => {
      setMockUser({ id: owner.id, name: owner.name, email: owner.email });
      await createDocument(testDb, { ownerId: owner.id });
      await createDocument(testDb, { ownerId: otherUser.id });

      const req = createRequest("/api/documents");
      const { status, body } = await parseResponse<any[]>(await GET(req));
      expect(status).toBe(200);
      expect(body).toHaveLength(1);
    });

    it("requires at least one filter", async () => {
      setMockUser({ id: admin.id, name: admin.name, email: admin.email, isPlatformAdmin: true });

      const req = createRequest("/api/documents");
      const { status } = await parseResponse(await GET(req));
      expect(status).toBe(400);
    });

    it("rejects unauthenticated request", async () => {
      setMockUser(null);
      const req = createRequest("/api/documents");
      const { status } = await parseResponse(await GET(req));
      expect(status).toBe(401);
    });
  });

  describe("GET /api/documents/[id]", () => {
    it("owner can view their document", async () => {
      setMockUser({ id: owner.id, name: owner.name, email: owner.email });
      const doc = await createDocument(testDb, { ownerId: owner.id });

      const res = await GET_DOC(
        createRequest(`/api/documents/${doc.id}`),
        { params: Promise.resolve({ id: doc.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body).toHaveProperty("id", doc.id);
    });

    it("non-owner cannot view document", async () => {
      setMockUser({ id: otherUser.id, name: otherUser.name, email: otherUser.email });
      const doc = await createDocument(testDb, { ownerId: owner.id });

      const res = await GET_DOC(
        createRequest(`/api/documents/${doc.id}`),
        { params: Promise.resolve({ id: doc.id }) }
      );
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("platform admin can view any document", async () => {
      setMockUser({ id: admin.id, name: admin.name, email: admin.email, isPlatformAdmin: true });
      const doc = await createDocument(testDb, { ownerId: owner.id });

      const res = await GET_DOC(
        createRequest(`/api/documents/${doc.id}`),
        { params: Promise.resolve({ id: doc.id }) }
      );
      const { status } = await parseResponse(res);
      expect(status).toBe(200);
    });

    it("returns 404 for non-existent document", async () => {
      setMockUser({ id: owner.id, name: owner.name, email: owner.email });

      const res = await GET_DOC(
        createRequest("/api/documents/00000000-0000-0000-0000-000000000000"),
        { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) }
      );
      const { status } = await parseResponse(res);
      expect(status).toBe(404);
    });
  });

  describe("GET /api/documents/[id]/content", () => {
    it("returns plain text only", async () => {
      setMockUser({ id: owner.id, name: owner.name, email: owner.email });
      const doc = await createDocument(testDb, { ownerId: owner.id });

      const res = await GET_CONTENT(
        createRequest(`/api/documents/${doc.id}/content`),
        { params: Promise.resolve({ id: doc.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body).toHaveProperty("plainText");
      expect(body).not.toHaveProperty("yjsState");
    });

    it("non-owner cannot view content", async () => {
      setMockUser({ id: otherUser.id, name: otherUser.name, email: otherUser.email });
      const doc = await createDocument(testDb, { ownerId: owner.id });

      const res = await GET_CONTENT(
        createRequest(`/api/documents/${doc.id}/content`),
        { params: Promise.resolve({ id: doc.id }) }
      );
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });
  });
});
