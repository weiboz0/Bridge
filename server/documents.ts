import { eq, and, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { serverDb } from "./db";

// Minimal table definition for server/ context (can't use @/ aliases)
// Keep in sync with src/lib/db/schema.ts documents table
const programmingLanguageEnum = pgEnum("programming_language", [
  "python",
  "javascript",
  "blockly",
]);

const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    classroomId: uuid("classroom_id"),
    sessionId: uuid("session_id"),
    topicId: uuid("topic_id"),
    language: programmingLanguageEnum("language").notNull().default("python"),
    yjsState: text("yjs_state"),
    plainText: text("plain_text").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("documents_owner_idx").on(table.ownerId),
    index("documents_session_idx").on(table.sessionId),
  ]
);

export async function loadDocumentState(documentName: string): Promise<string | null> {
  // Document name format: session:{sessionId}:user:{userId}
  const parts = documentName.split(":");
  if (parts[0] !== "session" || parts.length < 4) return null;

  const sessionId = parts[1];
  const userId = parts[3];

  const [doc] = await serverDb
    .select({ yjsState: documents.yjsState })
    .from(documents)
    .where(
      and(
        eq(documents.ownerId, userId),
        eq(documents.sessionId, sessionId)
      )
    );

  return doc?.yjsState || null;
}

export async function storeDocumentState(
  documentName: string,
  yjsState: string,
  plainText: string
): Promise<void> {
  const parts = documentName.split(":");
  if (parts[0] !== "session" || parts.length < 4) return;

  const sessionId = parts[1];
  const userId = parts[3];

  // Atomic upsert using raw SQL to avoid race conditions
  await serverDb.execute(sql`
    INSERT INTO documents (id, owner_id, session_id, yjs_state, plain_text, created_at, updated_at)
    VALUES (gen_random_uuid(), ${userId}, ${sessionId}, ${yjsState}, ${plainText}, now(), now())
    ON CONFLICT (owner_id, session_id) WHERE session_id IS NOT NULL
    DO UPDATE SET yjs_state = ${yjsState}, plain_text = ${plainText}, updated_at = now()
  `);
}
