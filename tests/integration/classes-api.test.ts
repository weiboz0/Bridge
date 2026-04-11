import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser, createTestOrg, createTestOrgMembership, createTestCourse, createTestClass } from "../helpers";
import { setMockUser, createRequest, parseResponse } from "../api-helpers";
import { POST, GET } from "@/app/api/classes/route";
import { GET as GET_CLASS, PATCH as ARCHIVE } from "@/app/api/classes/[id]/route";
import { POST as ADD_MEMBER, GET as LIST_MEMBERS } from "@/app/api/classes/[id]/members/route";
import { POST as JOIN } from "@/app/api/classes/join/route";
import { createClass } from "@/lib/classes";

describe("Classes API", () => {
  let teacher: Awaited<ReturnType<typeof createTestUser>>;
  let student: Awaited<ReturnType<typeof createTestUser>>;
  let otherUser: Awaited<ReturnType<typeof createTestUser>>;
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let course: Awaited<ReturnType<typeof createTestCourse>>;

  beforeEach(async () => {
    org = await createTestOrg();
    teacher = await createTestUser({ name: "Teacher", email: "teacher@test.edu" });
    student = await createTestUser({ name: "Student", email: "student@test.edu" });
    otherUser = await createTestUser({ name: "Other", email: "other@test.edu" });
    await createTestOrgMembership(org.id, teacher.id, { role: "teacher" });
    course = await createTestCourse(org.id, teacher.id);
  });

  describe("POST /api/classes", () => {
    it("teacher creates a class", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });

      const req = createRequest("/api/classes", {
        method: "POST",
        body: { courseId: course.id, orgId: org.id, title: "Fall 2026 Period 3" },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(201);
      expect(body).toHaveProperty("title", "Fall 2026 Period 3");
      expect(body).toHaveProperty("joinCode");
    });

    it("non-member cannot create class", async () => {
      setMockUser({ id: otherUser.id, name: otherUser.name, email: otherUser.email });

      const req = createRequest("/api/classes", {
        method: "POST",
        body: { courseId: course.id, orgId: org.id, title: "Nope" },
      });
      const { status } = await parseResponse(await POST(req));
      expect(status).toBe(403);
    });
  });

  describe("GET /api/classes", () => {
    it("lists classes by org for member", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });
      await createClass(testDb, { courseId: course.id, orgId: org.id, title: "A", createdBy: teacher.id });
      await createClass(testDb, { courseId: course.id, orgId: org.id, title: "B", createdBy: teacher.id });

      const req = createRequest("/api/classes", { searchParams: { orgId: org.id } });
      const { status, body } = await parseResponse<any[]>(await GET(req));
      expect(status).toBe(200);
      expect(body).toHaveLength(2);
    });

    it("non-member cannot list", async () => {
      setMockUser({ id: otherUser.id, name: otherUser.name, email: otherUser.email });

      const req = createRequest("/api/classes", { searchParams: { orgId: org.id } });
      const { status } = await parseResponse(await GET(req));
      expect(status).toBe(403);
    });
  });

  describe("GET /api/classes/[id]", () => {
    it("gets a class", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });
      const cls = await createClass(testDb, { courseId: course.id, orgId: org.id, title: "Find Me", createdBy: teacher.id });

      const res = await GET_CLASS(
        createRequest(`/api/classes/${cls.id}`),
        { params: Promise.resolve({ id: cls.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body).toHaveProperty("title", "Find Me");
    });
  });

  describe("PATCH /api/classes/[id] (archive)", () => {
    it("archives a class", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });
      const cls = await createClass(testDb, { courseId: course.id, orgId: org.id, title: "Archive Me", createdBy: teacher.id });

      const res = await ARCHIVE(
        createRequest(`/api/classes/${cls.id}`, { method: "PATCH" }),
        { params: Promise.resolve({ id: cls.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body).toHaveProperty("status", "archived");
    });
  });

  describe("POST /api/classes/join", () => {
    it("student joins by code", async () => {
      setMockUser({ id: student.id, name: student.name, email: student.email });
      const cls = await createClass(testDb, { courseId: course.id, orgId: org.id, title: "Open", createdBy: teacher.id });

      const req = createRequest("/api/classes/join", {
        method: "POST",
        body: { joinCode: cls.joinCode },
      });
      const { status, body } = await parseResponse(await JOIN(req));
      expect(status).toBe(200);
      expect(body).toHaveProperty("id", cls.id);
    });

    it("returns 404 for invalid code", async () => {
      setMockUser({ id: student.id, name: student.name, email: student.email });

      const req = createRequest("/api/classes/join", {
        method: "POST",
        body: { joinCode: "ZZZZZZZZ" },
      });
      const { status } = await parseResponse(await JOIN(req));
      expect(status).toBe(404);
    });
  });

  describe("Members API", () => {
    it("adds a member by email", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });
      const cls = await createClass(testDb, { courseId: course.id, orgId: org.id, title: "My Class", createdBy: teacher.id });

      const res = await ADD_MEMBER(
        createRequest(`/api/classes/${cls.id}/members`, {
          method: "POST",
          body: { email: student.email, role: "student" },
        }),
        { params: Promise.resolve({ id: cls.id }) }
      );
      const { status } = await parseResponse(res);
      expect(status).toBe(201);
    });

    it("lists class members", async () => {
      setMockUser({ id: teacher.id, name: teacher.name, email: teacher.email });
      const cls = await createClass(testDb, { courseId: course.id, orgId: org.id, title: "My Class", createdBy: teacher.id });

      const res = await LIST_MEMBERS(
        createRequest(`/api/classes/${cls.id}/members`),
        { params: Promise.resolve({ id: cls.id }) }
      );
      const { status, body } = await parseResponse<any[]>(res);
      expect(status).toBe(200);
      expect(body).toHaveLength(1); // instructor auto-added
      expect(body[0]).toHaveProperty("role", "instructor");
    });
  });
});
