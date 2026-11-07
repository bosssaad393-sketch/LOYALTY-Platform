import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getCardView, isUuid } from "@/lib/cards";
import { googleWalletConfigured } from "@/lib/googleWallet";
import { appleWalletConfigured } from "@/lib/appleWallet";
import BlackCard from "@/components/BlackCard";
import CardSheet from "./CardSheet";
import RememberCard from "./RememberCard";
import { brandColors, footerLine } from "@/lib/brand";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export default async function CardPage({ params, searchParams }: PageProps<"/card/[cardId]">) {
  const { cardId } = await params;
  const { welcome } = await searchParams;
  if (!isUuid(cardId)) notFound();
  const view = await getCardView(cardId);
  if (!view) notFound();
  const { card, venue, memberName } = view;

  const goal = venue.reward_goal;
  const qr = await QRCode.toDataURL(`LOYALTY:${venue.slug}:${card.code}`, {
    margin: 0,
    color: { dark: brandColors().bg, light: brandColors().text },
  });
  const since = card.created_at
    ? new Date(card.created_at).toLocaleDateString("en-GB", { month: "2-digit", year: "2-digit", timeZone: "Asia/Bahrain" })
    : undefined;

  return (
    <>
      <main className="app">
        {welcome === "1" && (
          <p className="welcome" role="status">
            <b>Welcome, {memberName.trim().split(/\s+/)[0]}. Your card is ready.</b>
            <span>Keep it: add it to your Wallet or bookmark this page. Show it at the till to collect points.</span>
          </p>
        )}
        <BlackCard
          venueName={venue.name}
          venueSlug={venue.slug}
          memberName={memberName}
          since={since}
          points={card.points}
          goal={goal}
          code={card.code}
          qr={qr}
        />
        <CardSheet points={card.points} goal={goal} rewardText={venue.reward_text} />

        <div className="actions after">
          {appleWalletConfigured() && <a className="btn wallet" href={`/api/wallet/apple/${card.id}`}> Add to Apple Wallet</a>}
          {googleWalletConfigured() && (
            <a className="gw-badge" href={`/api/wallet/google/${card.id}`} aria-label="Add to Google Wallet">
              {/* eslint-disable-next-line @next/next/no-img-element -- official Google Wallet button artwork */}
              <img src="/badges/add-to-google-wallet-en.svg" alt="Add to Google Wallet" width={283} height={50} />
            </a>
          )}
        </div>
        <p className="note after" style={{ marginTop: 14 }}>Tip: bookmark this page. It always shows your latest points.</p>
        <RememberCard cardId={card.id} />
        <p className="foot after">{footerLine(venue.name)}</p>
      </main>
    </>
  );
}
