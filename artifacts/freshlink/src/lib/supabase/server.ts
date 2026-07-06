// Server-side Supabase client — uses supabase-js directly (no @supabase/ssr needed)
import { createClient as _create } from "@supabase/supabase-js"

const URL = import.meta.env.VITE_SUPABASE_URL ?? "https://bxdqkigoidwnscsjafwd.supabase.co"
const KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4ZHFraWdvaWR3bnNjc2phZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTgxOTYsImV4cCI6MjA5ODM5NDE5Nn0.c5dzNldPofCGGq1MzWF78mGjrhqw5vXxZw_t9f9rEYM"

export async function createClient() {
  return _create(URL, KEY)
}
