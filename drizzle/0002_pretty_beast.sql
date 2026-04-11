CREATE TYPE "public"."annotation_author_type" AS ENUM('teacher', 'ai');--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"enabled_by_teacher_id" uuid NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar(255) NOT NULL,
	"author_id" uuid NOT NULL,
	"author_type" "annotation_author_type" NOT NULL,
	"line_start" varchar(10) NOT NULL,
	"line_end" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_enabled_by_teacher_id_users_id_fk" FOREIGN KEY ("enabled_by_teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_annotations" ADD CONSTRAINT "code_annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_interactions_session_idx" ON "ai_interactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_interactions_student_idx" ON "ai_interactions" USING btree ("student_id","session_id");--> statement-breakpoint
CREATE INDEX "code_annotations_document_idx" ON "code_annotations" USING btree ("document_id");