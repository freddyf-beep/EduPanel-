"use client"
import { useState, useEffect } from "react"

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const syncStatus = () => setIsOnline(navigator.onLine)

    window.addEventListener("online",  handleOnline)
    window.addEventListener("offline", handleOffline)
    void Promise.resolve().then(syncStatus)

    return () => {
      window.removeEventListener("online",  handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}
