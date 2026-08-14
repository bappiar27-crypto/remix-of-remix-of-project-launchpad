import { LABELS, STATUS_STYLE } from "@/lib/invoice-config";

export type InvoiceItem = {
  description: string;
  qty: number;
  rate_usd: number;
};

export type InvoiceLike = {
  usd_rate: number | string;
  total_usd: number | string;
  paid_usd: number | string;
};

export const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const round2 = (v: number) =>
  Math.round((v + Number.EPSILON) * 100) / 100;

/** সব হিসাব: USD সোর্স অব ট্রুথ, BDT = USD × rate */
export function calcInvoice(inv: InvoiceLike) {
  const rate = n(inv.usd_rate) || 1;
  const totalUsd = round2(n(inv.total_usd));
  const paidUsd = round2(Math.min(n(inv.paid_usd), Number.MAX_SAFE_INTEGER));
  const dueUsd = round2(Math.max(totalUsd - paidUsd, 0));
  return {
    rate,
    totalUsd,
    paidUsd,
    dueUsd,
    totalBdt: round2(totalUsd * rate),
    paidBdt: round2(paidUsd * rate),
    dueBdt: round2(dueUsd * rate),
    status:
      dueUsd <= 0
        ? ("paid" as const)
        : paidUsd > 0
          ? ("partial" as const)
          : ("due" as const),
  };
}

export function itemsTotalUsd(items: InvoiceItem[]) {
  return round2(items.reduce((s, i) => s + n(i.qty) * n(i.rate_usd), 0));
}

const usdFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const bdtFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtUsd = (v: number) => `$${usdFmt.format(round2(v))}`;
export const fmtBdt = (v: number) => `৳${bdtFmt.format(round2(v))}`;

export const usdToBdt = (usd: number, rate: number) => round2(n(usd) * n(rate));
export const bdtToUsd = (bdt: number, rate: number) =>
  n(rate) ? round2(n(bdt) / n(rate)) : 0;

export const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/** স্ট্যাটাস → লেবেল + রঙ (config থেকে) */
export function statusMeta(status: "paid" | "partial" | "due") {
  return { label: LABELS.status[status], ...STATUS_STYLE[status] };
}
