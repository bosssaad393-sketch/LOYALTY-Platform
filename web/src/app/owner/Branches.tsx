"use client";

import { useState, type FormEvent } from "react";
import type { Branch } from "@/lib/branches";
import { Loading, LoadError, Msg, PageHead, Sheet, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";

/** One line of what a place has set up, so a missing menu or review link is seen without opening it. */
function missing(b: Branch): string[] {
  const out: string[] = [];
  if (!b.menuUrl) out.push("menu");
  if (!b.reviewUrl && b.kind === "branch") out.push("review");
  if (b.lat === null) out.push("location");
  return out;
}

/** Owner: the business's places. A branch records visits; a partner counter (a sister restaurant) only redeems gifts. */
export default function Branches({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const t = useT();
  const list = useGet<{ branches: Branch[] }>(call, "/api/owner/branches");
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);

  async function switchOnOff(b: Branch) {
    setBusy(true); setNote(null);
    const r = await call<{ branch: Branch }>("/api/owner/branches", "POST", { ...input(b), active: !b.active });
    setBusy(false);
    if (r.ok) { list.reload(); setNote({ kind: "ok", text: b.active ? t("{name} is switched off. Staff can no longer choose it.", { name: b.name }) : t("{name} is switched on again.", { name: b.name }) }); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  const label = (k: string) => (k === "menu" ? t("no menu link") : k === "review" ? t("no review link") : t("no location"));
  const branches = list.data?.branches ?? [];

  return (
    <>
      <PageHead eyebrow={t("Your places")} title={t("Branches")}>{t("A branch records visits. A partner counter, such as a sister restaurant, only takes gifts.")}</PageHead>
      <Msg note={note} />
      {list.error ? <LoadError text={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
        <section className="ow-panel ow-flush" aria-label={t("Branches")}>
          {branches.length === 0 ? (
            <p className="ow-note ow-pad">{t("No places yet. Add your first branch: guests then see its menu, directions and review link on their card.")}</p>
          ) : (
            <ul className="ow-list">
              {branches.map((b) => (
                <li key={b.id} className={`ow-item${b.active ? "" : " ow-done"}`}>
                  <div className="ow-item-main">
                    <div className="ow-namerow">
                      <b>{(t.lang === "ar" && b.nameAr) || b.name}</b>
                      <span className={`ow-tag${b.kind === "branch" ? "" : " quiet"}`}>{b.kind === "branch" ? t("Branch") : t("Partner counter")}</span>
                      {!b.active && <span className="ow-tag quiet">{t("Off")}</span>}
                    </div>
                    <small>{b.address ?? t("No address yet")}{missing(b).length > 0 && ` · ${missing(b).map(label).join(", ")}`}</small>
                  </div>
                  {isOwner && (
                    <div className="ow-rowbtns">
                      <button type="button" className="ow-btn small" onClick={() => { setNote(null); setEditing(b); }}>{t("Edit")}</button>
                      <button type="button" className="ow-btn small" disabled={busy} onClick={() => switchOnOff(b)}>{b.active ? t("Switch off") : t("Switch on")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {isOwner && list.data && (
        <div className="ow-actions ow-head-act"><button type="button" className="ow-btn primary" onClick={() => { setNote(null); setEditing("new"); }}>{t("Add a place")}</button></div>
      )}
      {editing && (
        <BranchSheet call={call} branch={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(name) => { setEditing(null); list.reload(); setNote({ kind: "ok", text: t("Saved {name}. Guests see the change the next time they open their card.", { name }) }); }} />
      )}
    </>
  );
}

/** What the server takes back for a place (BranchInput in lib/branchesDb.ts). */
function input(b: Branch) {
  return { id: b.id, name: b.name, nameAr: b.nameAr ?? "", kind: b.kind, address: b.address ?? "", phone: b.phone ?? "", mapsUrl: b.mapsUrl ?? "", reviewUrl: b.reviewUrl ?? "", menuUrl: b.menuUrl ?? "", lat: b.lat, lng: b.lng, active: b.active };
}

/**
 * Reads "26.1789, 50.4931" (what Google Maps shows when you press and hold a place) into two numbers. Also takes the
 * two boxes filled separately. Returns null for both when empty, "bad" when it is not two numbers.
 */
export function readLocation(text: string): { lat: number | null; lng: number | null } | "bad" {
  const s = text.trim();
  if (!s) return { lat: null, lng: null };
  const m = s.match(/^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/);
  if (!m) return "bad";
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : "bad";
}

function BranchSheet({ call, branch, onClose, onSaved }: { call: Call; branch: Branch | null; onClose: () => void; onSaved: (name: string) => void }) {
  const t = useT();
  const [kind, setKind] = useState<Branch["kind"]>(branch?.kind ?? "branch");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const where = readLocation(String(f.get("location") ?? ""));
    if (where === "bad") { setNote({ kind: "bad", text: t("Paste the location as two numbers, for example 26.1789, 50.4931.") }); return; }
    const text = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true); setNote(null);
    const r = await call<{ branch: Branch }>("/api/owner/branches", "POST", {
      ...(branch ? { id: branch.id } : {}),
      name: text("name"), nameAr: text("nameAr"), kind, address: text("address"), phone: text("phone"),
      menuUrl: text("menuUrl"), mapsUrl: text("mapsUrl"), reviewUrl: text("reviewUrl"), lat: where.lat, lng: where.lng,
      active: f.get("active") === "on",
    });
    setBusy(false);
    if (r.ok) onSaved(r.data.branch.name);
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <Sheet eyebrow={t("Branches")} title={branch ? t("Edit {name}", { name: branch.name }) : t("Add a place")} onClose={onClose}>
      <form className="ow-sheet-body" onSubmit={save}>
        <div className="ow-sheet-sec">
          <div className="ow-two-in">
            <label className="ow-field">
              <span className="ow-lbl">{t("Name")}</span>
              <input className="ow-in" name="name" required maxLength={80} defaultValue={branch?.name ?? ""} autoComplete="off" />
            </label>
            <label className="ow-field">
              <span className="ow-lbl">{t("Name in Arabic")}</span>
              <input className="ow-in" name="nameAr" dir="rtl" lang="ar" maxLength={80} defaultValue={branch?.nameAr ?? ""} autoComplete="off" />
            </label>
          </div>
          <div className="ow-field" role="group" aria-labelledby="ow-kind-l">
            <span className="ow-lbl" id="ow-kind-l">{t("Kind")}</span>
            <div className="ow-kind">
              <button type="button" className="ow-pill" aria-pressed={kind === "branch"} onClick={() => setKind("branch")}>{t("Branch")}</button>
              <button type="button" className="ow-pill" aria-pressed={kind === "partner"} onClick={() => setKind("partner")}>{t("Partner counter")}</button>
            </div>
            <p className="ow-note">{kind === "branch" ? t("Staff here record visits and can use gifts meant for this branch.") : t("Staff here only use gifts meant for this counter. No visits are recorded.")}</p>
          </div>
        </div>
        <div className="ow-sheet-sec">
          <h3 className="ow-h">{t("For guests")}</h3>
          <label className="ow-field">
            <span className="ow-lbl">{t("Address")}</span>
            <input className="ow-in" name="address" maxLength={200} defaultValue={branch?.address ?? ""} autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Phone")}</span>
            <input className="ow-in" name="phone" type="tel" dir="ltr" inputMode="tel" maxLength={30} defaultValue={branch?.phone ?? ""} placeholder="+973 …" autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Menu link")}</span>
            <input className="ow-in" name="menuUrl" type="url" dir="ltr" inputMode="url" defaultValue={branch?.menuUrl ?? ""} placeholder="https://" autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Google Maps link")}</span>
            <input className="ow-in" name="mapsUrl" type="url" dir="ltr" inputMode="url" defaultValue={branch?.mapsUrl ?? ""} placeholder="https://maps.app.goo.gl/…" autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Google review link")}</span>
            <input className="ow-in" name="reviewUrl" type="url" dir="ltr" inputMode="url" defaultValue={branch?.reviewUrl ?? ""} placeholder="https://g.page/r/…/review" autoComplete="off" />
          </label>
          <p className="ow-note">{t("Every guest sees the review link on their card. It is never tied to a gift.")}</p>
        </div>
        <div className="ow-sheet-sec">
          <h3 className="ow-h">{t("Location for the Wallet card")}</h3>
          <label className="ow-field">
            <span className="ow-lbl">{t("Latitude, longitude")}</span>
            <input className="ow-in" name="location" dir="ltr" inputMode="decimal" defaultValue={branch && branch.lat !== null && branch.lng !== null ? `${branch.lat}, ${branch.lng}` : ""} placeholder="26.1789, 50.4931" autoComplete="off" />
          </label>
          <p className="ow-note">{t("Paste from Google Maps: press and hold the place, then copy the two numbers shown.")}</p>
          <label className="ow-check">
            <input type="checkbox" name="active" defaultChecked={branch?.active ?? true} />
            <span>{t("Switched on (staff can choose it, guests see it)")}</span>
          </label>
        </div>
        <Msg note={note} />
        <div className="ow-actions">
          <button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save")}</button>
          <button className="ow-btn" type="button" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}
