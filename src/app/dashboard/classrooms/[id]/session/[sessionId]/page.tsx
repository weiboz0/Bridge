"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CodeEditor } from "@/components/editor/code-editor";
import { OutputPanel } from "@/components/editor/output-panel";
import { RunButton } from "@/components/editor/run-button";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { RaiseHandButton } from "@/components/help-queue/raise-hand-button";
import { usePyodide } from "@/lib/pyodide/use-pyodide";
import { useYjsProvider } from "@/lib/yjs/use-yjs-provider";
import { Button } from "@/components/ui/button";

export default function StudentSessionPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const { data: session } = useSession();
  const [code, setCode] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const { ready, running, output, runCode, clearOutput } = usePyodide();

  const userId = session?.user?.id || "";
  const documentName = `session:${params.sessionId}:user:${userId}`;
  const token = `${userId}:${session?.user?.role || "student"}`;

  const { yText, provider, connected } = useYjsProvider({
    documentName,
    token,
  });

  // Listen for AI toggle events via SSE
  // (In production, this would come from the SSE event bus)
  // For now, we poll or listen for ai_toggled events

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-col flex-1 gap-2 p-0">
        <div className="flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Live Session
            </h2>
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </div>
          <div className="flex gap-2">
            <RaiseHandButton sessionId={params.sessionId} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAi(!showAi)}
            >
              {showAi ? "Hide AI" : "Ask AI"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearOutput}
              disabled={running}
            >
              Clear
            </Button>
            <RunButton
              onRun={() => {
                const currentCode = yText?.toString() || code;
                runCode(currentCode);
              }}
              running={running}
              ready={ready}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 px-4">
          <CodeEditor
            onChange={setCode}
            yText={yText}
            provider={provider}
          />
        </div>

        <div className="h-[200px] shrink-0 px-4 pb-4">
          <OutputPanel output={output} running={running} />
        </div>
      </div>

      {showAi && (
        <div className="w-80 border-l p-2">
          <AiChatPanel
            sessionId={params.sessionId}
            code={yText?.toString() || code}
            enabled={true}
          />
        </div>
      )}
    </div>
  );
}
