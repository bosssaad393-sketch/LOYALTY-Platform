import { receiveEvent } from "@/lib/pos/connector";

/**
 * The POS calls this after a sale or refund. No session: the API key in `Authorization: Bearer loy_pos_...` identifies the business.
 * See docs/POS.md for the exact messages.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const r = await receiveEvent(request.headers.get("authorization"), body);
  return Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
}
