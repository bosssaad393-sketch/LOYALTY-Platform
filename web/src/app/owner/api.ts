import type { Res } from "./types";

/**
 * One place that talks to the owner API.
 *
 * DEVELOPMENT-ONLY MOCK. With `?mock=1` in the address (development server only) the screens run on fake
 * data so every tab can be seen and clicked without a database. This must never run for real users, because it
 * would show invented numbers and pretend that erasures and offers were carried out. So it is guarded twice:
 *   1. page.tsx only passes `mock` when `process.env.NODE_ENV !== "production"` and the address has `mock=1`.
 *   2. This function checks `process.env.NODE_ENV !== "production"` again. The bundler replaces that expression
 *      with a constant, so in a production build the whole branch (and the mock module) is removed.
 */
export async function api<T>(path: string, method = "GET", body?: unknown, mock = false): Promise<Res<T>> {
  if (process.env.NODE_ENV !== "production" && mock) {
    const { mockApi } = await import("./mock");
    return mockApi<T>(path, method, body);
  }
  const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!res) return { ok: false, error: "No connection. Try again.", status: 0 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Something went wrong.", status: res.status };
}
