import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnthropicClient } from "@/lib/ai/client";
import { getSystemPrompt } from "@/lib/ai/system-prompts";
import { filterResponse } from "@/lib/ai/guardrails";
import {
  getActiveInteraction,
  createInteraction,
  appendMessage,
} from "@/lib/ai/interactions";
import { getSession } from "@/lib/sessions";
import { getClassroom } from "@/lib/classrooms";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const { sessionId, message, code } = body;

  if (!sessionId || !message) {
    return new Response("Missing sessionId or message", { status: 400 });
  }

  // Get session and classroom for grade level
  const liveSession = await getSession(db, sessionId);
  if (!liveSession || liveSession.status !== "active") {
    return new Response("Session not found or ended", { status: 404 });
  }

  const classroom = await getClassroom(db, liveSession.classroomId);
  if (!classroom) {
    return new Response("Classroom not found", { status: 404 });
  }

  // Get or create AI interaction
  let interaction = await getActiveInteraction(db, session.user.id, sessionId);
  if (!interaction) {
    interaction = await createInteraction(db, {
      studentId: session.user.id,
      sessionId,
      enabledByTeacherId: liveSession.teacherId,
    });
  }

  // Append user message
  await appendMessage(db, interaction.id, {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Build messages for Claude
  const history = ((interaction.messages as any[]) || []).map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  history.push({ role: "user" as const, content: message });

  // Add code context if provided
  const systemPrompt =
    getSystemPrompt(classroom.gradeLevel as "K-5" | "6-8" | "9-12") +
    (code ? `\n\nThe student's current code:\n\`\`\`python\n${code}\n\`\`\`` : "");

  // Stream response
  const client = getAnthropicClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";

      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: systemPrompt,
          messages: history,
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
            );
          }
        }

        // Apply guardrails to full response
        const filtered = filterResponse(fullResponse);
        if (filtered !== fullResponse) {
          // Response was filtered — send replacement
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ replace: filtered })}\n\n`
            )
          );
          fullResponse = filtered;
        }

        // Save assistant message
        await appendMessage(db, interaction!.id, {
          role: "assistant",
          content: fullResponse,
          timestamp: new Date().toISOString(),
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err.message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
