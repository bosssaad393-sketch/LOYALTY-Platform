import { timingSafeEqual } from "node:crypto";
import { runDailyMessages } from "@/lib/autoMessagesDb";

/**
 * The daily job (Vercel Cron, see vercel.json): birthday and "we miss you" notices.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>". Without a CRON_SECRET the job is off (404), so nobody can
 * trigger it from outside. Running it twice in a day sends nothing twice (message_log is unique per period).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response(null, { status: 401 });
  try {
    return Response.json(await runDailyMessages());
  } catch (e) {
    console.error("daily job failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
