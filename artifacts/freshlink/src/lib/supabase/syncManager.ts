export interface SyncProgress {
  step: string
  done: number
  total: number
  errors: number
  finished: boolean
}

const TABLES = [
  "fl_clients", "fl_articles", "fl_commandes", "fl_achats",
  "fl_stock", "fl_cash", "fl_fournisseurs", "fl_users",
  "fl_dispatch", "fl_retours", "fl_bons_livraison",
]

const SYNC_DONE_KEY = "fl_sync_done"

let aborted = false

export function isSyncDone(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(SYNC_DONE_KEY) === "1"
}

export function resetSync() {
  aborted = false
  if (typeof window !== "undefined") {
    localStorage.removeItem(SYNC_DONE_KEY)
  }
}

export async function runFullSync(onProgress: (p: SyncProgress) => void): Promise<void> {
  aborted = false
  const total = TABLES.length
  let done = 0
  let errors = 0

  const { createClient } = await import("@/lib/supabase/client")
  const sb = createClient()

  for (const table of TABLES) {
    if (aborted) break

    onProgress({ step: `Sync ${table}...`, done, total, errors, finished: false })

    try {
      const { data, error } = await sb
        .from(table as "fl_clients")
        .select("id, payload, updated_at")
        .limit(5000)

      if (error) {
        errors++
      } else if (data && Array.isArray(data) && data.length > 0) {
        type Row = { id: string; payload: Record<string, unknown>; updated_at: string }
        const rows = data as Row[]

        for (const row of rows) {
          const key = `${table}:${row.id}`
          const local = localStorage.getItem(key)
          if (!local) {
            localStorage.setItem(key, JSON.stringify(row.payload))
          } else {
            try {
              const localPayload = JSON.parse(local) as Record<string, unknown>
              const localTs = localPayload.__updated_at as string | undefined
              if (!localTs || row.updated_at > localTs) {
                localStorage.setItem(key, JSON.stringify(row.payload))
              }
            } catch { /* skip malformed */ }
          }
        }

        // Push local-only rows up to Supabase
        const upserts: { id: string; payload: Record<string, unknown>; updated_at: string }[] = []
        const prefix = `${table}:`
        for (let j = 0; j < localStorage.length; j++) {
          const k = localStorage.key(j)
          if (!k?.startsWith(prefix)) continue
          const id = k.slice(prefix.length)
          const remoteRow = rows.find(r => r.id === id)
          if (!remoteRow) {
            try {
              const payload = JSON.parse(localStorage.getItem(k) ?? "{}") as Record<string, unknown>
              upserts.push({ id, payload, updated_at: new Date().toISOString() })
            } catch { /* skip malformed */ }
          }
        }
        if (upserts.length > 0) {
          const res = await fetch("/api/sync-write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table, upserts }),
          })
          if (!res.ok) errors++
        }
      }
    } catch {
      errors++
    }

    done++
    window.dispatchEvent(new CustomEvent("fl_store_updated"))
  }

  localStorage.setItem(SYNC_DONE_KEY, "1")
  onProgress({ step: "Terminé", done: total, total, errors, finished: true })
}
