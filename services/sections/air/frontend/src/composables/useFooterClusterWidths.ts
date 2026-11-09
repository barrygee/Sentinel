import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** How far the footer's button groups reach in from each edge of the window, in px. */
export interface FooterClusterWidths {
  /** From the left edge to the right edge of `#footer-left`. */
  left: Ref<number>
  /** From the right edge to the left edge of `#footer-right`. */
  right: Ref<number>
}

/**
 * Tracks how much of the footer bar its left and right button groups take up,
 * so something laid over the footer (the altitude legend) can keep clear of
 * them. The right group grows when a section adds a live item to it, such as
 * SDR's tuned frequency, so its size is watched rather than assumed.
 *
 * The footer belongs to the shell, so the groups are found by id; when one is
 * missing (no shell, as in unit tests) its width stays 0.
 */
export function useFooterClusterWidths(): FooterClusterWidths {
  const left = ref(0)
  const right = ref(0)
  let resizeObserver: ResizeObserver | null = null

  function measure(): void {
    const leftCluster = document.getElementById('footer-left')
    const rightCluster = document.getElementById('footer-right')
    left.value = leftCluster ? leftCluster.getBoundingClientRect().right : 0
    right.value = rightCluster ? window.innerWidth - rightCluster.getBoundingClientRect().left : 0
  }

  onMounted(() => {
    measure()
    // A group's size changes when an item appears in it; its position changes
    // with the window, which the observer does not report.
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(measure)
    for (const id of ['footer-left', 'footer-right']) {
      const cluster = document.getElementById(id)
      if (cluster) resizeObserver.observe(cluster)
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', measure)
    resizeObserver?.disconnect()
  })

  return { left, right }
}
