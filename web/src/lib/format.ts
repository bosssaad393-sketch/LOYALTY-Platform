// Shared formatting for every screen: numbers, BHD money and Bahrain dates and times. Pure and safe in the browser.
// One place, so the till, the table board, the owner app and the guest pages always write money and time the same way.

const TZ = "Asia/Bahrain";

/** Whole numbers with thousands separators: 5,240. */
export const n = (x: number) => x.toLocaleString("en-GB");

/** BHD always with three decimals and thousands marked: 1,845.500. */
export const bhd = (x: number) => x.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** "BHD 1,845.500". */
export const bhdText = (x: number) => `BHD ${bhd(x)}`;

/** Money kept in fils (integer) as "BHD 1,845.500". */
export const filsMoney = (fils: number) => bhdText(fils / 1000);

/** "21:02" in Bahrain time. */
export const bahrainTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** "15 Oct" in Bahrain time. */
export const bahrainDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });

/** "2026-10-15": the Bahrain calendar day, for grouping entries by day. */
export const bahrainDayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
