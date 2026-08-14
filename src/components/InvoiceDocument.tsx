import { COMPANY, LABELS, LAYOUT, LOGO_SRC, THEME } from "@/lib/invoice-config";
import {
  calcInvoice,
  fmtBdt,
  fmtUsd,
  fmtDate,
  n,
  round2,
} from "@/lib/invoice-utils";
import InvoiceStatusBadge from "@/components/InvoiceStatusBadge";

export type InvoiceDoc = {
  invoice_no: string;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  usd_rate: number | string;
  total_usd: number | string;
  paid_usd: number | string;
  notes?: string | null;
  issue_date: string;
  due_date?: string | null;
  invoice_items?: {
    description: string;
    qty: number | string;
    rate_usd: number | string;
  }[];
};

export function InvoiceDocument({
  inv,
  generatedBy,
}: {
  inv: InvoiceDoc;
  generatedBy?: string;
}) {
  const c = calcInvoice(inv);
  const items = (inv.invoice_items ?? []).slice();
  const label = { color: THEME.faint };
  const muted = { color: THEME.muted };

  return (
    <div
      className="invoice-sheet mx-auto w-full bg-white shadow-lg print:shadow-none"
      style={{
        maxWidth: LAYOUT.sheetMaxWidth,
        padding: LAYOUT.sheetPadding,
        fontSize: LAYOUT.baseFontSize,
        color: THEME.text,
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-6 pb-6"
        style={{ borderBottom: `2px solid ${THEME.accent}` }}
      >
        <div className="flex items-start gap-3">
          {LAYOUT.showLogoHeader ? (
            <img
              src={LOGO_SRC}
              alt={COMPANY.name}
              style={{ height: LAYOUT.logoHeaderHeight, width: "auto" }}
            />
          ) : null}
          <div>
            <div className="text-lg font-bold" style={{ color: THEME.accent }}>
              {COMPANY.name}
            </div>
            {LAYOUT.showTagline ? (
              <div style={label}>{COMPANY.tagline}</div>
            ) : null}
            <div className="mt-1 leading-5" style={muted}>
              {COMPANY.address}
              <br />
              {COMPANY.phone} · {COMPANY.email}
              <br />
              {COMPANY.website}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-extrabold tracking-widest"
            style={{ color: THEME.accent }}
          >
            {LABELS.documentTitle}
          </div>
          {LAYOUT.showStatusBadge ? (
            <div className="mt-1 flex justify-end">
              <InvoiceStatusBadge status={c.status} size="lg" />
            </div>
          ) : null}
          <div className="mt-2" style={muted}>
            <div>
              <span style={label}>{LABELS.invoiceNo}: </span>
              <b>{inv.invoice_no}</b>
            </div>
            <div>
              <span style={label}>{LABELS.date}: </span>
              {fmtDate(inv.issue_date)}
            </div>
            {inv.due_date ? (
              <div>
                <span style={label}>{LABELS.dueDate}: </span>
                {fmtDate(inv.due_date)}
              </div>
            ) : null}
            {LAYOUT.showRateLine ? (
              <div>
                <span style={label}>{LABELS.rate}: </span>1 USD = ৳
                {round2(n(inv.usd_rate))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bill to */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
            style={label}
          >
            {LABELS.billTo}
          </div>
          <div
            className="text-base font-semibold"
            style={{ color: THEME.accent }}
          >
            {inv.client_name}
          </div>
          {inv.client_phone ? (
            <div>
              {LABELS.mobile}: {inv.client_phone}
            </div>
          ) : null}
          {inv.client_email ? (
            <div>
              {LABELS.email}: {inv.client_email}
            </div>
          ) : null}
          {inv.client_address ? (
            <div className="whitespace-pre-line">{inv.client_address}</div>
          ) : null}
        </div>
        {LAYOUT.showAmountDueBox ? (
          <div className="rounded-md p-4" style={{ background: THEME.boxBg }}>
            <div
              className="mb-1 text-[11px] font-bold uppercase tracking-wider"
              style={label}
            >
              {LABELS.amountDue}
            </div>
            <div
              className="text-2xl font-extrabold"
              style={{ color: c.dueUsd > 0 ? THEME.due : THEME.paid }}
            >
              {fmtUsd(c.dueUsd)}
            </div>
            <div className="text-base font-semibold" style={muted}>
              {fmtBdt(c.dueBdt)}
            </div>
          </div>
        ) : null}
      </div>

      {/* Items */}
      {LAYOUT.showItemsTable ? (
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wider"
              style={{ background: THEME.accent, color: THEME.accentText }}
            >
              <th className="px-3 py-2">{LABELS.description}</th>
              <th className="px-3 py-2 text-right">{LABELS.qty}</th>
              <th className="px-3 py-2 text-right">{LABELS.unitRate}</th>
              <th className="px-3 py-2 text-right">{LABELS.amountUsd}</th>
              {LAYOUT.showBdtColumn ? (
                <th className="px-3 py-2 text-right">{LABELS.amountBdt}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr style={{ borderBottom: `1px solid ${THEME.line}` }}>
                <td className="px-3 py-2">{LABELS.defaultLineItem}</td>
                <td className="px-3 py-2 text-right">1</td>
                <td className="px-3 py-2 text-right">{fmtUsd(c.totalUsd)}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(c.totalUsd)}</td>
                {LAYOUT.showBdtColumn ? (
                  <td className="px-3 py-2 text-right">{fmtBdt(c.totalBdt)}</td>
                ) : null}
              </tr>
            ) : (
              items.map((it, i) => {
                const amt = round2(n(it.qty) * n(it.rate_usd));
                return (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${THEME.line}` }}
                  >
                    <td className="px-3 py-2">{it.description}</td>
                    <td className="px-3 py-2 text-right">{n(it.qty)}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtUsd(n(it.rate_usd))}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtUsd(amt)}</td>
                    {LAYOUT.showBdtColumn ? (
                      <td className="px-3 py-2 text-right">
                        {fmtBdt(amt * c.rate)}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      ) : null}

      {/* Summary */}
      <div className="mt-5 flex justify-end">
        <table
          className="w-[380px] border-collapse"
          style={{ fontSize: LAYOUT.baseFontSize }}
        >
          <tbody>
            <tr style={{ borderBottom: `1px solid ${THEME.line}` }}>
              <td className="py-2" style={muted}>
                {LABELS.totalBudget}
              </td>
              <td className="py-2 text-right font-semibold">
                {fmtUsd(c.totalUsd)}
              </td>
              <td className="py-2 text-right" style={muted}>
                {fmtBdt(c.totalBdt)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${THEME.line}` }}>
              <td className="py-2" style={muted}>
                {LABELS.totalPaid}
              </td>
              <td className="py-2 text-right font-semibold">
                {fmtUsd(c.paidUsd)}
              </td>
              <td className="py-2 text-right" style={muted}>
                {fmtBdt(c.paidBdt)}
              </td>
            </tr>
            <tr style={{ background: THEME.accent, color: THEME.accentText }}>
              <td className="px-2 py-2 font-bold">{LABELS.totalDue}</td>
              <td className="px-2 py-2 text-right font-bold">
                {fmtUsd(c.dueUsd)}
              </td>
              <td className="px-2 py-2 text-right font-bold">
                {fmtBdt(c.dueBdt)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {c.dueUsd <= 0 ? (
        <div
          className="mt-3 text-right text-sm font-bold"
          style={{ color: THEME.paid }}
        >
          {LABELS.paidInFull}
        </div>
      ) : null}

      {inv.notes ? (
        <div
          className="mt-6 rounded-md p-3"
          style={{ border: `1px solid ${THEME.line}` }}
        >
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
            style={label}
          >
            {LABELS.notes}
          </div>
          <div className="whitespace-pre-line">{inv.notes}</div>
        </div>
      ) : null}

      {COMPANY.paymentInfo ? (
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: THEME.boxBg }}
        >
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
            style={label}
          >
            {LABELS.paymentInfo}
          </div>
          <div className="whitespace-pre-line">{COMPANY.paymentInfo}</div>
        </div>
      ) : null}

      {/* Footer */}
      <div
        className="mt-10 flex items-end justify-between pt-5"
        style={{ borderTop: `1px solid ${THEME.line}` }}
      >
        <div className="flex items-center gap-2">
          {LAYOUT.showLogoFooter ? (
            <img
              src={LOGO_SRC}
              alt=""
              style={{
                height: LAYOUT.logoFooterHeight,
                width: "auto",
                opacity: 0.8,
              }}
            />
          ) : null}
          <div style={muted}>
            <div className="font-semibold" style={{ color: THEME.text }}>
              {COMPANY.name}
            </div>
            <div>{COMPANY.footerNote}</div>
          </div>
        </div>
        <div className="text-right" style={muted}>
          {LAYOUT.showSignature ? (
            <div
              className="mb-1 pb-6"
              style={{
                borderBottom: `1px solid ${THEME.faint}`,
                minWidth: 180,
              }}
            />
          ) : null}
          {LAYOUT.showSignature ? (
            <div className="mb-2">{LABELS.signature}</div>
          ) : null}
          {LAYOUT.showGeneratedBy ? (
            <div>
              {LABELS.generatedBy}: {generatedBy || COMPANY.name}
            </div>
          ) : null}
          {LAYOUT.showTimestamp ? (
            <div>{new Date().toLocaleString("en-GB")}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default InvoiceDocument;
