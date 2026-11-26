import { z } from "zod";
import { currentStaff, type Staff } from "@/lib/staffAuth";
import { fail } from "@/lib/staffApi";
import { isSubscribed, pushKeys, subscribe, unsubscribe } from "@/lib/staffPush";

/** Whoever is signed in on this device: at the till, or in the owner's dashboard. */
async function who(): Promise<Staff | null> {
  return (await currentStaff("staff")) ?? (await currentStaff("owner"));
}

/** The public key a device needs to ask for alerts, and whether this device (its address in ?endpoint=) already has them. */
export async function GET(request: Request) {
  const staff = await who();
  if (!staff) return fail("Please sign in again.", 401);
  const keys = await pushKeys();
  if (!keys) return Response.json({ available: false });
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  return Response.json({ available: true, publicKey: keys.publicKey, on: endpoint ? await isSubscribed(staff, endpoint) : false }, { headers: { "cache-control": "no-store" } });
}

const Input = z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200).optional(), auth: z.string().max(100).optional() }).optional() });

/** This device wants alerts. Only an address at a phone maker's own push service is kept. */
export async function POST(request: Request) {
  const staff = await who();
  if (!staff) return fail("Please sign in again.", 401);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("This device could not be registered for alerts.");
  return (await subscribe(staff, parsed.data)) ? Response.json({ on: true }) : fail("This device could not be registered for alerts.");
}

/** This device no longer wants alerts. */
export async function DELETE(request: Request) {
  const staff = await who();
  if (!staff) return fail("Please sign in again.", 401);
  const parsed = z.object({ endpoint: z.url().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Nothing to switch off.");
  await unsubscribe(staff, parsed.data.endpoint);
  return Response.json({ on: false });
}
