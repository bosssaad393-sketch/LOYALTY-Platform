import { getTranslations } from "next-intl/server";
import type { Branch } from "@/lib/branches";
import { voucherState, type CardVoucher } from "@/lib/vouchers";
import { directionsUrl, telUrl } from "@/lib/placeLinks";

const day = (iso: string, ar: boolean) =>
  new Date(iso).toLocaleDateString(ar ? "ar-BH-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bahrain" });

type Props = {
  vouchers: CardVoucher[];
  /** The gift the first visit will unlock, when the guest has none yet (title in the guest's language). */
  upcoming: string | null;
  branches: Branch[];
  ar: boolean;
  /** The venue's own menu page in Orbyn, when it has dishes: the first branch opens it instead of an outside link. */
  ownMenu?: string | null;
};

/**
 * Under the visit card: the gift (ready / used / expired) as a paper ticket, or one calm line before the first visit;
 * then each branch with its menu, directions, phone and a Google review link for every guest (never tied to a reward).
 */
export default async function VisitSheet({ vouchers, upcoming, branches, ar, ownMenu = null }: Props) {
  const t = await getTranslations("visitCard");
  const shown = vouchers.filter((v) => voucherState(v) !== "cancelled");
  const places = branches.filter((b) => b.kind === "branch" && b.active);
  const nameOf = (b: Pick<Branch, "name" | "nameAr">) => (ar && b.nameAr) || b.name;

  return (
    <>
      {(shown.length > 0 || upcoming) && (
        <section className="gs" aria-labelledby="gs-h">
          <h2 className="gs-h" id="gs-h">{t("giftTitle")}</h2>
          {shown.length === 0 && upcoming && <p className="gs-wait" dir="auto">{t("giftLocked", { gift: upcoming })}</p>}
          {shown.map((v) => {
            const state = voucherState(v);
            const where = branches.find((b) => b.id === v.redeemBranchId);
            const go = where ? directionsUrl(where) : null;
            const title = (ar && v.titleAr) || v.title;
            const detail = (ar && v.detailAr) || v.detail;
            return (
              <article key={v.id} className={`gift ${state}`}>
                <p className="gift-state">
                  {state === "ready" ? t("giftReady")
                    : state === "used" ? t("giftUsed", { date: v.redeemedAt ? day(v.redeemedAt, ar) : "" })
                    : state === "expired" ? t("giftExpired", { date: v.expiresAt ? day(v.expiresAt, ar) : "" })
                    : t("giftCancelled")}
                </p>
                <h3 className="gift-title" dir="auto">{title}</h3>
                {detail && <p className="gift-detail" dir="auto">{detail}</p>}
                {state === "ready" && (
                  <>
                    <dl className="gift-meta">
                      <div><dt>{t("giftWhere")}</dt><dd>{where ? nameOf(where) : v.redeemBranchName ?? t("giftAny")}</dd></div>
                      <div><dt>{t("giftUntil")}</dt><dd>{v.expiresAt ? day(v.expiresAt, ar) : t("giftNoEnd")}</dd></div>
                    </dl>
                    <p className="gift-once">{t("giftOnce")}</p>
                    {go && <a className="gift-go" href={go} target="_blank" rel="noopener noreferrer">{t("directions")}<span className="sr-only"> ({t("newTab")})</span></a>}
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}

      {places.length > 0 && (
        <section className="pl" aria-labelledby="pl-h">
          <h2 className="gs-h" id="pl-h">{t("placesTitle")}</h2>
          <ul className="pl-list">
            {places.map((b, k) => {
              const ours = k === 0 ? ownMenu : null;
              const go = directionsUrl(b);
              const tel = telUrl(b.phone);
              return (
                <li key={b.id} className="pl-item">
                  <h3 className="pl-name" dir="auto">{nameOf(b)}</h3>
                  {b.address && <p className="pl-addr" dir="auto">{b.address}</p>}
                  {(ours || b.menuUrl || go || tel) && (
                    <div className="pl-acts">
                      {ours && <a className="pl-act" href={ours}>{t("menu")}</a>}
                      {!ours && b.menuUrl && <a className="pl-act" href={b.menuUrl} target="_blank" rel="noopener noreferrer">{t("menu")}<span className="sr-only"> ({t("newTab")})</span></a>}
                      {go && <a className="pl-act" href={go} target="_blank" rel="noopener noreferrer">{t("directions")}<span className="sr-only"> ({t("newTab")})</span></a>}
                      {tel && <a className="pl-act" href={tel} dir="ltr">{t("call")}</a>}
                    </div>
                  )}
                  {b.reviewUrl && (
                    <p className="pl-review">
                      <a href={b.reviewUrl} target="_blank" rel="noopener noreferrer">{t("review")}<span className="sr-only"> ({t("newTab")})</span></a>
                      <span>{t("reviewNote")}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
