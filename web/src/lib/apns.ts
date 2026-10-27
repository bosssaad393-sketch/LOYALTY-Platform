import "server-only";
import http2 from "node:http2";
import { db } from "./supabase";
import { appleCertificates, appleWalletConfigured } from "./appleWallet";

/**
 * Tells Apple Wallet that a card changed. Apple then calls our web service
 * (/api/applewallet/v1/...) to fetch the new pass. The push itself is empty by design.
 */

function push(tokens: string[]): Promise<{ token: string; status: number }[]> {
  const { signerCert, signerKey } = appleCertificates();
  const topic = process.env.APPLE_PASS_TYPE_ID!;
  return new Promise((resolve) => {
    const client = http2.connect("https://api.push.apple.com", { cert: signerCert, key: signerKey });
    const results: { token: string; status: number }[] = [];
    let pending = tokens.length;
    const finish = () => { client.close(); resolve(results); };
    client.on("error", (e) => { console.error("apns connection failed", e.message); finish(); });
    for (const token of tokens) {
      const req = client.request({ ":method": "POST", ":path": `/3/device/${token}`, "apns-topic": topic, "apns-push-type": "background", "apns-priority": "5" });
      req.on("response", (h) => results.push({ token, status: Number(h[":status"]) }));
      req.on("error", () => results.push({ token, status: 0 }));
      req.on("close", () => { if (--pending === 0) finish(); });
      req.end("{}");
    }
    if (pending === 0) finish();
    setTimeout(finish, 8000).unref();
  });
}

const BATCH = 250;

/**
 * Wakes devices by push token (one push per distinct token), for example after an offer was sent.
 * Best effort: never throws. Returns how many pushes Apple accepted.
 */
export async function notifyAppleTokens(tokens: string[]): Promise<number> {
  if (!appleWalletConfigured()) return 0;
  const unique = [...new Set(tokens)];
  let accepted = 0;
  try {
    for (let i = 0; i < unique.length; i += BATCH) {
      const results = await push(unique.slice(i, i + BATCH));
      accepted += results.filter((r) => r.status === 200).length;
      // 410 = the card was removed from that device: forget the token.
      const gone = results.filter((r) => r.status === 410).map((r) => r.token);
      if (gone.length) await db().from("apple_registrations").delete().in("push_token", gone);
      const failed = results.filter((r) => r.status !== 200 && r.status !== 410);
      if (failed.length) console.error("apns push failed", failed.length, "of", results.length);
    }
  } catch (e) {
    console.error("apple offer push failed", e instanceof Error ? e.message : e);
  }
  return accepted;
}

/** Pushes an update to every device that holds this card. Best effort: never throws. */
export async function notifyAppleDevices(cardId: string): Promise<void> {
  if (!appleWalletConfigured()) return;
  try {
    const { data, error } = await db().from("apple_registrations").select("device_id, push_token").eq("card_id", cardId);
    if (error) throw error;
    const tokens = [...new Set((data ?? []).map((r) => r.push_token))];
    if (tokens.length === 0) return;
    const results = await push(tokens);
    // 410 = the device removed the card or the token expired: forget it.
    const gone = results.filter((r) => r.status === 410).map((r) => r.token);
    if (gone.length) await db().from("apple_registrations").delete().eq("card_id", cardId).in("push_token", gone);
    const failed = results.filter((r) => r.status !== 200 && r.status !== 410);
    if (failed.length) console.error("apns push failed", failed.map((f) => f.status));
  } catch (e) {
    console.error("apple update failed", e instanceof Error ? e.message : e);
  }
}
