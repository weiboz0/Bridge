-- Migration: Code Persistence
-- Adds documents table for persisting student code

CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "classroom_id" uuid,
  "session_id" uuid,
  "topic_id" uuid,
  "language" "programming_language" DEFAULT 'python' NOT NULL,
  "yjs_state" text,
  "plain_text" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id");
CREATE INDEX "documents_classroom_idx" ON "documents" USING btree ("classroom_id");
CREATE INDEX "documents_session_idx" ON "documents" USING btree ("session_id");
