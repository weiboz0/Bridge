import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "teacher",
  "student",
]);

export const authProviderEnum = pgEnum("auth_provider", [
  "google",
  "microsoft",
  "email",
]);

export const gradeLevelEnum = pgEnum("grade_level", ["K-5", "6-8", "9-12"]);

export const editorModeEnum = pgEnum("editor_mode", [
  "blockly",
  "python",
  "javascript",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "ended",
]);

export const participantStatusEnum = pgEnum("participant_status", [
  "active",
  "idle",
  "needs_help",
]);

export const annotationAuthorTypeEnum = pgEnum("annotation_author_type", [
  "teacher",
  "ai",
]);

// --- Tables ---

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("student"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    schoolId: uuid("school_id").references(() => schools.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const authProviders = pgTable(
  "auth_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_provider_unique_idx").on(
      table.provider,
      table.providerUserId
    ),
  ]
);

export const classrooms = pgTable(
  "classrooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    gradeLevel: gradeLevelEnum("grade_level").notNull(),
    editorMode: editorModeEnum("editor_mode").notNull().default("python"),
    joinCode: varchar("join_code", { length: 10 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("classrooms_join_code_idx").on(table.joinCode),
    index("classrooms_teacher_idx").on(table.teacherId),
  ]
);

export const classroomMembers = pgTable(
  "classroom_members",
  {
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("classroom_member_unique_idx").on(
      table.classroomId,
      table.userId
    ),
  ]
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    status: sessionStatusEnum("status").notNull().default("active"),
    settings: jsonb("settings").default({}),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    index("live_sessions_classroom_idx").on(table.classroomId),
    index("live_sessions_status_idx").on(table.classroomId, table.status),
  ]
);

export const sessionParticipants = pgTable(
  "session_participants",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: participantStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => [
    uniqueIndex("session_participant_unique_idx").on(
      table.sessionId,
      table.studentId
    ),
    index("session_participants_session_idx").on(table.sessionId),
  ]
);

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    enabledByTeacherId: uuid("enabled_by_teacher_id")
      .notNull()
      .references(() => users.id),
    messages: jsonb("messages").default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_interactions_session_idx").on(table.sessionId),
    index("ai_interactions_student_idx").on(table.studentId, table.sessionId),
  ]
);

export const codeAnnotations = pgTable(
  "code_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: varchar("document_id", { length: 255 }).notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorType: annotationAuthorTypeEnum("author_type").notNull(),
    lineStart: varchar("line_start", { length: 10 }).notNull(),
    lineEnd: varchar("line_end", { length: 10 }).notNull(),
    content: text("content").notNull(),
    resolved: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("code_annotations_document_idx").on(table.documentId),
  ]
);
