"use client";

import { useId, useState } from "react";
import { n } from "./format";
import { Loading, LoadError, Msg, Stepper, useGet } from "./ui";
import type { Call, Note, Rules as RulesData } from "./types";

/** What an owner would pick for "points needed for a reward" most often. */
export const GOAL_CHIPS = [250, 500, 750] as const;

export const SAVED_TEXT = "Saved. Changes apply from the next visit. Guests keep the points they have.";

/**
 * The reward rules, loaded once and edited in place. The Rules tab and the "Change the reward" sheet share it,
 * so both save through the same POST /api/owner/rules and show the same confirmation.
 */
export function useRewardEditor(call: Call) {
  const loaded = useGet<RulesData>(call, "/api/owner/rules");
  // What the owner has typed so far. Until then the screen shows what the server sent.
  const [edit, setEdit] = useState<RulesData | null>(null);
  const rules = edit ?? loaded.data;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  function setRules(next: RulesData) {
    setEdit(next);
    setNote(null);
  }

  /** Resolves true when the server accepted the new rules. */
  async function save(): Promise<boolean> {
    if (!rules) return false;
    setBusy(true); setNote(null);
    const r = await call<RulesData>("/api/owner/rules", "POST", rules);
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: SAVED_TEXT }); return true; }
    if (r.status !== 401) setNote({ kind: "bad", text: r.error });
    return false;
  }

  return { loaded, rules, setRules, busy, note, save };
}

export type RewardEditor = ReturnType<typeof useRewardEditor>;

/** Loading and error states for the editor, then `children` once the rules are there. */
export function RewardState({ editor, children }: { editor: RewardEditor; children: (rules: RulesData) => React.ReactNode }) {
  const { loaded, rules } = editor;
  if (loaded.error && !rules) return <LoadError text={loaded.error} onRetry={loaded.reload} />;
  if (!rules) return <Loading />;
  return <>{children(rules)}</>;
}

/** The three fields, the quick amounts for the goal, the save button and the confirmation. */
export function RewardFields({ editor, rules, isOwner, hint, onSaved }: { editor: RewardEditor; rules: RulesData; isOwner: boolean; hint?: boolean; onSaved?: () => void }) {
  const textId = useId();
  const { setRules, busy, note, save } = editor;
  return (
    <>
      <div className="ow-field">
        <label className="ow-lbl" htmlFor={textId}>The reward</label>
        <input className="ow-in" id={textId} value={rules.rewardText} disabled={!isOwner} maxLength={120} onChange={(e) => setRules({ ...rules, rewardText: e.target.value })} />
      </div>
      <div className="ow-field">
        <Stepper label="Points needed for a reward" value={rules.rewardGoal} step={50} min={50} max={100000} disabled={!isOwner} onChange={(v) => setRules({ ...rules, rewardGoal: v })} />
        {isOwner && (
          <div className="ow-chips" role="group" aria-label="Quick amounts for the reward goal">
            {GOAL_CHIPS.map((v) => (
              <button key={v} type="button" className="ow-pill" aria-pressed={rules.rewardGoal === v} onClick={() => setRules({ ...rules, rewardGoal: v })}>{n(v)}</button>
            ))}
          </div>
        )}
      </div>
      <Stepper label="Points for every BHD 1" value={rules.pointsPerBhd} step={1} min={1} max={100} disabled={!isOwner} onChange={(v) => setRules({ ...rules, pointsPerBhd: v })} />
      {hint && <p className="ow-note">At these rules a guest reaches the reward after about BHD {n(Math.ceil(rules.rewardGoal / rules.pointsPerBhd))} of bills.</p>}
      {isOwner ? (
        <div className="ow-actions"><button type="button" className="ow-btn primary" disabled={busy} onClick={async () => { if (await save()) onSaved?.(); }}>{busy ? "Saving…" : "Save the reward"}</button></div>
      ) : (
        <p className="ow-note">Only the owner can change the rules.</p>
      )}
      <Msg note={note} />
    </>
  );
}
