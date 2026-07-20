import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'

export function useInactivityTimer() {
  const { isAppUnlocked, inactivityTimeoutMinutes, lockApp } = useAppStore()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!isAppUnlocked || inactivityTimeoutMinutes <= 0) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const timeoutMs = inactivityTimeoutMinutes * 60 * 1000

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        console.warn(`Inactivity timeout (${inactivityTimeoutMinutes}m) reached. Locking session.`)
        lockApp()
      }, timeoutMs)
    }

    // Attach event listeners for user activity
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true })
    })

    resetTimer()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer)
      })
    }
  }, [isAppUnlocked, inactivityTimeoutMinutes, lockApp])
}
