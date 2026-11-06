import { z } from "zod";
import { getVenue } from "@/lib/supabase";
import { createCard } from "@/lib/cards";

const JoinInput = z
  .object({
    venue: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(80),
    mobile: z.string().trim().max(30).optional().default(""),
    email: z.string().trim().max(120).optional().default(""),
    terms: z.literal(true),
    news: z.boolean().default(false),
  });

export async function POST(request: Request) {
  const parsed = JoinInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: "incomplete", error: "Please fill in your name, add a mobile number or an email, and accept the terms." }, { status: 400 });
  }
  const { venue: slug, name, mobile, email, news } = parsed.data;

  if (!mobile && !email) {
    return Response.json({ code: "contact_required", error: "Please add at least one: your mobile number or your email." }, { status: 400 });
  }
  if (email && !z.email().safeParse(email).success) {
    return Response.json({ code: "bad_email", error: "That email address doesn't look right." }, { status: 400 });
  }
  if (mobile && !/^\+?[0-9 ()-]{7,20}$/.test(mobile)) {
    return Response.json({ code: "bad_mobile", error: "That mobile number doesn't look right." }, { status: 400 });
  }

  try {
    const venue = await getVenue(slug);
    if (!venue) return Response.json({ code: "venue_unavailable", error: "This venue isn't available." }, { status: 404 });
    const card = await createCard(venue, {
      name,
      phone: mobile ? mobile.replace(/[^\d+]/g, "") : undefined,
      email: email ? email.toLowerCase() : undefined,
      news,
    });
    return Response.json({ cardId: card.id });
  } catch (err) {
    console.error("join failed", err);
    return Response.json({ code: "server", error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
