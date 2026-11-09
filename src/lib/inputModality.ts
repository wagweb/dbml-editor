/**
 * Records on the root element whether the last input came from the keyboard or a pointer.
 * `:focus-visible` cannot tell these apart for components that move focus on hover (menus),
 * so the stronger keyboard highlight would otherwise also follow the mouse.
 */
export function trackInputModality(): void {
  const root = document.documentElement
  const set = (modality: 'keyboard' | 'pointer') => {
    if (root.dataset.input !== modality) root.dataset.input = modality
  }
  window.addEventListener(
    'keydown',
    (event) => {
      // Modifier keys alone accompany pointer gestures (Ctrl + scroll, Shift + click).
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) set('keyboard')
    },
    true,
  )
  window.addEventListener('pointerdown', () => set('pointer'), true)
  // Chrome also reports a move when content changes under a resting pointer, for example
  // when a menu highlights the next row. Only a real change of position counts as using
  // the mouse, so the keyboard ring does not vanish under a pointer that never moved.
  let lastX = Number.NaN
  let lastY = Number.NaN
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.clientX === lastX && event.clientY === lastY) return
      lastX = event.clientX
      lastY = event.clientY
      set('pointer')
    },
    true,
  )
}
