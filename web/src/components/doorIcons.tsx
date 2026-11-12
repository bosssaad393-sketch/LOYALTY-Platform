const base = { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** "Opens a page": a chevron, mirrored in Arabic by door.css. */
export const Go = () => <svg {...base} className="door-go"><path d="M9 5l7 7-7 7" /></svg>;

/** "Saves to your phone". */
export const Save = () => <svg {...base}><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>;
