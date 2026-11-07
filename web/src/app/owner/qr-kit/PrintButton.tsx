"use client";

/** Opens the browser's print window. "Save as PDF" there gives a file for a print shop. */
export default function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <button type="button" className="qk-print" disabled={disabled} onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
