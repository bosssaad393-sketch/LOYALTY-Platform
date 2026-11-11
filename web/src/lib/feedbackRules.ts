// Guest feedback: what a guest may send, and the summary the owner sees. Pure, so it can be tested on its own.
import { z } from "zod";

export const FEEDBACK_MAX = 600;

export const FeedbackInput = z.object({
  venue: z.string().regex(/^[a-z0-9-]{1,60}$/),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(FEEDBACK_MAX).default(""),
});

export type FeedbackItem = { id: string; rating: number; message: string; firstName: string | null; createdAt: string };
export type FeedbackView = { count: number; average: number | null; low: number; items: FeedbackItem[] };

/** The owner's view: newest first, the average to one decimal, and how many were 1 or 2 stars. */
export function feedbackView(items: FeedbackItem[]): FeedbackView {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sum = sorted.reduce((s, i) => s + i.rating, 0);
  return {
    count: sorted.length,
    average: sorted.length ? Math.round((sum / sorted.length) * 10) / 10 : null,
    low: sorted.filter((i) => i.rating <= 2).length,
    items: sorted,
  };
}
