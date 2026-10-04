/** Restore a human decision, including its completed computer reply, in practice mode. */
export function getUndoIndex<T>(history: readonly { turn: T }[], mode: 'local' | 'ai', humanSide: T): number {
  if (mode === 'local') return history.length - 1
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].turn === humanSide) return index
  }
  return -1
}
