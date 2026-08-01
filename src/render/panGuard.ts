/** A drag that panned the chart must not also register as a click on a bar. */

let lastPan = 0

export function markPanned(): void {
  lastPan = performance.now()
}

export function wasPanning(withinMs = 250): boolean {
  return performance.now() - lastPan < withinMs
}
