"use client";

import { useCallback, useState, type FormEvent } from "react";
import { filsText, type DayPart, type WaitMeasure } from "@/lib/table/rules";
import type { MenuView } from "@/lib/table/db";
import QrSvg from "@/components/QrSvg";
import { Confirm, LoadError, Loading, Msg, PageHead, useGet } from "./ui";
import type { Call, Note } from "./types";
import { filsMoney } from "@/lib/format";

type Avg = { count: number; avgMinutes: number | null };
type Report = {
  range: string;
  rounds: number;
  waits: ({ part: DayPart } & Record<WaitMeasure, Avg>)[];
  sales: { totalFils: number; perHour: { hour: number; fils: number }[]; items: { name: string; qty: number; fils: number }[] };
};
type Table = { id: string; label: string; token: string };
type View = "report" | "menu" | "tables";

const money = filsMoney;
const PARTS: Record<DayPart, string> = { morning: "Morning (6 to 12)", afternoon: "Afternoon (12 to 18)", evening: "Evening (18 to 24)", late: "Late (0 to 6)" };
const MEASURES: [WaitMeasure, string][] = [["accept", "Round accepted"], ["ready", "Round ready"], ["coal", "Coal"], ["waiter", "Waiter"], ["bill", "Bill"]];

export default function Service({ call }: { call: Call }) {
  const [view, setView] = useState<View>("report");
  return (
    <>
      <PageHead eyebrow="Table service" title="Tables and menu">How long each table waited, what sold, your menu, and the QR code for each table.</PageHead>
      <div className="ow-actions" role="group" aria-label="Table service sections" style={{ marginBottom: 16 }}>
        {([["report", "Wait times and sales"], ["menu", "Menu"], ["tables", "Tables"]] as [View, string][]).map(([v, label]) => (
          <button key={v} type="button" className={`ow-btn small${view === v ? " primary" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>
      {view === "report" && <ReportView call={call} />}
      {view === "menu" && <MenuEditor call={call} />}
      {view === "tables" && <Tables call={call} />}
    </>
  );
}

function ReportView({ call }: { call: Call }) {
  const [range, setRange] = useState("7d");
  const report = useGet<Report>(call, `/api/owner/service?range=${range}`);
  const r = report.data;
  const busiest = r ? Math.max(...r.sales.perHour.map((h) => h.fils), 1) : 1;
  const hours = r ? r.sales.perHour.filter((h) => h.fils > 0) : [];
  const timed = r ? r.waits.filter((w) => MEASURES.some(([m]) => w[m].count > 0)) : [];

  return (
    <>
      <div className="ow-actions" role="group" aria-label="Period" style={{ marginBottom: 16 }}>
        {[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"]].map(([v, label]) => (
          <button key={v} type="button" className={`ow-btn small${range === v ? " primary" : ""}`} aria-pressed={range === v} onClick={() => setRange(v)}>{label}</button>
        ))}
      </div>
      {report.error && <LoadError text={report.error} onRetry={report.reload} />}
      {!r && !report.error && <Loading />}
      {r && (
        <div className="ow-grid">
          <section className="ow-panel" aria-labelledby="ow-h-wait">
            <h2 className="ow-h" id="ow-h-wait">Average wait, in minutes</h2>
            {timed.length === 0 ? <p className="ow-note">Nothing timed in this period yet.</p> : (
              <div className="ow-grid">
                {timed.map((w) => (
                  <div key={w.part}>
                    <h3 className="ow-lbl">{PARTS[w.part]}</h3>
                    <ul className="ow-list">
                      {MEASURES.filter(([m]) => w[m].count > 0).map(([m, label]) => (
                        <li key={m} className="ow-item">
                          <span className="ow-item-main">{label}<small> ({w[m].count} timed)</small></span>
                          <span className="ow-item-side ow-fig">{w[m].avgMinutes} min</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="ow-note">A low count means the average can mislead. Times are from the guest&apos;s tap to staff pressing the button, so they rely on staff pressing it on time.</p>
          </section>

          <div className="ow-grid ow-c2">
            <section className="ow-panel" aria-labelledby="ow-h-items">
              <h2 className="ow-h" id="ow-h-items">Sales by item</h2>
              <p className="ow-note">{money(r.sales.totalFils)} ordered in {r.rounds} {r.rounds === 1 ? "round" : "rounds"}, cancelled rounds left out. This is ordered value, not money received.</p>
              {r.sales.items.length === 0 ? <p className="ow-note">No orders in this period.</p> : (
                <ul className="ow-list">
                  {r.sales.items.map((i) => <li key={i.name} className="ow-item"><span className="ow-item-main">{i.qty}× {i.name}</span><span className="ow-item-side ow-fig">{filsText(i.fils)}</span></li>)}
                </ul>
              )}
            </section>
            <section className="ow-panel" aria-labelledby="ow-h-hours">
              <h2 className="ow-h" id="ow-h-hours">Sales by hour</h2>
              {hours.length === 0 ? <p className="ow-note">No orders in this period.</p> : (
                <ul className="ow-list">
                  {hours.map((h) => (
                    <li key={h.hour} className="ow-item">
                      <span className="ow-item-main">{String(h.hour).padStart(2, "0")}:00</span>
                      <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: "var(--r-xs)", background: "var(--surface2)" }}><i style={{ display: "block", height: 8, borderRadius: "var(--r-xs)", width: `${(h.fils / busiest) * 100}%`, background: "var(--gold)" }} /></span>
                      <span className="ow-item-side ow-fig">{filsText(h.fils)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function MenuEditor({ call }: { call: Call }) {
  const menu = useGet<{ menu: MenuView }>(call, "/api/owner/menu");
  const [note, setNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropping, setDropping] = useState<{ id: string; name: string } | null>(null);

  const send = useCallback(async (method: string, body: unknown, done: string) => {
    setNote(null);
    const r = await call<{ menu: MenuView }>("/api/owner/menu", method, body);
    if (r.ok) { menu.setData(r.data); setNote({ kind: "ok", text: done }); return true; }
    if (r.status !== 401) setNote({ kind: "bad", text: r.error });
    return false;
  }, [call, menu]);

  async function photo(id: string, file: File | undefined) {
    if (!file) return;
    setNote(null);
    const image = await shrinkPhoto(file).catch(() => null);
    if (!image) { setNote({ kind: "bad", text: "That file could not be read. Please choose a JPEG, PNG or WebP photo." }); return; }
    const r = await call<{ menu: MenuView }>("/api/owner/menu/photo", "POST", { id, image });
    if (r.ok) { menu.setData(r.data); setNote({ kind: "ok", text: "Photo saved." }); } else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function dropPhoto(id: string) {
    setNote(null);
    const r = await call<{ menu: MenuView }>("/api/owner/menu/photo", "DELETE", { id });
    if (r.ok) { menu.setData(r.data); setNote({ kind: "ok", text: "Photo removed." }); } else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function addCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (await send("POST", { kind: "category", nameEn: text(f, "nameEn"), nameAr: text(f, "nameAr") }, "Section added.")) form.reset();
  }

  async function addItem(e: FormEvent<HTMLFormElement>, categoryId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (await send("POST", { kind: "item", categoryId, nameEn: text(f, "nameEn"), nameAr: text(f, "nameAr"), price: text(f, "price") }, "Item added.")) form.reset();
  }

  async function saveItem(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await send("PATCH", { id, nameEn: text(f, "nameEn"), nameAr: text(f, "nameAr"), noteEn: text(f, "noteEn"), noteAr: text(f, "noteAr"), price: text(f, "price") }, "Saved.")) setEditing(null);
  }

  if (menu.error) return <LoadError text={menu.error} onRetry={menu.reload} />;
  if (!menu.data) return <Loading />;

  return (
    <div className="ow-grid">
      {dropping && (
        <Confirm title={`Remove ${dropping.name}?`} confirmLabel="Remove it" danger onConfirm={() => { const d = dropping; setDropping(null); void send("DELETE", { id: d.id }, "Item removed from the menu."); }} onClose={() => setDropping(null)}>
          <p className="ow-note ow-dialog-text">It leaves the guest menu and the staff board. To hide it for one evening, mark it sold out instead.</p>
        </Confirm>
      )}
      <Msg note={note} />
      {menu.data.menu.map((c) => (
        <section key={c.id} className="ow-panel" aria-label={c.nameEn}>
          <h2 className="ow-h">{c.nameEn}{c.nameAr ? ` · ${c.nameAr}` : ""}</h2>
          <ul className="ow-list">
            {c.items.map((i) => (
              <li key={i.id} className="ow-item">
                {editing === i.id ? (
                  <form style={{ flex: 1, display: "grid", gap: 12 }} onSubmit={(e) => saveItem(e, i.id)}>
                    <Field label="Name (English)" name="nameEn" value={i.nameEn} required />
                    <Field label="Name (Arabic)" name="nameAr" value={i.nameAr ?? ""} dir="rtl" />
                    <Field label="Note (English, optional)" name="noteEn" value={i.noteEn ?? ""} />
                    <Field label="Note (Arabic, optional)" name="noteAr" value={i.noteAr ?? ""} dir="rtl" />
                    <Field label="Price in BHD" name="price" value={filsText(i.priceFils)} required inputMode="decimal" />
                    <div className="ow-field">
                      <span className="ow-lbl">Photo</span>
                      {i.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element -- venue photos live in the venue's own storage */
                        <img src={i.imageUrl} alt={`Current photo of ${i.nameEn}`} width={120} height={120} style={{ borderRadius: "var(--r-tight)", objectFit: "cover" }} />
                      )}
                      <div className="ow-actions">
                        <label className="ow-btn small">
                          {i.imageUrl ? "Change photo" : "Add photo"}
                          <input className="ow-sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void photo(i.id, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {i.imageUrl && <button className="ow-btn small" type="button" onClick={() => dropPhoto(i.id)}>Remove photo</button>}
                      </div>
                    </div>
                    <div className="ow-actions">
                      <button className="ow-btn small primary" type="submit">Save</button>
                      <button className="ow-btn small" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="ow-btn small danger" type="button" onClick={() => setDropping({ id: i.id, name: i.nameEn })}>Remove</button>
                    </div>
                  </form>
                ) : (
                  <>
                    {i.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element -- venue photos live in the venue's own storage */
                      <img src={i.imageUrl} alt="" width={56} height={56} loading="lazy" style={{ flex: "none", borderRadius: "var(--r-tight)", objectFit: "cover" }} />
                    )}
                    <span className="ow-item-main"><b>{i.nameEn}</b>{!i.nameAr && <small> · no Arabic name yet</small>}{i.nameAr && <small> · {i.nameAr}</small>}{!i.available && <small> · sold out</small>}</span>
                    <span className="ow-item-side ow-rowbtns"><span className="ow-fig">{filsText(i.priceFils)}</span><button type="button" className="ow-btn small" aria-label={`Edit ${i.nameEn}`} onClick={() => setEditing(i.id)}>Edit</button></span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="ow-grid" onSubmit={(e) => addItem(e, c.id)} aria-label={`Add an item to ${c.nameEn}`}>
            <Field label="New item (English)" name="nameEn" required />
            <Field label="Arabic name (optional)" name="nameAr" dir="rtl" />
            <Field label="Price in BHD" name="price" required inputMode="decimal" />
            <div className="ow-actions"><button className="ow-btn small" type="submit">Add item</button></div>
          </form>
        </section>
      ))}
      <form className="ow-panel" onSubmit={addCategory} aria-labelledby="ow-h-sec">
        <h2 className="ow-h" id="ow-h-sec">Add a menu section</h2>
        <Field label="Section name (English)" name="nameEn" required />
        <Field label="Section name (Arabic, optional)" name="nameAr" dir="rtl" />
        <div className="ow-actions"><button className="ow-btn primary" type="submit">Add section</button></div>
      </form>
    </div>
  );
}

/** Square crop from the centre, 640 px, WebP where the browser can make it (JPEG otherwise). Keeps uploads small on venue wifi. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(640, side);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.8);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.82);
}

function Field({ label, name, value, required, dir, inputMode }: { label: string; name: string; value?: string; required?: boolean; dir?: string; inputMode?: "decimal" }) {
  return (
    <label className="ow-field">
      <span className="ow-lbl">{label}</span>
      <input className="ow-in" name={name} defaultValue={value} required={required} dir={dir} inputMode={inputMode} autoComplete="off" />
    </label>
  );
}

function Tables({ call }: { call: Call }) {
  const tables = useGet<{ tables: Table[] }>(call, "/api/owner/tables");
  const [note, setNote] = useState<Note | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [dropping, setDropping] = useState<{ id: string; label: string } | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setNote(null);
    const r = await call<{ tables: Table[] }>("/api/owner/tables", "POST", { label: text(new FormData(form), "label") });
    if (r.ok) { tables.setData(r.data); form.reset(); } else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  async function remove(id: string) {
    setNote(null);
    const r = await call<{ tables: Table[] }>("/api/owner/tables", "DELETE", { id });
    if (r.ok) { tables.setData(r.data); setNote({ kind: "ok", text: "Table removed. Its QR code no longer works." }); } else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  if (tables.error) return <LoadError text={tables.error} onRetry={tables.reload} />;
  if (!tables.data) return <Loading />;

  return (
    <div className="ow-grid ow-c2">
      <section className="ow-panel ow-flush" aria-label="Tables">
        {dropping && (
          <Confirm title={`Remove table ${dropping.label}?`} confirmLabel="Remove it" danger onConfirm={() => { const d = dropping; setDropping(null); void remove(d.id); }} onClose={() => setDropping(null)}>
            <p className="ow-note ow-dialog-text">The QR code printed for this table stops working. A new table gets a new code to print.</p>
          </Confirm>
        )}
        <Msg note={note} />
        <ul className="ow-list">
          {tables.data.tables.map((t) => (
            <li key={t.id} className="ow-item" style={{ flexWrap: "wrap" }}>
              <span className="ow-item-main"><b>Table {t.label}</b></span>
              <span className="ow-item-side ow-rowbtns">
                <button type="button" className="ow-btn small" aria-expanded={shown === t.id} onClick={() => setShown(shown === t.id ? null : t.id)}>QR code</button>
                <a className="ow-btn small" href={`/owner/qr-kit?table=${t.id}`} target="_blank" rel="noreferrer" aria-label={`Print the card for table ${t.label}`}>Print card</a>
                <button type="button" className="ow-btn small danger" aria-label={`Remove table ${t.label}`} onClick={() => setDropping({ id: t.id, label: t.label })}>Remove</button>
              </span>
              {shown === t.id && <TableQr token={t.token} label={t.label} />}
            </li>
          ))}
          {tables.data.tables.length === 0 && <li className="ow-item"><span className="ow-note">No tables yet. Add the first one.</span></li>}
        </ul>
      </section>
      <form className="ow-panel" onSubmit={add} aria-labelledby="ow-h-addt">
        <h2 className="ow-h" id="ow-h-addt">Add a table</h2>
        <Field label="Table name" name="label" required />
        <p className="ow-note">A short name guests and staff both know, for example 4 or Terrace 2.</p>
        <div className="ow-actions"><button className="ow-btn primary" type="submit">Add table</button></div>
        <h2 className="ow-h" style={{ marginTop: 24 }}>QR kit</h2>
        <p className="ow-note">A card for every table and one for the counter, four to an A4 sheet. Print it here or save it as a PDF for a print shop.</p>
        <div className="ow-actions"><a className="ow-btn" href="/owner/qr-kit" target="_blank" rel="noreferrer">Open the QR kit</a></div>
      </form>
    </div>
  );
}

function TableQr({ token, label }: { token: string; label: string }) {
  const [url] = useState(() => `${window.location.origin}/t/${token}`);
  return (
    <div style={{ width: "100%", display: "grid", gap: 10, justifyItems: "start" }}>
      <QrSvg text={url} label={`QR code for table ${label}`} />
      <a className="ow-note" href={url} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{url}</a>
    </div>
  );
}
