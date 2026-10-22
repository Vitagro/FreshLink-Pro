CREATE TABLE IF NOT EXISTS public.fl_ai_usage (
  day date NOT NULL,
  subject text NOT NULL,
  calls integer NOT NULL DEFAULT 0 CHECK(calls >= 0),
  minute timestamptz NOT NULL,
  minute_calls integer NOT NULL DEFAULT 0 CHECK(minute_calls >= 0),
  PRIMARY KEY(day,subject)
);
ALTER TABLE public.fl_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fl_ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.fl_ai_reserve(p_user text, p_daily integer DEFAULT 100, p_global integer DEFAULT 1000, p_minute integer DEFAULT 10)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_minute timestamptz := date_trunc('minute',now());
  v_subject text := 'user:' || p_user;
  v_global public.fl_ai_usage%ROWTYPE;
  v_user public.fl_ai_usage%ROWTYPE;
BEGIN
  IF p_user IS NULL OR length(p_user)=0 OR length(p_user)>200 OR p_daily IS NULL OR p_global IS NULL OR p_minute IS NULL OR p_daily NOT BETWEEN 1 AND 1000 OR p_global NOT BETWEEN 1 AND 10000 OR p_minute NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Invalid quota arguments' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(71022,1);
  INSERT INTO public.fl_ai_usage(day,subject,minute) VALUES(v_day,'global',v_minute),(v_day,v_subject,v_minute) ON CONFLICT DO NOTHING;
  SELECT * INTO v_global FROM public.fl_ai_usage WHERE day=v_day AND subject='global';
  SELECT * INTO v_user FROM public.fl_ai_usage WHERE day=v_day AND subject=v_subject;
  IF v_global.calls >= p_global OR v_user.calls >= p_daily OR (v_user.minute=v_minute AND v_user.minute_calls>=p_minute) THEN RETURN false; END IF;
  UPDATE public.fl_ai_usage SET calls=calls+1,minute_calls=CASE WHEN minute=v_minute THEN minute_calls+1 ELSE 1 END,minute=v_minute WHERE day=v_day AND subject IN ('global',v_subject);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fl_ai_reserve(text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fl_ai_reserve(text,integer,integer,integer) TO service_role;
