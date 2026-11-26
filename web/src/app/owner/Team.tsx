"use client";

import { useState } from "react";
import QrSvg from "@/components/QrSvg";
import { bahrainDay } from "@/lib/format";
import { Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, Member, Note } from "./types";
import { useT } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";
import type { Branch } from "@/lib/branches";
import TrustedTills from "./TrustedTills";

type Shown = { who: string; pin: string; what: "new" | "reset" };
type Perk = { id: string; staffId: string; staffName: string; title: string; note: string | null; validUntil: string | null; status: string; createdAt: string; claimedAt: string | null };

const IDEAS = [tx("Free meal after your shift"), tx("20% off your next visit"), tx("Early finish on your next shift"), tx("A voucher to spend with us")];
const STATUS: Record<string, string> = { ready: tx("Waiting for them"), claimed: tx("Used"), cancelled: tx("Taken back") };
const ROLE: Record<string, string> = { owner: tx("owner"), manager: tx("manager"), staff: tx("staff"), developer: tx("developer") };
const day = bahrainDay;

export default function Team({ call }: { call: Call }) {
  const team = useGet<{ team: Member[] }>(call, "/api/owner/team");
  const perks = useGet<{ perks: Perk[] }>(call, "/api/owner/perks");
  // Venues with branches (0022): where each person works. No branches = nothing new on this screen.
  const places = useGet<{ branches: Branch[] }>(call, "/api/owner/branches");
  const branches = places.data?.branches ?? [];
  const [note, setNote] = useState<Note | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [rewardFor, setRewardFor] = useState<string | "all" | null>(null);
  const [title, setTitle] = useState("");
  const t = useT();

  const people = (team.data?.team ?? []).filter((m) => m.active && m.role !== "owner");

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setNote(null); setShown(null);
    const where = String(f.get("branchId") ?? "");
    const r = await call<{ name: string; pin: string }>("/api/owner/team", "POST", { name: f.get("name"), role: f.get("role"), pin: String(f.get("pin") ?? "").trim() || undefined, ...(branches.length ? { branchId: where || null } : {}) });
    setBusy(false);
    if (r.ok) { setShown({ who: r.data.name, pin: r.data.pin, what: "new" }); form.reset(); team.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function resetPin(m: Member) {
    if (!window.confirm(t("Make a new PIN for {name}? The old one stops working at once.", { name: m.name }))) return;
    setNote(null); setShown(null);
    const r = await call<{ pin: string }>("/api/owner/team/pin", "POST", { id: m.id });
    if (r.ok) { setShown({ who: m.name, pin: r.data.pin, what: "reset" }); team.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function toggle(m: Member) {
    setNote(null);
    const r = await call("/api/owner/team", "PATCH", { id: m.id, active: !m.active });
    if (r.ok) team.setData((t) => (t ? { team: t.team.map((x) => (x.id === m.id ? { ...x, active: !x.active, waiting: false } : x)) } : t));
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function move(m: Member, branchId: string | null) {
    setNote(null);
    const r = await call("/api/owner/team", "PATCH", { id: m.id, branchId });
    if (r.ok) {
      team.setData((d) => (d ? { team: d.team.map((x) => (x.id === m.id ? { ...x, branchId } : x)) } : d));
      setNote({ kind: "ok", text: t("{name} now works at: {place}.", { name: m.name, place: placeLabel(branchId) }) });
    } else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  function placeLabel(id: string | null) {
    const b = branches.find((x) => x.id === id);
    return b ? (t.lang === "ar" && b.nameAr) || b.name : t("Every branch");
  }

  async function decline(m: Member) {
    if (!window.confirm(t("Turn down {name}? They will be removed.", { name: m.name }))) return;
    setNote(null);
    const r = await call("/api/owner/team", "DELETE", { id: m.id });
    if (r.ok) team.setData((t) => (t ? { team: t.team.filter((x) => x.id !== m.id) } : t));
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
    if (r.ok) { setNote({ kind: "ok", text: r.data.given === 1 ? t("Reward given. They will see it on their staff screen.") : t("Reward given to {n} people.", { n: r.data.given }) }); setRewardFor(null); setTitle(""); perks.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function takeBack(p: Perk) {
    setNote(null);
    const r = await call("/api/owner/perks", "DELETE", { id: p.id });
    if (r.ok) perks.reload(); else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  const target = rewardFor === "all" ? t("the whole team") : people.find((p) => p.id === rewardFor)?.name;

  return (
    <>
      <PageHead eyebrow={t("Access and thanks")} title={t("Team")}>{t("Everyone signs in with their own PIN. Give a thank-you to the people who earned it, and remove access the day someone leaves.")}</PageHead>
      {team.error && <LoadError text={team.error} onRetry={team.reload} />}
      {!team.data && !team.error && <Loading />}
      {shown && (
        <div className="ow-msg ok" role="status">
          <p>{shown.what === "new" ? t("Added {name}.", { name: shown.who }) : t("New PIN for {name}.", { name: shown.who })} {t("Hand it over in person.")}</p>
          <p className="ow-pin" dir="ltr">{shown.pin}</p>
          <p>{t("It is shown only once. They can change it with you at any time.")}</p>
        </div>
      )}
      <Msg note={note} />
      <div className="ow-grid ow-c2">
        {team.data && (
          <section className="ow-panel ow-flush" aria-label={t("Team members")}>
            <ul className="ow-list">
              {[...team.data.team].sort((a, b) => Number(!!b.waiting) - Number(!!a.waiting)).map((m) => (
                <li key={m.id} className="ow-item">
                  <span className="ow-item-main">
                    <span className="ow-namerow"><b>{m.name}{m.me ? ` (${t("you")})` : ""}</b><em className="ow-tag">{t(ROLE[m.role] ?? m.role)}</em>{!m.active && !m.waiting && <span className="ow-off">{t("deactivated")}</span>}</span>
                    <small>{m.waiting ? t("Joined by link, waiting for you") : m.hasPin ? t("PIN set") : t("No PIN yet")}</small>
                    {branches.length > 0 && m.role !== "owner" && (
                      <label className="ow-works">
                        <span>{t("Works at")}</span>
                        <BranchSelect branches={branches} value={m.branchId ?? null} onChange={(id) => move(m, id)} />
                      </label>
                    )}
                  </span>
                  <span className="ow-item-side ow-rowbtns">
                    {m.waiting && <button type="button" className="ow-btn small primary" onClick={() => toggle(m)} aria-label={t("Approve {name}", { name: m.name })}>{t("Approve")}</button>}
                    {m.waiting && <button type="button" className="ow-btn small" onClick={() => decline(m)} aria-label={t("Turn down {name}", { name: m.name })}>{t("Turn down")}</button>}
                    {m.active && m.role !== "owner" && <button type="button" className="ow-btn small primary" onClick={() => { setRewardFor(m.id); setNote(null); }} aria-label={t("Give {name} a reward", { name: m.name })}>{t("Give a reward")}</button>}
                    {m.role !== "owner" && !m.waiting && <button type="button" className="ow-btn small" onClick={() => resetPin(m)} aria-label={t("New PIN for {name}", { name: m.name })}>{t("New PIN")}</button>}
                    {!m.me && m.role !== "owner" && !m.waiting && <button type="button" className="ow-btn small" onClick={() => toggle(m)} aria-label={`${m.active ? t("Deactivate") : t("Activate")} ${m.name}`}>{m.active ? t("Deactivate") : t("Activate")}</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="ow-stack">
        <JoinLink call={call} />
        <form className="ow-panel" onSubmit={invite} aria-labelledby="ow-h-add">
          <h2 className="ow-h" id="ow-h-add">{t("Add someone yourself")}</h2>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-name">{t("Name")}</label><input className="ow-in" id="ow-t-name" name="name" required maxLength={60} autoComplete="off" /></div>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-role">{t("Role")}</label><select className="ow-in ow-select" id="ow-t-role" name="role" defaultValue="staff"><option value="staff">{t("Staff (4-digit PIN)")}</option><option value="manager">{t("Manager (6-digit PIN)")}</option></select></div>
          {branches.length > 0 && (
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-branch">{t("Works at")}</label><BranchSelect id="ow-t-branch" name="branchId" branches={branches} value={null} /></div>
          )}
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-pin">{t("PIN (optional)")}</label><input className="ow-in" id="ow-t-pin" name="pin" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="off" /><small>{t("Staff 4 digits, manager 6. Leave empty for a random one. It stays the same until you press New PIN.")}</small></div>
          <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Adding…") : t("Add to team")}</button></div>
        </form>
        </div>
      </div>

      <div style={{ marginBlockEnd: 16 }}><TrustedTills call={call} /></div>

      <section className="ow-panel" aria-labelledby="ow-h-thanks">
        <h2 className="ow-h" id="ow-h-thanks">{t("Thank your team")}</h2>
        {rewardFor ? (
          <form onSubmit={give}>
            <p className="ow-sub">{t("A reward for {name}. They see it at the end of their shift.", { name: target ?? "" })}</p>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-title">{t("What do they get?")}</label><input className="ow-in" id="ow-r-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={80} placeholder={t("For example: free meal after your shift")} autoComplete="off" /></div>
            <div className="ow-chips" role="group" aria-label={t("Ideas")}>{IDEAS.map((idea) => <button key={idea} type="button" className="ow-chip" onClick={() => setTitle(t(idea))}>{t(idea)}</button>)}</div>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-note">{t("A short thank-you note (optional)")}</label><input className="ow-in" id="ow-r-note" name="note" maxLength={200} placeholder={t("Thank you for a great Friday")} autoComplete="off" /></div>
            <div className="ow-field"><label className="ow-lbl" htmlFor="ow-r-until">{t("Last day to use it (optional)")}</label><input className="ow-in" id="ow-r-until" name="until" type="date" /></div>
            <div className="ow-actions">
              <button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Giving…") : t("Give reward")}</button>
              <button className="ow-btn" type="button" onClick={() => setRewardFor(null)}>{t("Cancel")}</button>
            </div>
          </form>
        ) : (
          <>
            <p className="ow-sub">{t("Choose a person above with “Give a reward”, or thank everyone at once.")}</p>
            <div className="ow-actions"><button className="ow-btn" type="button" disabled={people.length === 0} onClick={() => { setRewardFor("all"); setNote(null); }}>{t("Reward the whole team")}</button></div>
          </>
        )}
        {perks.data && perks.data.perks.length > 0 && (
          <>
            <h3 className="ow-h">{t("Given so far")}</h3>
            <ul className="ow-list">
              {perks.data.perks.slice(0, 12).map((p) => (
                <li key={p.id} className="ow-item">
                  <span className="ow-item-main ow-wrap"><b>{p.title}</b> · {p.staffName}<br /><small>{day(p.createdAt)}{p.validUntil ? ` · ${t("until {date}", { date: day(p.validUntil) })}` : ""}</small></span>
                  <span className="ow-item-side">{STATUS[p.status] ? t(STATUS[p.status]) : p.status}{p.status === "ready" && <><br /><button type="button" className="ow-btn small" onClick={() => takeBack(p)}>{t("Take back")}</button></>}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

/** One link or QR code for the whole team: people add themselves, then appear above for approval. */
function JoinLink({ call }: { call: Call }) {
  const [link, setLink] = useState<{ url: string; until: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const t = useT();

  async function make() {
    setBusy(true); setNote(null);
    const r = await call<{ path: string; expiresAt: string }>("/api/owner/team/invite", "GET");
    setBusy(false);
    if (!r.ok) { if (r.status !== 401) setNote({ kind: "bad", text: r.error }); return; }
    const url = `${window.location.origin}${r.data.path}`;
    setLink({ url, until: day(r.data.expiresAt) });
  }

  async function share(url: string) {
    setNote(null);
    if (navigator.share) { await navigator.share({ title: t("Join the team"), url }).catch(() => {}); return; }
    const copied = await navigator.clipboard?.writeText(url).then(() => true, () => false);
    setNote(copied ? { kind: "ok", text: t("Link copied.") } : { kind: "bad", text: t("Could not copy. Press and hold the QR code instead.") });
  }

  return (
    <section className="ow-panel" aria-labelledby="ow-h-link">
      <h2 className="ow-h" id="ow-h-link">{t("Team join link")}</h2>
      <p className="ow-sub">{t("Share one link. People add themselves and get their own PIN, then you approve them with one tap.")}</p>
      <Msg note={note} />
      {link ? (
        <div className="ow-joinlink">
          <QrSvg text={link.url} label={t("QR code for the team join link")} />
          <p className="ow-note">{t("Works until {date}.", { date: link.until })}</p>
          <div className="ow-actions"><button type="button" className="ow-btn primary" onClick={() => share(link.url)}>{t("Share link")}</button></div>
        </div>
      ) : (
        <div className="ow-actions"><button type="button" className="ow-btn primary" disabled={busy} onClick={make}>{busy ? t("Making…") : t("Make join link")}</button></div>
      )}
    </section>
  );
}

/**
 * Where a person works: one of the venue's places, or every branch. A partner counter is marked "redeems only".
 * Controlled when `onChange` is given (a team row), a plain form field otherwise (the add form).
 */
function BranchSelect({ branches, value, onChange, id, name }: { branches: Branch[]; value: string | null; onChange?: (id: string | null) => void; id?: string; name?: string }) {
  const t = useT();
  const label = (b: Branch) => [(t.lang === "ar" && b.nameAr) || b.name, b.kind === "partner" ? t("(redeems only)") : "", b.active ? "" : t("(off)")].filter(Boolean).join(" ");
  if (onChange) {
    return (
      <select className="ow-in ow-select" id={id} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t("Every branch")}</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
      </select>
    );
  }
  return (
    <select className="ow-in ow-select" id={id} name={name} defaultValue="">
      <option value="">{t("Every branch")}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
    </select>
  );
}
