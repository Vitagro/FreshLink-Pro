BEGIN;
DO $check$
BEGIN
 IF has_table_privilege('anon','public.v_marketplace_catalogue','SELECT') OR has_table_privilege('authenticated','public.v_stock_complet','SELECT') OR has_table_privilege('anon','public.articles','SELECT') OR has_table_privilege('authenticated','public.articles','UPDATE') THEN RAISE EXCEPTION 'Legacy data still public'; END IF;
 IF has_function_privilege('anon','public.search_articles(text,text)','EXECUTE') THEN RAISE EXCEPTION 'Legacy search still public'; END IF;
END $check$;
SET LOCAL ROLE service_role;
SELECT count(*) AS catalogue_rows, 'service_role read passed' AS verification FROM public.v_marketplace_catalogue;
RESET ROLE;
ROLLBACK;
