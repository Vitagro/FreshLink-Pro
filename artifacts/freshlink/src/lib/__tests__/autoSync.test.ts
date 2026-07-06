import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { onLocalWrite, suppressAutoSync } from "@/lib/supabase/autoSync"

describe("autoSync — write-through Supabase", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("pousse vers /api/sync-write les lignes d'une table synchronisée", async () => {
    onLocalWrite("fl_articles", JSON.stringify([{ id: "a1", nom: "Tomate" }]))
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/sync-write")
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body.table).toBe("fl_articles")
    expect(body.upserts[0].id).toBe("a1")
  })

  it("ignore les clés non synchronisées (cache local pur)", async () => {
    onLocalWrite("fl_ui_state", JSON.stringify([{ id: "x" }]))
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("amorce le snapshot en hydratation sans pousser, puis ne repousse pas l'identique", async () => {
    const data = JSON.stringify([{ id: "c1", nom: "Client A" }])
    // Écriture issue d'une lecture Supabase → seed, aucun push
    suppressAutoSync(() => onLocalWrite("fl_clients", data))
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
    // Réécriture du même contenu → diff vide → aucun push
    onLocalWrite("fl_clients", data)
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
