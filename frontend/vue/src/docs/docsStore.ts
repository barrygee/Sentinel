import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Delay before a message is spoken, so a repeat of the same text is heard again. */
const ANNOUNCE_DELAY_MS = 50

/**
 * Docs state that has to outlive a component: whether the navigation columns
 * are showing (the footer's side-panel button toggles it, from outside the
 * page), whether a docs page is on screen (so the footer knows which panel that
 * button controls), and the message the page's single live region speaks.
 */
export const useDocsStore = defineStore('docs', () => {
  /** Visibility of the group rail and page list, toggled from the footer. */
  const sidebarOpen = ref(true)
  /** True while the docs page is mounted. */
  const active = ref(false)
  /** What the page's `role="status"` region currently says. */
  const announcement = ref('')

  /** Show or hide the group rail and page list. */
  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  /** Records that the docs page is mounted or gone. */
  function setActive(isActive: boolean): void {
    active.value = isActive
  }

  /**
   * Speaks a message through the page's one live region. The text is cleared
   * first so announcing the same sentence twice ("Copied to clipboard") is
   * still heard the second time.
   */
  function announce(message: string): void {
    announcement.value = ''
    setTimeout(() => {
      announcement.value = message
    }, ANNOUNCE_DELAY_MS)
  }

  return { sidebarOpen, active, announcement, toggleSidebar, setActive, announce }
})
