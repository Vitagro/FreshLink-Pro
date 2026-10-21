-- Atomic cash ledger writes: reject stale payloads, never silently overwrite them.
CREATE OR REPLACE FUNCTION public.fl_cash_write(p_rows jsonb, p_deletes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r jsonb; current_payload jsonb; row_id text; expected jsonb; desired jsonb;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_deletes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid cash ledger batch' USING ERRCODE = '22023';
  END IF;
  -- Serialize the entire batch, including insertion of previously absent IDs.
  PERFORM pg_advisory_xact_lock(71021, 11);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    row_id := r->>'id';
    IF row_id IS NULL OR row_id = '' OR jsonb_typeof(r->'payload') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid cash ledger row' USING ERRCODE = '22023';
    END IF;
    SELECT payload INTO current_payload FROM public.fl_caisse_entries WHERE id = row_id FOR UPDATE;
    desired := (r->'payload') || jsonb_build_object('id', row_id);
    IF desired->>'type' NOT IN ('entree', 'sortie') OR desired->>'type' IS NULL
       OR jsonb_typeof(desired->'montant') IS DISTINCT FROM 'number'
       OR (desired->>'montant')::numeric <= 0 THEN
      RAISE EXCEPTION 'Invalid cash entry amount or direction' USING ERRCODE = '22023';
    END IF;
    expected := r->'expectedPayload';
    IF current_payload IS NOT NULL THEN
      current_payload := current_payload || jsonb_build_object('id', row_id);
      IF current_payload = desired THEN CONTINUE; END IF; -- repeat delivery is harmless
      IF expected IS NULL OR expected = 'null'::jsonb OR
        current_payload IS DISTINCT FROM (expected || jsonb_build_object('id', row_id)) THEN
        RAISE EXCEPTION 'Cash ledger modified on another device. Refresh before saving.' USING ERRCODE = 'P0001';
      END IF;
    ELSIF expected IS NOT NULL AND expected <> 'null'::jsonb THEN
      RAISE EXCEPTION 'Cash ledger row removed on another device. Refresh before saving.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.fl_caisse_entries(id, payload, updated_at) VALUES(row_id, desired, clock_timestamp())
      ON CONFLICT(id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_deletes) LOOP
    row_id := r->>'id'; expected := r->'expectedPayload';
    SELECT payload INTO current_payload FROM public.fl_caisse_entries WHERE id = row_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF expected IS NULL OR expected = 'null'::jsonb OR
      (current_payload || jsonb_build_object('id', row_id)) IS DISTINCT FROM (expected || jsonb_build_object('id', row_id)) THEN
      RAISE EXCEPTION 'Cash ledger modified on another device. Refresh before deleting.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.fl_caisse_entries WHERE id = row_id;
  END LOOP;
  IF (SELECT COALESCE(sum(CASE WHEN payload->>'type' = 'entree' THEN (payload->>'montant')::numeric
      WHEN payload->>'type' = 'sortie' THEN -(payload->>'montant')::numeric ELSE 0 END), 0)
      FROM public.fl_caisse_entries) < 0 THEN
    RAISE EXCEPTION 'Insufficient cash balance' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fl_cash_write(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fl_cash_write(jsonb,jsonb) TO service_role;

