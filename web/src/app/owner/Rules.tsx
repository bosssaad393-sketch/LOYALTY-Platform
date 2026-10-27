"use client";

import { n } from "./format";
import { RewardFields, RewardState, useRewardEditor } from "./RewardForm";
import { PageHead } from "./ui";
import type { Call } from "./types";

export default function Rules({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const editor = useRewardEditor(call);

  return (
    <>
      <PageHead eyebrow="Programme" title="Rules">Changes apply from the next visit. Guests keep the points they have.</PageHead>
      <RewardState editor={editor}>
        {(rules) => (
          <div className="ow-grid ow-c2">
            <section className="ow-panel" aria-label="Edit the rules">
              <RewardFields editor={editor} rules={rules} isOwner={isOwner} />
            </section>
            <section className="ow-panel" aria-labelledby="ow-h-means">
              <h2 className="ow-h" id="ow-h-means">What this means</h2>
              <ul className="ow-list">
                <li className="ow-item"><span className="ow-item-main">A bill of BHD 10</span><span className="ow-item-side ow-fig">{n(10 * rules.pointsPerBhd)} points</span></li>
                <li className="ow-item"><span className="ow-item-main">A reward is reached after about</span><span className="ow-item-side ow-fig">BHD {n(Math.ceil(rules.rewardGoal / rules.pointsPerBhd))}</span></li>
                <li className="ow-item"><span className="ow-item-main">Reward</span><span className="ow-item-side ow-wrap">{rules.rewardText}</span></li>
              </ul>
            </section>
          </div>
        )}
      </RewardState>
    </>
  );
}
