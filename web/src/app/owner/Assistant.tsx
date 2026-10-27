"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Msg, PageHead } from "./ui";
import type { Call, Note } from "./types";

type Line = { who: "you" | "bot"; text: string };
type Reply = { reply: string; pending?: { id: string; summary: string }; forwarded?: boolean };
type Request = { id: string; message: string; status: string; result: string | null; createdAt: string };

const START: Line = { who: "bot", text: "Hello! Tell me what you would like to change: the reward, the points per BHD, a notification to your guests, or points for one guest. Anything else, I pass to our development team." };

const IDEAS = [
  "Change the points per BHD to 3",
  "Change the reward to a free dessert at 300 points",
  "Send a notification saying Double points this Friday",
  "Add 50 points to card 1234",
  "Change the card design following the season we're in and update it for all customers",
];

const statusLabel = (s: string) => (s === "done" ? "Done" : s === "in_progress" ? "Being worked on" : "With our team");

/** The owner's chat: ask for a change in plain words, say yes, and it is done. What the assistant cannot do goes to the development team. */
export default function Assistant({ call }: { call: Call }) {
  const [lines, setLines] = useState<Line[]>([START]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const end = useRef<HTMLDivElement>(null);

  const loadRequests = useCallback(async () => {
    const r = await call<{ requests: Request[] }>("/api/owner/assistant");
    if (r.ok) setRequests(r.data.requests);
  }, [call]);

  useEffect(() => {
    let live = true;
    call<{ requests: Request[] }>("/api/owner/assistant").then((r) => { if (live && r.ok) setRequests(r.data.requests); });
    return () => { live = false; };
  }, [call]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lines, busy]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setNote(null);
    setLines((l) => [...l, { who: "you", text: m }]);
    setText("");
    const r = await call<Reply>("/api/owner/assistant", "POST", { message: m });
    setBusy(false);
    if (!r.ok) {
      setNote({ kind: "bad", text: r.error });
      return;
    }
    setLines((l) => [...l, { who: "bot", text: r.data.reply }]);
    setPending(r.data.pending ? r.data.pending.id : null);
    if (r.data.forwarded) void loadRequests();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  return (
    <>
      <PageHead eyebrow="Assistant" title="Ask for a change">Write what you need in plain words. I show you the change first, and nothing happens until you say yes.</PageHead>
      <div className="ow-grid ow-c2">
        <section className="ow-panel" aria-label="Chat with the assistant">
          <div className="as-log" role="log" aria-live="polite" aria-label="Conversation">
            {lines.map((l, i) => <p key={i} className={`as-msg ${l.who}`}><span className="sr-only">{l.who === "you" ? "You: " : "Assistant: "}</span>{l.text}</p>)}
            {busy && <p className="as-msg bot as-wait">…</p>}
            <div ref={end} />
          </div>
          {pending && !busy && (
            <div className="ow-actions" role="group" aria-label="Confirm the change">
              <button className="ow-btn primary" type="button" onClick={() => void send("yes")}>Yes, do it</button>
              <button className="ow-btn" type="button" onClick={() => void send("no")}>No, cancel</button>
            </div>
          )}
          <form className="ow-field" onSubmit={submit}>
            <label className="sr-only" htmlFor="as-in">Your message</label>
            <input id="as-in" className="ow-in" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="For example: change the points per BHD to 3" autoComplete="off" />
            <div className="ow-actions">
              <button className="ow-btn primary" type="submit" disabled={busy || !text.trim()}>Send</button>
            </div>
          </form>
          <Msg note={note} />
          <div className="ow-chips" role="group" aria-label="Ideas">
            {IDEAS.map((t) => <button key={t} type="button" className="ow-chip" onClick={() => setText(t)}>{t}</button>)}
          </div>
        </section>

        <section className="ow-panel" aria-labelledby="as-h-req">
          <h2 className="ow-h" id="as-h-req">Requests with our team</h2>
          {requests.length === 0 ? (
            <p className="ow-sub">Nothing yet. If you ask for something I cannot do myself, it appears here and our team takes care of it.</p>
          ) : (
            <ul className="ow-list">
              {requests.map((r) => (
                <li key={r.id} className="ow-item">
                  <span className="ow-item-main ow-wrap">{r.message}{r.result ? <><br /><small>{r.result}</small></> : null}</span>
                  <span className="ow-item-side">{statusLabel(r.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
