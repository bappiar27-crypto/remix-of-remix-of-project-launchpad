import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import InvoiceDocument from "@/components/InvoiceDocument";
import InvoiceStatusBadge from "@/components/InvoiceStatusBadge";
import { calcInvoice } from "@/lib/invoice-utils";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";

// invoices টেবিল types.ts-এ এখনো নেই, তাই untyped handle:
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/invoices_/$id")({
  head: () => ({
    meta: [
      { title: "Invoice — GrowVibe Ads Solution" },
      {
        name: "description",
        content:
          "Client invoice preview with USD and BDT totals, ready to download as PDF.",
      },
    ],
  }),
  component: InvoiceView,
});

function InvoiceView() {
  const { id } = Route.useParams();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("invoices")
        .select("*, invoice_items(description,qty,rate_usd,position)")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      const items = (data.invoice_items ?? [])
        .slice()
        .sort((a: any, b: any) => a.position - b.position);
      return { ...data, invoice_items: items };
    },
  });

  const { data: me } = useQuery({
    queryKey: ["me-name"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return "";
      const { data: p } = await db
        .from("profiles")
        .select("full_name,email")
        .eq("id", u.user.id)
        .maybeSingle();
      return p?.full_name || p?.email || u.user.email || "";
    },
  });

  async function handleDownload() {
    if (!sheetRef.current || !data) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(
        sheetRef.current,
        data.invoice_no,
        data.client_name,
      );
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "PDF তৈরি করা যায়নি");
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> Loading…
      </div>
    );
  }
  if (!data)
    return <div className="p-12 text-center text-sm">Invoice not found.</div>;

  const c = calcInvoice(data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to invoices
          </Link>
          <InvoiceStatusBadge status={c.status} size="lg" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Printer className="size-4" /> Print
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </button>
        </div>
      </div>

      {/* On phones/tablets the invoice sheet keeps its print-accurate fixed
          width internally, so it scrolls horizontally inside this box
          instead of breaking the page layout. */}
      <div className="overflow-x-auto print:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0">
        <div id="invoice-print-area" ref={sheetRef}>
          <InvoiceDocument inv={data as any} generatedBy={me || undefined} />
        </div>
      </div>
    </div>
  );
}
