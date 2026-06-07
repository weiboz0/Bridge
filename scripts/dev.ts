#!/usr/bin/env bun
// Launch the Next.js dev server on NEXTJS_PORT (default 3003).
//
// Why a launcher instead of `next dev -p ${NEXTJS_PORT:-3003}` in package.json:
// Bun auto-loads .env into the *runtime* process.env (this file sees it), but
// the package.json script SHELL that performs ${VAR} expansion does NOT read
// .env — so the inline form always fell back to the 3003 default even when
// NEXTJS_PORT was set. Running through Bun's runtime applies .env before we
// read the port, matching how server/hocuspocus.ts picks up HOCUSPOCUS_PORT.
import { spawn } from "node:child_process";
import { join } from "node:path";

const port = process.env.NEXTJS_PORT ?? "3003";
const nextBin = join(import.meta.dir, "..", "node_modules", ".bin", "next");

const child = spawn(nextBin, ["dev", "-p", port], { stdio: "inherit" });

// Forward termination so Ctrl+C (and `bun --parallel` shutdown) stops Next.
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
