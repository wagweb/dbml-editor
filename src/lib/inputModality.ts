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
  window.addEventListener('pointermove', () => set('pointer'), true)
}
