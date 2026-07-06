"use client"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// ── Supabase Project: bxdqkigoidwnscsjafwd ─────────────────────────────────
// Get your keys at: https://supabase.com/dashboard/project/bxdqkigoidwnscsjafwd/settings/api
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co"

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4ZHFraWdvaWR3bnNjc2phZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTgxOTYsImV4cCI6MjA5ODM5NDE5Nn0.c5dzNldPofCGGq1MzWF78mGjrhqw5vXxZw_t9f9rEYM"

if (!SUPABASE_ANON_KEY && typeof window !== "undefined") {
  console.warn("[FreshLink] NEXT_PUBLIC_SUPABASE_ANON_KEY not set — running offline mode")
}

// Singleton — avoid multiple client instances
let _client: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (!_client) {
    _client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY || "offline")
  }
  return _client
}

// Public URL helper for freshlink-media storage bucket
export function getStorageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/freshlink-media/${path}`
}

export type StorageFolder =
  | "articles"
  | "conducteurs"
  | "signatures"
  | "documents"
  | "contrats"      // contrats CHR, devis clients
  | "permis"        // permis de conduire livreurs
  | "cartes_grises" // cartes grises véhicules
  | "photos_livreurs"

// Upload file to freshlink-media bucket — with base64 fallback if Storage unavailable
export async function uploadToStorage(
  file: File,
  folder: StorageFolder
): Promise<string | null> {
  try {
    const client = createClient()
    const ext = file.name.split(".").pop() ?? "jpg"
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const path = `${folder}/${Date.now()}_${safeName}`
    const { error } = await client.storage
      .from("freshlink-media")
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = client.storage.from("freshlink-media").getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    console.error("[storage] upload failed — fallback base64:", e)
    // Fallback: encode as base64 data URL for offline mode
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve(ev.target?.result as string ?? null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }
}

// Delete file from storage by public URL
export async function deleteFromStorage(publicUrl: string): Promise<boolean> {
  try {
    const client = createClient()
    // Extract path from public URL: .../object/public/freshlink-media/FOLDER/FILE
    const match = publicUrl.match(/freshlink-media\/(.+)$/)
    if (!match) return false
    const { error } = await client.storage.from("freshlink-media").remove([match[1]])
    return !error
  } catch {
    return false
  }
}
