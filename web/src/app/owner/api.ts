import type { Res } from "./types";

/** One place that talks to the owner API. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<Res<T>> {
  const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!res) return { ok: false, error: "No connection. Try again.", status: 0 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Something went wrong.", status: res.status };
}
