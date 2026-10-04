/** Material lost to the opponent's best immediate capture, including recaptures.
 * Legal capture generators exclude pins and unsafe king captures. The cheapest
 * attacker opens any rook/bishop/cannon rays before the next exchange is tested.
 */
export type CaptureAdapter<P, M, S> = {
  captures: (position: P, side: S, check: () => void, target?: [number, number]) => Iterable<M>
  apply: (position: P, move: M, side: S) => P
  other: (side: S) => S
  target: (move: M) => [number, number]
  attackerValue: (position: P, move: M) => number
  gain: (position: P, move: M) => number
}

export function immediateCaptureGain<P, M, S>(position: P, side: S, rules: CaptureAdapter<P, M, S>, check: () => void, target?: [number, number], depth = 8): number {
  check()
  if (!depth) return 0
  const moves = [...rules.captures(position, side, check, target)]
  if (!moves.length) return 0
  // In an exchange on one square, try the least valuable legal attacker first.
  // Equal-cost promotion choices can have different subsequent exchanges.
  const minimum = target ? Math.min(...moves.map(move => rules.attackerValue(position, move))) : Infinity
  let best = 0
  for (const move of moves) {
    check()
    if (target && rules.attackerValue(position, move) > minimum) continue
    const next = rules.apply(position, move, side)
    const gain = rules.gain(position, move) - immediateCaptureGain(next, rules.other(side), rules, check, rules.target(move), depth - 1)
    best = Math.max(best, gain)
  }
  return best
}
