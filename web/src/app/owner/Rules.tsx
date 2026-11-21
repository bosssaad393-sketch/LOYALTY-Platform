"use client";

import { useState, type FormEvent } from "react";
import { n } from "./format";
import { RewardFields, RewardState, useRewardEditor } from "./RewardForm";
import { Msg, PageHead, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";

export default function Rules({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const editor = useRewardEditor(call);
  const t = useT();

  return (
    <>
      <PageHead eyebrow={t("Programme")} title={t("Rules")}>{t("Changes apply from the next visit. Guests keep the points or stamps they have.")}</PageHead>
      <RewardState editor={editor}>
        {(rules) => (
          <div className="ow-grid ow-c2">
            <section className="ow-panel" aria-label={t("Edit the rules")}>
              <RewardFields editor={editor} rules={rules} isOwner={isOwner} />
            </section>
            <section className="ow-panel" aria-labelledby="ow-h-means">
              <h2 className="ow-h" id="ow-h-means">{t("What this means")}</h2>
              {rules.stampTiers ? (
                <ul className="ow-list">
                  {rules.stampTiers.map((x) => (
                    <li key={x.at} className="ow-item"><span className="ow-item-main">{t("{n} stamps", { n: x.at })}</span><span className="ow-item-side ow-wrap">{(t.lang === "ar" && x.ar) || x.text}</span></li>
                  ))}
                  <li className="ow-item"><span className="ow-item-main">{t("A guest who comes twice a month gets a reward about every")}</span><span className="ow-item-side ow-fig">{t("6 weeks")}</span></li>
                </ul>
              ) : (
                <ul className="ow-list">
                  <li className="ow-item"><span className="ow-item-main">{t("A bill of BHD 10")}</span><span className="ow-item-side ow-fig">{t("{n} points", { n: n(10 * rules.pointsPerBhd) })}</span></li>
                  <li className="ow-item"><span className="ow-item-main">{t("A reward is reached after about")}</span><span className="ow-item-side ow-fig">{t("BHD {n}", { n: n(Math.ceil(rules.rewardGoal / rules.pointsPerBhd)) })}</span></li>
                  <li className="ow-item"><span className="ow-item-main">{t("Reward")}</span><span className="ow-item-side ow-wrap">{rules.rewardText}</span></li>
                </ul>
              )}
            </section>
          </div>
        )}
      </RewardState>
      <Links call={call} isOwner={isOwner} />
    </>
  );
}

type VenueLinks = { instagram: string | null; googleReview: string | null };

/** The venue's Instagram and Google review links, shown at the foot of the guest home page. Empty = not shown. */
function Links({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const links = useGet<VenueLinks>(call, "/api/owner/links");
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setNote(null);
    const r = await call<VenueLinks>("/api/owner/links", "POST", { instagram: String(f.get("instagram") ?? ""), googleReview: String(f.get("googleReview") ?? "") });
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: t("Saved. The guest home page shows them now.") }); links.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <form className="ow-panel" style={{ marginTop: 16 }} onSubmit={save} aria-labelledby="ow-h-links">
      <h2 className="ow-h" id="ow-h-links">{t("Links on your guest page")}</h2>
      <p className="ow-note">{t("Shown at the foot of your home page, next to the menu. Leave one empty to hide it.")}</p>
      {links.data && (
        <>
          <label className="ow-field">
            <span className="ow-lbl">{t("Instagram page")}</span>
            <input className="ow-in" dir="ltr" name="instagram" type="url" inputMode="url" placeholder="https://www.instagram.com/yourvenue" defaultValue={links.data.instagram ?? ""} disabled={!isOwner} autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Google review link")}</span>
            <input className="ow-in" dir="ltr" name="googleReview" type="url" inputMode="url" placeholder="https://g.page/r/…/review" defaultValue={links.data.googleReview ?? ""} disabled={!isOwner} autoComplete="off" />
          </label>
          <p className="ow-note">{t("In Google Business Profile, choose “Ask for reviews” and copy the link it gives you.")}</p>
          {isOwner && <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save links")}</button></div>}
        </>
      )}
      <Msg note={note} />
    </form>
  );
}
