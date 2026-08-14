-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  -- snapshot of client info at invoice time
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,
  -- money (USD is the source of truth, BDT = USD * usd_rate)
  usd_rate NUMERIC(12,4) NOT NULL DEFAULT 120,
  total_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_usd  NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  rate_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_all_authenticated" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoice_items_all_authenticated" ON public.invoice_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX invoices_invoice_no_unique ON public.invoices(invoice_no);
CREATE INDEX invoices_client_idx ON public.invoices(client_id);
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- next invoice number helper: INV-000001
CREATE OR REPLACE FUNCTION public.next_invoice_no()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || LPAD((COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '\D', '', 'g'), ''))::BIGINT, 0) + 1)::TEXT, 6, '0')
  FROM public.invoices;
$$;
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO authenticated;
