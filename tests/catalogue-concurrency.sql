-- Isolated fixture IDs; the transaction is always rolled back.
BEGIN;
DO $$
DECLARE id1 text := 'TEST-CAS-' || gen_random_uuid(); id2 text := 'TEST-CAS-' || gen_random_uuid();
  original jsonb; changed jsonb; rejected boolean; actual jsonb;
BEGIN
  original := jsonb_build_object('id', id1, 'nom', 'Isolated test', 'stockDisponible', 10);
  changed := original || '{"stockDisponible":9}'::jsonb;
  PERFORM public.fl_catalogue_write(jsonb_build_array(jsonb_build_object('id',id1,'payload',original)));
  PERFORM public.fl_catalogue_write(jsonb_build_array(jsonb_build_object('id',id1,'payload',changed,'expectedPayload',original)));
  -- Retry after a lost response must not change stock twice.
  PERFORM public.fl_catalogue_write(jsonb_build_array(jsonb_build_object('id',id1,'payload',changed,'expectedPayload',original)));
  rejected := false;
  BEGIN
    PERFORM public.fl_catalogue_write(jsonb_build_array(
      jsonb_build_object('id',id2,'payload',jsonb_build_object('id',id2)),
      jsonb_build_object('id',id1,'payload',original || '{"stockDisponible":8}'::jsonb,'expectedPayload',original)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale save accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.fl_articles WHERE id=id2) THEN RAISE EXCEPTION 'Partial batch committed'; END IF;
  SELECT payload INTO actual FROM public.fl_articles WHERE id=id1;
  IF actual IS DISTINCT FROM changed THEN RAISE EXCEPTION 'Stock overwritten'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.fl_catalogue_write('[]'::jsonb,jsonb_build_array(jsonb_build_object('id',id1,'expectedPayload',original)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale delete accepted'; END IF;
  IF has_function_privilege('anon','public.fl_catalogue_write(jsonb,jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.fl_catalogue_write(jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Public execution allowed';
  END IF;
  PERFORM public.fl_catalogue_write('[]'::jsonb,jsonb_build_array(jsonb_build_object('id',id1,'expectedPayload',changed)));
  IF EXISTS(SELECT 1 FROM public.fl_articles WHERE id=id1) THEN RAISE EXCEPTION 'Expected delete failed'; END IF;
END $$;
SELECT 'PASS: stale write, batch rollback, retry, stale delete, permissions' AS verification;
ROLLBACK;
