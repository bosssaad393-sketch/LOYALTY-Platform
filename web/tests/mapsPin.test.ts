import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { pinOfMapsLink } from "../src/lib/mapsPin";

// The owner pastes a Google Maps share link; the server follows it to find the pin. No network here: fetch is a stand-in.

const FULL = "https://www.google.com/maps/place/Al+Roshinah/@26.1501,50.6002,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d26.151234!4d50.601987";
const hop = (to: string | null, status = 302) => new Response(null, { status, headers: to ? { location: to } : {} });

afterEach(() => vi.unstubAllGlobals());

describe("the pin of a pasted Google Maps link", () => {
  it("a full link needs no request at all", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await pinOfMapsLink(FULL)).toEqual({ lat: 26.151234, lng: 50.601987 });
    expect(f).not.toHaveBeenCalled();
  });

  it("a short link is followed one step and the pin is read from where it points", async () => {
    const f = vi.fn(async () => hop(FULL));
    vi.stubGlobal("fetch", f);
    expect(await pinOfMapsLink("https://maps.app.goo.gl/AbCdEf123")).toEqual({ lat: 26.151234, lng: 50.601987 });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
  });

  it("never follows a link away from Google's maps addresses", async () => {
    const f = vi.fn(async () => hop("https://evil.example/@26.1501,50.6002,17z"));
    vi.stubGlobal("fetch", f);
    expect(await pinOfMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(await pinOfMapsLink("https://evil.example/@26.1501,50.6002,17z")).toBeNull();
    expect(await pinOfMapsLink("http://169.254.169.254/latest")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up quietly: no pin, a page instead of a redirect, a loop, or no answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => hop(null, 200)));
    expect(await pinOfMapsLink("https://maps.app.goo.gl/x")).toBeNull();
    const loop = vi.fn(async () => hop("https://maps.app.goo.gl/x"));
    vi.stubGlobal("fetch", loop);
    expect(await pinOfMapsLink("https://maps.app.goo.gl/x")).toBeNull();
    expect(loop).toHaveBeenCalledTimes(4);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await pinOfMapsLink("https://maps.app.goo.gl/x")).toBeNull();
  });
});
