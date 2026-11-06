/** Co-branded header: venue name × Orbyn. */
export default function Brand({ venueName }: { venueName: string }) {
  return (
    <header className="brandbar">
      <span className="mark">{venueName}</span>
      <span className="x">×</span>
      <span className="powered">Orbyn</span>
    </header>
  );
}
