/** Co-branded header: venue name × LOYALTY. */
export default function Brand({ venueName }: { venueName: string }) {
  return (
    <header className="brandbar">
      <span className="mark">{venueName}</span>
      <span className="x">×</span>
      <span className="powered">Loyalty</span>
    </header>
  );
}
