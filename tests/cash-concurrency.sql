BEGIN;
DO $$
DECLARE deposit_id text := 'TEST-CASH-' || gen_random_uuid(); debit_id text := 'TEST-CASH-' || gen_random_uuid();
  rejected_id text := 'TEST-CASH-' || gen_random_uuid(); balance numeric; funding numeric; entry jsonb; rejected boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(71021,11);
  SELECT COALESCE(sum(CASE WHEN payload->>'type'='entree' THEN (payload->>'montant')::numeric
    WHEN payload->>'type'='sortie' THEN -(payload->>'montant')::numeric ELSE 0 END),0)
    INTO balance FROM public.fl_caisse_entries;
  funding := greatest(0,-balance) + 10;
  PERFORM public.fl_cash_write(jsonb_build_array(jsonb_build_object('id',deposit_id,
    'payload',jsonb_build_object('id',deposit_id,'type','entree','montant',funding))));
  entry := jsonb_build_object('id',debit_id,'type','sortie','montant',balance+funding-4);
  PERFORM public.fl_cash_write(jsonb_build_array(jsonb_build_object('id',debit_id,'payload',entry)));
  PERFORM public.fl_cash_write(jsonb_build_array(jsonb_build_object('id',debit_id,'payload',entry)));
  rejected := false;
  BEGIN
    PERFORM public.fl_cash_write(jsonb_build_array(jsonb_build_object('id',rejected_id,
      'payload',jsonb_build_object('id',rejected_id,'type','sortie','montant',5))));
  EXCEPTION WHEN SQLSTATE 'P0002' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Overspending accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.fl_caisse_entries WHERE id=rejected_id) THEN RAISE EXCEPTION 'Rejected debit persisted'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.fl_cash_write(jsonb_build_array(jsonb_build_object('id',rejected_id,
      'payload',jsonb_build_object('id',rejected_id,'type','sortie','montant',-5))));
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Negative debit accepted'; END IF;
  IF has_function_privilege('anon','public.fl_cash_write(jsonb,jsonb)','EXECUTE') OR
    has_function_privilege('authenticated','public.fl_cash_write(jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Public cash execution allowed';
  END IF;
END $$;
SELECT 'PASS: overspending refused, debit rolled back, retry safe, negative amount refused, service-only access' AS verification;
ROLLBACK;
