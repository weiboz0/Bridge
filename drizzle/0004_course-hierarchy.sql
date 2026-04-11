-- Migration: Course Hierarchy
-- Adds courses, topics, classes, class_memberships, new_classrooms, session_topics tables

-- New enums
CREATE TYPE "public"."class_status" AS ENUM('active', 'archived');
CREATE TYPE "public"."class_member_role" AS ENUM('instructor', 'ta', 'student', 'observer', 'guest', 'parent');
CREATE TYPE "public"."programming_language" AS ENUM('python', 'javascript', 'blockly');

-- Courses
CREATE TABLE "courses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "title" varchar(255) NOT NULL,
  "description" text DEFAULT '',
  "grade_level" "grade_level" NOT NULL,
  "language" "programming_language" DEFAULT 'python' NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "courses_org_idx" ON "courses" USING btree ("org_id");
CREATE INDEX "courses_created_by_idx" ON "courses" USING btree ("created_by");

-- Topics
CREATE TABLE "topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text DEFAULT '',
  "sort_order" integer DEFAULT 0 NOT NULL,
  "lesson_content" jsonb DEFAULT '{}'::jsonb,
  "starter_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "topics_course_idx" ON "topics" USING btree ("course_id");
CREATE INDEX "topics_sort_idx" ON "topics" USING btree ("course_id", "sort_order");

-- Classes
CREATE TABLE "classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "term" varchar(100) DEFAULT '',
  "join_code" varchar(10) NOT NULL,
  "status" "class_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "classes_join_code_idx" ON "classes" USING btree ("join_code");
CREATE INDEX "classes_course_idx" ON "classes" USING btree ("course_id");
CREATE INDEX "classes_org_idx" ON "classes" USING btree ("org_id");

-- Class memberships
CREATE TABLE "class_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "class_member_role" DEFAULT 'student' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "class_membership_unique_idx" ON "class_memberships" USING btree ("class_id", "user_id");
CREATE INDEX "class_memberships_class_idx" ON "class_memberships" USING btree ("class_id");
CREATE INDEX "class_memberships_user_idx" ON "class_memberships" USING btree ("user_id");

-- New classrooms (1:1 with class)
CREATE TABLE "new_classrooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE UNIQUE,
  "editor_mode" "editor_mode" DEFAULT 'python' NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "new_classrooms_class_idx" ON "new_classrooms" USING btree ("class_id");

-- Session-topic linking
CREATE TABLE "session_topics" (
  "session_id" uuid NOT NULL REFERENCES "live_sessions"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "session_topic_unique_idx" ON "session_topics" USING btree ("session_id", "topic_id");
