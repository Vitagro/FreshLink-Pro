import { useEffect, useState } from "react"

export default function CatalogueSyncWarning() {
  const [error, setError] = useState("")
  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.table === "fl_articles") setError(detail.error || "Sauvegarde du catalogue non confirmée.")
    }
    window.addEventListener("fl_sync_error", onError)
    return () => window.removeEventListener("fl_sync_error", onError)
  }, [])
  if (!error) return null
  return <div role="alert" className="fixed bottom-4 left-4 right-4 z-[9999] rounded-xl border border-red-500 bg-red-950 p-4 text-white shadow-xl">
    <p className="font-bold">Modification du catalogue non enregistrée</p>
    <p className="text-sm">{error}</p>
    <p className="text-sm mt-1">Notez votre modification avant d’actualiser, puis refaites-la sur les données à jour.</p>
    <button className="mt-2 rounded bg-white px-3 py-2 text-red-950" onClick={() => window.location.reload()}>Actualiser les données</button>
  </div>
}
