import { statusMeta } from "@/lib/invoice-utils";

export function InvoiceStatusBadge({
  status,
  size = "sm",
}: {
  status: "paid" | "partial" | "due";
  size?: "sm" | "lg";
}) {
  const m = statusMeta(status);
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide " +
        (size === "lg" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]")
      }
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: m.color }}
      />
      {m.label}
    </span>
  );
}

export default InvoiceStatusBadge;
