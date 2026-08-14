-- ============ AUTO INVOICE NUMBER (INV-000001, INV-000002 …) ============
-- সিকোয়েন্স: বিদ্যমান সর্বোচ্চ নম্বরের পর থেকে শুরু হবে
CREATE SEQUENCE IF NOT EXISTS public.invoice_no_seq AS BIGINT START WITH 1;

SELECT setval(
  'public.invoice_no_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '\D', '', 'g'), ''))::BIGINT, 0)
       FROM public.invoices),
    1
  ),
  (SELECT EXISTS (SELECT 1 FROM public.invoices))
);

GRANT USAGE, SELECT ON SEQUENCE public.invoice_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoice_no_seq TO service_role;

-- BEFORE INSERT trigger: invoice_no না দিলে নিজে থেকেই পরের নম্বর বসাবে ও save হবে
CREATE OR REPLACE FUNCTION public.tg_set_invoice_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF NEW.invoice_no IS NOT NULL AND btrim(NEW.invoice_no) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := 'INV-' || LPAD(nextval('public.invoice_no_seq')::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invoices WHERE invoice_no = candidate);
  END LOOP;

  NEW.invoice_no := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_set_invoice_no ON public.invoices;
CREATE TRIGGER invoices_set_invoice_no
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_invoice_no();

-- পুরোনো helper টি প্রিভিউয়ের জন্য রাখা হলো (পরের নম্বর দেখাতে)
CREATE OR REPLACE FUNCTION public.next_invoice_no()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || LPAD(
    (COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '\D', '', 'g'), ''))::BIGINT, 0) + 1)::TEXT,
    6, '0')
  FROM public.invoices;
$$;
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO authenticated;
