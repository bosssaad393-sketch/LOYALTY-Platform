import "server-only";
import type { Staff } from "./staffAuth";
import { listBranches } from "./branchesDb";
import { workingBranch, type Branch } from "./branches";

/**
 * The branch a staff request is for. The body says which (`asked`); the person's own branch always wins, and nobody
 * can name a branch of another venue. Answers the branch id (null = the venue has no branches) or an error text.
 */
export async function resolveBranch(staff: Staff, asked: string | null | undefined): Promise<{ branchId: string | null; branches: Branch[] } | { error: string; status: number }> {
  const branches = await listBranches(staff.venueId);
  const r = workingBranch(staff.branchId ?? null, asked ?? null, branches);
  if (r === "choose") return { error: "Choose a branch first.", status: 400 };
  if (r === "forbidden") return { error: "You are not signed in for that branch.", status: 403 };
  return { branchId: r, branches };
}
