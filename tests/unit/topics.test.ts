import { describe, it, expect, beforeEach } from "vitest";
import { testDb, createTestUser, createTestOrg, createTestCourse, createTestTopic } from "../helpers";
import { createTopic, getTopic, listTopicsByCourse, updateTopic, deleteTopic, reorderTopics } from "@/lib/topics";

describe("topic operations", () => {
  let course: Awaited<ReturnType<typeof createTestCourse>>;

  beforeEach(async () => {
    const org = await createTestOrg();
    const teacher = await createTestUser({ email: "teacher@test.edu" });
    course = await createTestCourse(org.id, teacher.id);
  });

  it("creates a topic with auto-incremented sortOrder", async () => {
    const t1 = await createTopic(testDb, { courseId: course.id, title: "First" });
    const t2 = await createTopic(testDb, { courseId: course.id, title: "Second" });
    expect(t1.sortOrder).toBe(0);
    expect(t2.sortOrder).toBe(1);
  });

  it("lists topics ordered by sortOrder", async () => {
    await createTestTopic(course.id, { title: "B", sortOrder: 1 });
    await createTestTopic(course.id, { title: "A", sortOrder: 0 });

    const list = await listTopicsByCourse(testDb, course.id);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("A");
    expect(list[1].title).toBe("B");
  });

  it("updates a topic", async () => {
    const topic = await createTestTopic(course.id);
    const updated = await updateTopic(testDb, topic.id, { title: "Updated" });
    expect(updated!.title).toBe("Updated");
  });

  it("deletes a topic", async () => {
    const topic = await createTestTopic(course.id);
    const deleted = await deleteTopic(testDb, topic.id);
    expect(deleted).not.toBeNull();

    const remaining = await listTopicsByCourse(testDb, course.id);
    expect(remaining).toHaveLength(0);
  });

  it("reorders topics", async () => {
    const t1 = await createTestTopic(course.id, { title: "First", sortOrder: 0 });
    const t2 = await createTestTopic(course.id, { title: "Second", sortOrder: 1 });
    const t3 = await createTestTopic(course.id, { title: "Third", sortOrder: 2 });

    await reorderTopics(testDb, course.id, [t3.id, t1.id, t2.id]);

    const list = await listTopicsByCourse(testDb, course.id);
    expect(list[0].title).toBe("Third");
    expect(list[1].title).toBe("First");
    expect(list[2].title).toBe("Second");
  });
});
