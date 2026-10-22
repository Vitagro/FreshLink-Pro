BEGIN;
DO $$ BEGIN
  IF public.fl_ai_reserve('isolated-quota-test',2,1000,10) IS DISTINCT FROM true THEN RAISE EXCEPTION 'first failed'; END IF;
  IF public.fl_ai_reserve('isolated-quota-test',2,1000,10) IS DISTINCT FROM true THEN RAISE EXCEPTION 'second failed'; END IF;
  IF public.fl_ai_reserve('isolated-quota-test',2,1000,10) IS DISTINCT FROM false THEN RAISE EXCEPTION 'daily quota bypass'; END IF;
  IF public.fl_ai_reserve('isolated-minute-test',100,1000,1) IS DISTINCT FROM true THEN RAISE EXCEPTION 'minute first failed'; END IF;
  IF public.fl_ai_reserve('isolated-minute-test',100,1000,1) IS DISTINCT FROM false THEN RAISE EXCEPTION 'minute quota bypass'; END IF;
  IF has_function_privilege('anon','public.fl_ai_reserve(text,integer,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'anonymous execute'; END IF;
  IF has_table_privilege('authenticated','public.fl_ai_usage','SELECT') THEN RAISE EXCEPTION 'public quota read'; END IF;
END $$;
SELECT 'PASS: minute/day quota and access restrictions' AS result;
ROLLBACK;
