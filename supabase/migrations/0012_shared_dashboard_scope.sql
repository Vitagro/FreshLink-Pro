CREATE TABLE IF NOT EXISTS public.fl_dashboard_settings (
  id text PRIMARY KEY CHECK (id = 'global'),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fl_dashboard_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fl_dashboard_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.fl_dashboard_settings TO service_role;
INSERT INTO public.fl_dashboard_settings(id,payload)
VALUES ('global','{"scope":"real"}'::jsonb) ON CONFLICT(id) DO NOTHING;
