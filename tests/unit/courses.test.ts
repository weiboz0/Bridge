import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser, createTestOrg, createTestCourse, createTestTopic } from "../helpers";
import { createCourse, getCourse, listCoursesByOrg, updateCourse, cloneCourse } from "@/lib/courses";

describe("course operations", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let teacher: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    org = await createTestOrg();
    teacher = await createTestUser({ email: "teacher@test.edu" });
  });

  it("creates a course", async () => {
    const course = await createCourse(testDb, {
      orgId: org.id,
      createdBy: teacher.id,
      title: "Intro to Python",
      gradeLevel: "6-8",
    });
    expect(course.id).toBeDefined();
    expect(course.title).toBe("Intro to Python");
    expect(course.isPublished).toBe(false);
  });

  it("gets course by ID", async () => {
    const course = await createTestCourse(org.id, teacher.id, { title: "Find Me" });
    const found = await getCourse(testDb, course.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find Me");
  });

  it("lists courses by org", async () => {
    await createTestCourse(org.id, teacher.id, { title: "Course A" });
    await createTestCourse(org.id, teacher.id, { title: "Course B" });

    const courses = await listCoursesByOrg(testDb, org.id);
    expect(courses).toHaveLength(2);
  });

  it("updates a course", async () => {
    const course = await createTestCourse(org.id, teacher.id);
    const updated = await updateCourse(testDb, course.id, {
      title: "Updated Title",
      isPublished: true,
    });
    expect(updated!.title).toBe("Updated Title");
    expect(updated!.isPublished).toBe(true);
  });

  it("clones a course with topics", async () => {
    const course = await createTestCourse(org.id, teacher.id, { title: "Original" });
    await createTestTopic(course.id, { title: "Topic 1", sortOrder: 0 });
    await createTestTopic(course.id, { title: "Topic 2", sortOrder: 1 });

    const cloned = await cloneCourse(testDb, course.id, teacher.id);
    expect(cloned).not.toBeNull();
    expect(cloned!.title).toBe("Original (Copy)");
    expect(cloned!.isPublished).toBe(false);
  });
});
