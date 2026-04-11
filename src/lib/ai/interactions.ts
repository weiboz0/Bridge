import { eq, and } from "drizzle-orm";
import { aiInteractions } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface CreateInteractionInput {
  studentId: string;
  sessionId: string;
  enabledByTeacherId: string;
}

export async function createInteraction(db: Database, input: CreateInteractionInput) {
  const [interaction] = await db
    .insert(aiInteractions)
    .values(input)
    .returning();
  return interaction;
}

export async function appendMessage(
  db: Database,
  interactionId: string,
  message: Message
) {
  const [interaction] = await db
    .select()
    .from(aiInteractions)
    .where(eq(aiInteractions.id, interactionId));

  if (!interaction) return null;

  const messages = (interaction.messages as Message[]) || [];
  messages.push(message);

  const [updated] = await db
    .update(aiInteractions)
    .set({ messages })
    .where(eq(aiInteractions.id, interactionId))
    .returning();

  return updated;
}

export async function getInteraction(db: Database, interactionId: string) {
  const [interaction] = await db
    .select()
    .from(aiInteractions)
    .where(eq(aiInteractions.id, interactionId));
  return interaction || null;
}

export async function listInteractionsBySession(db: Database, sessionId: string) {
  return db
    .select()
    .from(aiInteractions)
    .where(eq(aiInteractions.sessionId, sessionId));
}

export async function getActiveInteraction(
  db: Database,
  studentId: string,
  sessionId: string
) {
  const [interaction] = await db
    .select()
    .from(aiInteractions)
    .where(
      and(
        eq(aiInteractions.studentId, studentId),
        eq(aiInteractions.sessionId, sessionId)
      )
    );
  return interaction || null;
}
