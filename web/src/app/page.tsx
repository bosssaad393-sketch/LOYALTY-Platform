import { brandName } from "@/lib/brand";

export default function Home() {
  const named = process.env.BRAND_NAME?.trim();
  return (
    <main className="app">
      <header className="brandbar">
        {named ? (
          <span className="mark">{brandName().toUpperCase()}</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- vector logo */
          <img src="/orbyn-logo-horizontal.svg" alt="Orbyn" width={220} height={55} />
        )}
      </header>
      <div className="title">
        <div className="eyebrow">Digital rewards</div>
        <h1>Your rewards card, in your phone&apos;s Wallet</h1>
        <p className="sub">Scan the QR code at the venue to get your card.</p>
      </div>
    </main>
  );
}
