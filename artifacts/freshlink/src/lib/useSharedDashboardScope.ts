import { useEffect, useRef, useState } from "react"
import type { OrderScope } from "./dashboardMetrics"

export function useSharedDashboardScope(userId: string) {
  const [scope, setScope] = useState<OrderScope>("real")
  const [ready, setReady] = useState(false)
  const [canChange, setCanChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const sequence = useRef(0)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    setReady(false)
    setCanChange(false)
    const refresh = async () => {
      if (busy.current) return
      const current = ++sequence.current
      try {
        const response = await fetch("/api/dashboard-scope", { cache:"no-store" })
        const body = await response.json()
        if (!response.ok || !body.ok || !["real", "simulation"].includes(body.scope)) throw new Error(body.error || "Lecture du mode impossible.")
        if (active && current === sequence.current) {
          setScope(body.scope); setCanChange(body.canChange === true); setReady(true); setError("")
        }
      } catch (err) {
        if (active && current === sequence.current) {
          setReady(false); setError(err instanceof Error ? err.message : "Lecture du mode impossible.")
        }
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 15000)
    const onFocus = () => { void refresh() }
    window.addEventListener("focus", onFocus)
    return () => { active = false; ++sequence.current; window.clearInterval(timer); window.removeEventListener("focus", onFocus) }
  }, [userId])
  const changeScope = async (next: OrderScope) => {
    if (!canChange || busy.current || next === scope) return
    busy.current = true; setSaving(true); setError("")
    const current = ++sequence.current
    try {
      const response = await fetch("/api/dashboard-scope", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({scope:next}) })
      const body = await response.json()
      if (!response.ok || !body.ok || body.scope !== next) throw new Error(body.error || "Le mode n’a pas été enregistré.")
      if (current === sequence.current) { setScope(next); setReady(true) }
    } catch (err) {
      if (current === sequence.current) setError(err instanceof Error ? err.message : "Le mode n’a pas été enregistré.")
    } finally { busy.current = false; setSaving(false) }
  }
  return {scope, ready, canChange, saving, error, changeScope}
}
