import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { aiPlanner } from "../src/lib/assistant/llmPlanner";

// The model is faked: these tests prove what happens with its answers (valid, invalid, hostile, unavailable).

const say = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }), { status: 200 }));

beforeEach(() => { process.env.ASSISTANT_LLM_MODEL = "test-model"; });
afterEach(() => { delete process.env.ASSISTANT_LLM_MODEL; vi.unstubAllGlobals(); });

describe("aiPlanner", () => {
  it("turns free wording into a proposal", async () => {
    vi.stubGlobal("fetch", say({ action: "set_points_rate", pointsPerBhd: 3 }));
    expect(await aiPlanner("make guests earn triple per dinar")).toEqual({ kind: "action", action: { type: "set_points_rate", pointsPerBhd: 3 } });
  });
  it("maps an adjustment with a guest code", async () => {
    vi.stubGlobal("fetch", say({ action: "adjust_points", guestCode: "1234", delta: -20, reason: "mistake" }));
    expect(await aiPlanner("that guest 1234 got 20 too many")).toEqual({ kind: "action", action: { type: "adjust_points", guest: { code: "1234" }, delta: -20, reason: "mistake" } });
  });
  it("never lets the model decide yes/no: rules answer, model not called", async () => {
    const f = say({ action: "set_points_rate", pointsPerBhd: 99 });
    vi.stubGlobal("fetch", f);
    expect((await aiPlanner("yes")).kind).toBe("confirm");
    expect((await aiPlanner("cancel")).kind).toBe("cancel");
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects out-of-range or hostile output and falls back to the rules", async () => {
    for (const bad of [{ action: "set_points_rate", pointsPerBhd: 5000 }, { action: "adjust_points", guestCode: "1234", delta: 999999 }, { action: "delete_everything" }, "not json"]) {
      vi.stubGlobal("fetch", say(bad));
      expect((await aiPlanner("please redesign my logo")).kind).toBe("unsupported");
    }
  });
  it("a guest-less adjustment asks which guest instead of acting", async () => {
    vi.stubGlobal("fetch", say({ action: "adjust_points", delta: 50 }));
    expect((await aiPlanner("give 50 points")).kind).toBe("clarify");
  });
  it("model unreachable or switched off: the rule-based planner still works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await aiPlanner("change the points per BHD to 4")).toEqual({ kind: "action", action: { type: "set_points_rate", pointsPerBhd: 4 } });
    delete process.env.ASSISTANT_LLM_MODEL;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await aiPlanner("change the points per BHD to 4")).kind).toBe("action");
    expect(f).not.toHaveBeenCalled();
  });
  it("sends only the owner's text", async () => {
    const f = say({ action: "unsupported" });
    vi.stubGlobal("fetch", f);
    await aiPlanner("hello there, can you fix my menu");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.stringify(body.messages)).toContain("fix my menu");
    expect(body.model).toBe("test-model");
  });
});
