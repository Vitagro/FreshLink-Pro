-- Public sites use /api/ext/catalogue, which returns an explicit public-field allowlist.
-- Legacy direct views contain purchase costs and internal stock: server access only.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER VIEW public.v_marketplace_catalogue SET (security_invoker = true);
ALTER VIEW public.v_catalogue_public SET (security_invoker = true);
ALTER VIEW public.v_stock_complet SET (security_invoker = true);
ALTER VIEW public.v_alertes_stock SET (security_invoker = true);
REVOKE ALL ON public.v_marketplace_catalogue, public.v_catalogue_public, public.v_stock_complet, public.v_alertes_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_marketplace_catalogue, public.v_catalogue_public, public.v_stock_complet, public.v_alertes_stock TO service_role;
-- Legacy articles policies include an unrestricted authenticated write rule.
-- Revoke the direct grants; the active ERP uses fl_articles through its server.
REVOKE ALL ON public.articles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.articles TO service_role;
ALTER FUNCTION public.search_articles(text,text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog, public;
REVOKE EXECUTE ON FUNCTION public.search_articles(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_articles(text,text) TO service_role;
COMMIT;
