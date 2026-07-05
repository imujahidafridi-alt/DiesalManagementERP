import React, { useEffect } from 'react'
import { useUiStore } from '@/store'

interface ShortcutProviderProps {
  children: React.ReactNode
}

export default function ShortcutProvider({ children }: ShortcutProviderProps) {
  const { setSearchOpen, searchOpen, dialog, closeDialog } = useUiStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for modifier keys
      const hasCtrl = e.ctrlKey || e.metaKey

      // Escape key handler: dismiss dialogs and search overlays first
      if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false)
          e.preventDefault()
          return
        }
        if (dialog) {
          closeDialog()
          e.preventDefault()
          return
        }
        // If nothing open, bubble event
        window.dispatchEvent(new CustomEvent('app-shortcut-escape'))
      }

      // Ctrl + F: Search Lookup Dialog
      if (hasCtrl && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      // Ctrl + N: New entity/record
      if (hasCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app-shortcut-new'))
        return
      }

      // Ctrl + S: Save form/record
      if (hasCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app-shortcut-save'))
        return
      }

      // Ctrl + R: Refresh / Reload
      if (hasCtrl && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app-shortcut-refresh'))
        return
      }

      // Ctrl + E: Export
      if (hasCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app-shortcut-export'))
        return
      }

      // Ctrl + P: Print
      if (hasCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app-shortcut-print'))
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen, dialog, setSearchOpen, closeDialog])

  return <>{children}</>
}

/**
 * Reusable React Hook for sub-pages to quickly bind to specific key combo events
 */
export function useShortcutEffect(
  event: 'new' | 'save' | 'refresh' | 'escape' | 'export' | 'print',
  callback: () => void
) {
  useEffect(() => {
    const handler = () => callback()
    window.addEventListener(`app-shortcut-${event}`, handler)
    return () => window.removeEventListener(`app-shortcut-${event}`, handler)
  }, [event, callback])
}
