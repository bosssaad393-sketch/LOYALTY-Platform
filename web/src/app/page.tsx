import { brandName } from "@/lib/brand";

export default function Home() {
  return (
    <main className="app">
      <header className="brandbar"><span className="mark">{brandName().toUpperCase()}</span></header>
      <div className="title">
        <div className="eyebrow">Digital rewards</div>
        <h1>Your rewards card, in your phone&apos;s Wallet</h1>
        <p className="sub">Scan the QR code at the venue to get your card.</p>
      </div>
    </main>
  );
}
