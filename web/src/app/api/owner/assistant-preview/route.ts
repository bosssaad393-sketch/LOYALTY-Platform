import { z } from "zod";
import { aiPlanner } from "@/lib/assistant/llmPlanner";

const Input = z.object({ message: z.string().min(1).max(2000) });

/**
 * DEVELOPMENT ONLY. Lets the demo screen (/owner?mock=1) show what the AI planner understood, without a database or sign-in.
 * It only reads the plan; it changes nothing. Returns 404 in production.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a message first." }, { status: 400 });
  return Response.json(await aiPlanner(parsed.data.message));
}
