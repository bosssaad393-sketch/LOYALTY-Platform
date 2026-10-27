"use client";

import { useState } from "react";
import { Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, Member, Note } from "./types";

type Shown = { who: string; pin: string; what: "new" | "reset" };
type Perk = { id: string; staffId: string; staffName: string; title: string; note: string | null; validUntil: string | null; status: string; createdAt: string; claimedAt: string | null };

const IDEAS = ["Free meal after your shift", "20% off your next visit", "Early finish on your next shift", "A voucher to spend with us"];
const STATUS: Record<string, string> = { ready: "Waiting for them", claimed: "Used", cancelled: "Taken back" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bahrain" });

export default function Team({ call }: { call: Call }) {
  const team = useGet<{ team: Member[] }>(call, "/api/owner/team");
  const perks = useGet<{ perks: Perk[] }>(call, "/api/owner/perks");
  const [note, setNote] = useState<Note | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [rewardFor, setRewardFor] = useState<string | "all" | null>(null);
  const [title, setTitle] = useState("");

  const people = (team.data?.team ?? []).filter((m) => m.active && m.role !== "owner");

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setNote(null); setShown(null);
    const r = await call<{ name: string; pin: string }>("/api/owner/team", "POST", { name: f.get("name"), role: f.get("role") });
    setBusy(false);
    if (r.ok) { setShown({ who: r.data.name, pin: r.data.pin, what: "new" }); form.reset(); team.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function resetPin(m: Member) {
    if (!window.confirm(`Make a new PIN for ${m.name}? The old one stops working at once.`)) return;
    setNote(null); setShown(null);
    const r = await call<{ pin: string }>("/api/owner/team/pin", "POST", { id: m.id });
    if (r.ok) { setShown({ who: m.name, pin: r.data.pin, what: "reset" }); team.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function toggle(m: Member) {
    setNote(null);
    const r = await call("/api/owner/team", "PATCH", { id: m.id, active: !m.active });
    if (r.ok) team.setData((t) => (t ? { team: t.team.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)) } : t));
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function give(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const staffIds = rewardFor === "all" ? people.map((p) => p.id) : rewardFor ? [rewardFor] : [];
    setBusy(true); setNote(null);
    const r = await call<{ given: number }>("/api/owner/perks", "POST", {
      staffIds, title: String(f.get("title") ?? "").trim(), note: String(f.get("note") ?? "").trim() || undefined, validUntil: String(f.get("until") ?? "") || undefined,
    });
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: r.data.given === 1 ? "Reward given. They will see it on their staff screen." : `Reward given to ${r.data.given} people.` }); setRewardFor(null); setTitle(""); perks.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function takeBack(p: Perk) {
    setNote(null);
    const r = await call("/api/owner/perks", "DELETE", { id: p.id });
    if (r.ok) perks.reload(); else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  const target = rewardFor === "all" ? "the whole team" : people.find((p) => p.id === rewardFor)?.name;

  return (
    <>
      <PageHead eyebrow="Access and thanks" title="Team">Everyone signs in with their own PIN. Give a thank-you to the people who earned it, and remove access the day someone leaves.</PageHead>
      {team.error && <LoadError text={team.error} onRetry={team.reload} />}
      {!team.data && !team.error && <Loading />}
      {shown && (
        <div className="ow-msg ok" role="status">
          <p>{shown.what === "new" ? `Added ${shown.who}.` : `New PIN for ${shown.who}.`} Hand it over in person.</p>
          <p className="ow-pin">{shown.pin}</p>
          <p>It is shown only once. They can change it with you at any time.</p>
        </div>
      )}
      <Msg note={note} />
      <div className="ow-grid ow-c2">
        {team.data && (
          <section className="ow-panel ow-flush" aria-label="Team members">
            <ul className="ow-list">
              {team.data.team.map((m) => (
                <li key={m.id} className="ow-item">
                  <span className="ow-item-main">
                    <span className="ow-namerow"><b>{m.name}{m.me ? " (you)" : ""}</b><em className="ow-tag">{m.role}</em>{!m.active && <span className="ow-off">deactivated</span>}</span>
                    <small>{m.hasPin ? "PIN set" : "No PIN yet"}</small>
                  </span>
                  <span className="ow-item-side ow-rowbtns">
                    {m.active && m.role !== "owner" && <button type="button" className="ow-btn small primary" onClick={() => { setRewardFor(m.id); setNote(null); }} aria-label={`Give ${m.name} a reward`}>Give a reward</button>}
                    {m.role !== "owner" && <button type="button" className="ow-btn small" onClick={() => resetPin(m)} aria-label={`New PIN for ${m.name}`}>New PIN</button>}
                    {!m.me && m.role !== "owner" && <button type="button" className="ow-btn small" onClick={() => toggle(m)} aria-label={`${m.active ? "Deactivate" : "Activate"} ${m.name}`}>{m.active ? "Deactivate" : "Activate"}</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <form className="ow-panel" onSubmit={invite} aria-labelledby="ow-h-add">
          <h2 className="ow-h" id="ow-h-add">Add someone</h2>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-name">Name</label><input className="ow-in" id="ow-t-name" name="name" required maxLength={60} autoComplete="off" /></div>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-role">Role</label><select className="ow-in ow-select" id="ow-t-role" name="role" defaultValue="staff"><option value="staff">Staff (4-digit PIN)</option><option value="manager">Manager (6-digit PIN)</option></select></div>
          <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add to team"}</button></div>
        </form>
      </div>

      <section className="ow-panel" aria-labelledby="ow-h-thanks">
        <h2 className="ow-h" id="ow-h-thanks">Thank your team</h2>
        {rewardFor ? (
          <form onSubmit={give}>
            <p className="ow-sub">A reward for <b>{target}</b>. They see it at the end of their shift.</p>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-title">What do they get?</label><input className="ow-in" id="ow-r-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={80} placeholder="For example: free meal after your shift" autoComplete="off" /></div>
            <div className="ow-chips" role="group" aria-label="Ideas">{IDEAS.map((t) => <button key={t} type="button" className="ow-chip" onClick={() => setTitle(t)}>{t}</button>)}</div>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-note">A short thank-you note (optional)</label><input className="ow-in" id="ow-r-note" name="note" maxLength={200} placeholder="Thank you for a great Friday" autoComplete="off" /></div>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-until">Last day to use it (optional)</label><input className="ow-in" id="ow-r-until" name="until" type="date" /></div>
            <div className="ow-actions">
              <button className="ow-btn primary" type="submit" disabled={busy}>{busy ? "Giving…" : "Give reward"}</button>
              <button className="ow-btn" type="button" onClick={() => setRewardFor(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p className="ow-sub">Choose a person above with “Give a reward”, or thank everyone at once.</p>
            <div className="ow-actions"><button className="ow-btn" type="button" disabled={people.length === 0} onClick={() => { setRewardFor("all"); setNote(null); }}>Reward the whole team</button></div>
          </>
        )}
        {perks.data && perks.data.perks.length > 0 && (
          <>
            <h3 className="ow-h">Given so far</h3>
            <ul className="ow-list">
              {perks.data.perks.slice(0, 12).map((p) => (
                <li key={p.id} className="ow-item">
                  <span className="ow-item-main ow-wrap"><b>{p.title}</b> · {p.staffName}<br /><small>{day(p.createdAt)}{p.validUntil ? ` · until ${day(p.validUntil)}` : ""}</small></span>
                  <span className="ow-item-side">{STATUS[p.status] ?? p.status}{p.status === "ready" && <><br /><button type="button" className="ow-btn small" onClick={() => takeBack(p)}>Take back</button></>}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
