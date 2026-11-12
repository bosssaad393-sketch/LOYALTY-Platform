import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { brandLanguages, poweredBy } from "@/lib/brand";
import { currentStaff } from "@/lib/staffAuth";
import { listTables } from "@/lib/table/db";
import { kitBase, kitCards, kitLook, qrShape, sheets, shortHost, type KitCard } from "@/lib/table/qrKit";
import PrintButton from "./PrintButton";
import "./qrkit.css";

export const metadata: Metadata = { title: "QR kit", robots: { index: false } };

// Reads the session cookie and the venue's tables on every request.
export const instant = false;

const QUIET = 4;

function Code({ url, label }: { url: string; label: string }) {
  const { size, d } = qrShape(url);
  return (
    <svg className="qk-code" role="img" aria-label={label} viewBox={`${-QUIET} ${-QUIET} ${size + QUIET * 2} ${size + QUIET * 2}`}>
      <rect x={-QUIET} y={-QUIET} width={size + QUIET * 2} height={size + QUIET * 2} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function Card({ card, venue, crest, host, arabic, credit }: { card: KitCard; venue: string; crest: string | null; host: string; arabic: boolean; credit: string }) {
  const table = card.kind === "table";
  return (
    <article className={`qk-card${table ? "" : " qk-join"}`}>
      <header className="qk-top">
        {/* eslint-disable-next-line @next/next/no-img-element -- the venue's own crest file, printed as is */}
        {crest && <img className="qk-crest" src={crest} alt="" width={40} height={40} />}
        <span className="qk-venue">{venue}</span>
      </header>

      <div className="qk-title">
        {table ? (
          <>
            <span className="qk-kicker">Table{arabic && <><span aria-hidden="true"> · </span><span lang="ar">طاولة</span></>}</span>
            <strong className="qk-label">{card.label}</strong>
          </>
        ) : (
          <>
            <span className="qk-kicker">Rewards{arabic && <><span aria-hidden="true"> · </span><span lang="ar">المكافآت</span></>}</span>
            <strong className="qk-label qk-label-sm">Your {venue} card</strong>
          </>
        )}
      </div>

      <Code url={card.url} label={table ? `QR code for table ${card.label}` : `QR code to join ${venue} rewards`} />

      <div className="qk-say">
        {table ? (
          <>
            <p>Scan for the menu, your rewards card and our contact.</p>
            {arabic && <p lang="ar" dir="rtl">امسح الرمز للقائمة وبطاقة المكافآت وبيانات التواصل.</p>}
          </>
        ) : (
          <>
            <p>Scan for your rewards card, our contact and to tell us how we did.</p>
            {arabic && <p lang="ar" dir="rtl">امسح الرمز لبطاقة المكافآت وبيانات التواصل ولإبداء رأيك.</p>}
          </>
        )}
      </div>

      <footer className="qk-foot">
        <span>No app needed · {host}</span>
        {credit && <span>{credit}</span>}
      </footer>
    </article>
  );
}

/** The printable QR kit: A4 sheets of four A6 cards, cut along the thin lines. Print, or save as PDF for a print shop. */
export default async function QrKitPage(props: PageProps<"/owner/qr-kit">) {
  const staff = await currentStaff("owner");
  if (!staff) redirect("/owner");
  const q = await props.searchParams;
  const look = kitLook(q.look);
  const only = typeof q.table === "string" ? q.table : null;

  const h = await headers();
  const base = kitBase(process.env.PUBLIC_BASE_URL, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http"));
  const tables = await listTables(staff.venueId);
  const cards = base ? kitCards(base, staff.venueSlug, tables, only) : [];
  const crestFile = path.join(process.cwd(), "public", "venues", staff.venueSlug, "crest.png");
  const crest = existsSync(crestFile) ? `/venues/${staff.venueSlug}/crest.png` : null;
  const arabic = brandLanguages().includes("ar");
  const tableCount = cards.filter((c) => c.kind === "table").length;
  const link = (l: string) => `/owner/qr-kit?look=${l}${only ? `&table=${encodeURIComponent(only)}` : ""}`;

  return (
    <main className={`qk look-${look}`}>
      <div className="qk-bar">
        <div>
          <h1 className="qk-h">QR kit</h1>
          <p className="qk-note">
            {only ? "One table card." : `${tableCount} table ${tableCount === 1 ? "card" : "cards"} and a counter card for the rewards card.`} Four cards on each A4 sheet, cut along the thin lines.
          </p>
        </div>
        <div className="qk-actions">
          <nav className="qk-looks" aria-label="Look">
            <a href={link("dark")} aria-current={look === "dark" ? "true" : undefined}>Venue colours</a>
            <a href={link("light")} aria-current={look === "light" ? "true" : undefined}>White, saves ink</a>
          </nav>
          <PrintButton disabled={cards.length === 0} />
          <a className="qk-back" href="/owner">Back</a>
        </div>
        <p className="qk-note">
          In the print window choose A4, scale 100% (or &quot;Actual size&quot;) and turn on background graphics.
          {only ? <> <a href="/owner/qr-kit">All tables</a></> : null}
        </p>
      </div>

      {!base && <p className="qk-warn" role="alert">The site&apos;s public address is not set (PUBLIC_BASE_URL), so the codes cannot be made. Ask your developer to set it.</p>}
      {base && tableCount === 0 && <p className="qk-warn" role="status">{only ? "That table was not found. It may have been removed." : "No tables yet. Add them under Service, Tables, then come back."}</p>}

      <div className="qk-sheets">
        {sheets(cards).map((sheet, i) => (
          <section key={i} className="qk-sheet" aria-label={`Sheet ${i + 1}`}>
            {sheet.map((c) => <Card key={c.id} card={c} venue={staff.venueName} crest={crest} host={base ? shortHost(base) : ""} arabic={arabic} credit={poweredBy()} />)}
          </section>
        ))}
      </div>
    </main>
  );
}
