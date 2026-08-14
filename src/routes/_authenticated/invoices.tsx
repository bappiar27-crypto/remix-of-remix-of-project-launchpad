import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Loader2, X } from "lucide-react";
import { DEFAULT_USD_RATE } from "@/lib/invoice-config";
import InvoiceStatusBadge from "@/components/InvoiceStatusBadge";
import {
  calcInvoice,
  fmtBdt,
  fmtUsd,
  fmtDate,
  n,
  bdtToUsd,
  usdToBdt,
  itemsTotalUsd,
} from "@/lib/invoice-utils";

// invoices টেবিল types.ts-এ এখনো নেই, তাই untyped handle:
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — GrowVibe Ads Solution" },
      {
        name: "description",
        content:
          "Create client invoices with USD and BDT amounts and download them as PDF.",
      },
    ],
  }),
  component: InvoicesPage,
});

type ItemRow = { description: string; qty: string; rate_usd: string };

function InvoicesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await db
        .from("invoices")
        .select(
          "id,invoice_no,client_name,issue_date,usd_rate,total_usd,paid_usd",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground text-sm">
            Client invoice generate করুন — USD ও বাংলা টাকা দুটোই, PDF ডাউনলোড
            সহ।
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> New Invoice
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> Loading…
          </div>
        ) : (invoices ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto mb-2 size-10 opacity-30" />
            <div className="text-sm text-muted-foreground">
              কোনো invoice নেই — “New Invoice” চাপুন।
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((inv: any) => {
                const c = calcInvoice(inv);
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-border/50 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        to="/invoices/$id"
                        params={{ id: inv.id }}
                        className="hover:underline"
                      >
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{inv.client_name}</td>
                    <td className="px-4 py-3">{fmtDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-right">
                      {fmtUsd(c.totalUsd)}
                      <div className="text-xs text-muted-foreground">
                        {fmtBdt(c.totalBdt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtUsd(c.paidUsd)}
                      <div className="text-xs text-muted-foreground">
                        {fmtBdt(c.paidBdt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {fmtUsd(c.dueUsd)}
                      <div className="text-xs text-muted-foreground">
                        {fmtBdt(c.dueBdt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        title="Delete"
                        onClick={async () => {
                          if (!confirm(`Delete ${inv.invoice_no}?`)) return;
                          const { error } = await db
                            .from("invoices")
                            .delete()
                            .eq("id", inv.id);
                          if (error) return toast.error(error.message);
                          toast.success("Invoice deleted");
                          qc.invalidateQueries({ queryKey: ["invoices"] });
                        }}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open ? (
        <NewInvoiceModal
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["invoices"] });
            navigate({ to: "/invoices/$id", params: { id } });
          }}
        />
      ) : null}
    </div>
  );
}

function NewInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_USD_RATE));
  const [totalUsd, setTotalUsd] = useState("0");
  const [paidUsd, setPaidUsd] = useState("0");
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  const { data: clients } = useQuery({
    queryKey: ["invoice-clients"],
    queryFn: async () => {
      const { data, error } = await db
        .from("clients")
        .select(
          "id,name,contact_phone,contact_email,address,bdt_rate,deposit_amount",
        )
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rateNum = n(rate) || 1;
  const itemsTotal = useMemo(
    () =>
      itemsTotalUsd(
        items.map((i) => ({
          description: i.description,
          qty: n(i.qty),
          rate_usd: n(i.rate_usd),
        })),
      ),
    [items],
  );
  const effectiveTotal = items.length ? itemsTotal : n(totalUsd);
  const calc = calcInvoice({
    usd_rate: rateNum,
    total_usd: effectiveTotal,
    paid_usd: n(paidUsd),
  });

  function pickClient(id: string) {
    setClientId(id);
    const c = (clients ?? []).find((x: any) => x.id === id);
    if (!c) return;
    setName(c.name ?? "");
    setPhone(c.contact_phone ?? "");
    setEmail(c.contact_email ?? "");
    setAddress(c.address ?? "");
    if (c.bdt_rate) setRate(String(c.bdt_rate));
    if (c.deposit_amount) setTotalUsd(String(c.deposit_amount));
  }

  async function save() {
    if (!name.trim()) return toast.error("Client name দিন");
    setSaving(true);
    try {
      // invoice_no পাঠানো হয় না — DB trigger নিজেই INV-000001 থেকে পরের নম্বর বসিয়ে save করে
      const { data: userRes } = await supabase.auth.getUser();
      const { data: inserted, error } = await db
        .from("invoices")
        .insert({
          client_id: clientId || null,
          client_name: name.trim(),
          client_phone: phone || null,
          client_email: email || null,
          client_address: address || null,
          usd_rate: rateNum,
          total_usd: effectiveTotal,
          paid_usd: n(paidUsd),
          notes: notes || null,
          issue_date: issueDate,
          due_date: dueDate || null,
          created_by: userRes?.user?.id ?? null,
        })
        .select("id,invoice_no")
        .single();
      if (error) throw new Error(error.message);

      if (items.length) {
        const rows = items
          .filter((i) => i.description.trim())
          .map((i, idx) => ({
            invoice_id: inserted.id,
            description: i.description.trim(),
            qty: n(i.qty) || 1,
            rate_usd: n(i.rate_usd),
            position: idx,
          }));
        if (rows.length) {
          const { error: e2 } = await db.from("invoice_items").insert(rows);
          if (e2) throw new Error(e2.message);
        }
      }
      toast.success(`${inserted.invoice_no} created`);
      onCreated(inserted.id);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="glass-card my-6 w-full max-w-3xl space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Invoice</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-muted-foreground">
              Select client (optional)
            </span>
            <select
              className={field}
              value={clientId}
              onChange={(e) => pickClient(e.target.value)}
            >
              <option value="">— Manual entry —</option>
              {(clients ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">
              Client name *
            </span>
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Mobile</span>
            <input
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Email</span>
            <input
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Address</span>
            <input
              className={field}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Issue date</span>
            <input
              type="date"
              className={field}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Due date</span>
            <input
              type="date"
              className={field}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-muted-foreground">
              USD → BDT rate (1 USD = ? ৳)
            </span>
            <input
              className={field}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
            />
          </label>
        </div>

        {/* Line items (optional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Line items (optional)</span>
            <button
              onClick={() =>
                setItems((p) => [
                  ...p,
                  { description: "", qty: "1", rate_usd: "0" },
                ])
              }
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="size-3" /> Add item
            </button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className={field}
                placeholder="Description"
                value={it.description}
                onChange={(e) =>
                  setItems((p) =>
                    p.map((r, i) =>
                      i === idx ? { ...r, description: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm"
                placeholder="Qty"
                value={it.qty}
                onChange={(e) =>
                  setItems((p) =>
                    p.map((r, i) =>
                      i === idx ? { ...r, qty: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                className="w-28 rounded-md border border-border bg-background px-2 py-2 text-sm"
                placeholder="Rate $"
                value={it.rate_usd}
                onChange={(e) =>
                  setItems((p) =>
                    p.map((r, i) =>
                      i === idx ? { ...r, rate_usd: e.target.value } : r,
                    ),
                  )
                }
              />
              <button
                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Amounts */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Total budget</span>
            <div className="flex gap-2">
              <input
                className={field}
                placeholder="USD"
                inputMode="decimal"
                disabled={items.length > 0}
                value={items.length ? String(itemsTotal) : totalUsd}
                onChange={(e) => setTotalUsd(e.target.value)}
              />
              <input
                className={field}
                placeholder="BDT"
                inputMode="decimal"
                disabled={items.length > 0}
                value={String(usdToBdt(effectiveTotal, rateNum))}
                onChange={(e) =>
                  setTotalUsd(String(bdtToUsd(n(e.target.value), rateNum)))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Total paid</span>
            <div className="flex gap-2">
              <input
                className={field}
                placeholder="USD"
                inputMode="decimal"
                value={paidUsd}
                onChange={(e) => setPaidUsd(e.target.value)}
              />
              <input
                className={field}
                placeholder="BDT"
                inputMode="decimal"
                value={String(usdToBdt(n(paidUsd), rateNum))}
                onChange={(e) =>
                  setPaidUsd(String(bdtToUsd(n(e.target.value), rateNum)))
                }
              />
            </div>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Notes</span>
          <textarea
            className={field}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span>Total</span>
            <span>
              {fmtUsd(calc.totalUsd)} · {fmtBdt(calc.totalBdt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Paid</span>
            <span>
              {fmtUsd(calc.paidUsd)} · {fmtBdt(calc.paidBdt)}
            </span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Due</span>
            <span>
              {fmtUsd(calc.dueUsd)} · {fmtBdt(calc.dueBdt)}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Create
            & Preview
          </button>
        </div>
      </div>
    </div>
  );
}
