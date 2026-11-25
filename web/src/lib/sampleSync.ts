import "server-only";
import { sampleMode } from "./demo";
import { sampleCardRows, sampleTakeCard, type SampleCardRows } from "./fakeDb";

/**
 * Sample mode on a host that runs pages and API routes as separate processes: before a page reads a card, it asks the
 * API process for that card's rows and takes them in, so a guest who joined (or was just scanned) a moment ago is on
 * the page. Best effort, two seconds at most, never throws. A real deployment does nothing here.
 */
export async function pullSampleCard(cardId: string): Promise<void> {
  if (!sampleMode()) return;
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return;
  try {
    const res = await fetch(`${base}/api/sample/card/${cardId}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return;
    sampleTakeCard((await res.json()) as SampleCardRows);
  } catch {
    /* the page then shows what this process already knows */
  }
}

export { sampleCardRows };
