"use client";

import { useState } from "react";
import { Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, Member, Note } from "./types";

type Login = { name: string; email: string; password: string };

export default function Team({ call }: { call: Call }) {
  const team = useGet<{ team: Member[] }>(call, "/api/owner/team");
  const [note, setNote] = useState<Note | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setNote(null); setLogin(null);
    const r = await call<Login>("/api/owner/team", "POST", { name: f.get("name"), email: f.get("email"), role: f.get("role") });
    setBusy(false);
    if (r.ok) { setLogin(r.data); form.reset(); team.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function toggle(m: Member) {
    setNote(null);
    const r = await call("/api/owner/team", "PATCH", { id: m.id, active: !m.active });
    if (r.ok) team.setData((t) => (t ? { team: t.team.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)) } : t));
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <>
      <PageHead eyebrow="Access" title="Team">Everyone signs in with their own login. Remove access the day someone leaves.</PageHead>
      {team.error && <LoadError text={team.error} onRetry={team.reload} />}
      {!team.data && !team.error && <Loading />}
      <div className="ow-grid ow-c2">
        {team.data && (
          <section className="ow-panel ow-flush" aria-label="Team members">
            <ul className="ow-list">
              {team.data.team.map((m) => (
                <li key={m.id} className="ow-item">
                  <span className="ow-item-main">
                    <span className="ow-namerow"><b>{m.name}{m.me ? " (you)" : ""}</b><em className="ow-tag">{m.role}</em>{!m.active && <span className="ow-off">deactivated</span>}</span>
                    <small>{m.email}</small>
                  </span>
                  {!m.me && m.role !== "owner" && (
                    <span className="ow-item-side"><button type="button" className="ow-btn small" onClick={() => toggle(m)} aria-label={`${m.active ? "Deactivate" : "Activate"} ${m.name}`}>{m.active ? "Deactivate" : "Activate"}</button></span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <form className="ow-panel" onSubmit={invite} aria-labelledby="ow-h-add">
          <h2 className="ow-h" id="ow-h-add">Add someone</h2>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-name">Name</label><input className="ow-in" id="ow-t-name" name="name" required maxLength={60} autoComplete="off" /></div>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-email">Email</label><input className="ow-in" id="ow-t-email" name="email" type="email" required autoComplete="off" /></div>
          <div className="ow-field"><label className="ow-lbl" htmlFor="ow-t-role">Role</label><select className="ow-in ow-select" id="ow-t-role" name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option></select></div>
          <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add to team"}</button></div>
          <Msg note={note} />
          {login && (
            <div className="ow-msg ok" role="status">
              <p>Login for {login.name}</p>
              <dl className="ow-cred">
                <dt>Email</dt><dd>{login.email}</dd>
                <dt>Password</dt><dd><code>{login.password}</code></dd>
              </dl>
              <p>Hand it over in person. It is shown only once.</p>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
