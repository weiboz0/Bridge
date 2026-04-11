import { eq } from "drizzle-orm";
import { codeAnnotations } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

interface CreateAnnotationInput {
  documentId: string;
  authorId: string;
  authorType: "teacher" | "ai";
  lineStart: string;
  lineEnd: string;
  content: string;
}

export async function createAnnotation(db: Database, input: CreateAnnotationInput) {
  const [annotation] = await db
    .insert(codeAnnotations)
    .values(input)
    .returning();
  return annotation;
}

export async function listAnnotations(db: Database, documentId: string) {
  return db
    .select()
    .from(codeAnnotations)
    .where(eq(codeAnnotations.documentId, documentId));
}

export async function deleteAnnotation(db: Database, annotationId: string) {
  const [deleted] = await db
    .delete(codeAnnotations)
    .where(eq(codeAnnotations.id, annotationId))
    .returning();
  return deleted || null;
}

export async function resolveAnnotation(db: Database, annotationId: string) {
  const [resolved] = await db
    .update(codeAnnotations)
    .set({ resolved: new Date() })
    .where(eq(codeAnnotations.id, annotationId))
    .returning();
  return resolved || null;
}
