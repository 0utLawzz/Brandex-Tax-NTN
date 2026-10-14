export const filingStatuses = [
  "Due",
  "Documents pending",
  "In progress",
  "Filed",
  "On hold",
];
export const roles = ["admin", "officer", "billing", "viewer"];
export function normalizeCode(value) {
  const m = String(value)
    .trim()
    .toUpperCase()
    .match(/^([A-Z]+)[ -]*([0-9]+)$/);
  if (!m) throw Error("Use a Client Code such as X-881");
  return `${m[1]}-${BigInt(m[2])}`;
}
export function paymentState(charge, paid) {
  return Number(charge) === 0
    ? "Not charged"
    : Number(paid) === 0
      ? "Unpaid"
      : Number(paid) < Number(charge)
        ? "Part paid"
        : "Paid";
}
export function balance(charge, paid) {
  return Math.max(0, Number(charge) - Number(paid));
}
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
