import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * `useSyncExternalStore` rather than a `useState` + `useEffect` pair:
 * `matchMedia` is exactly the external, mutable store this hook exists for,
 * and subscribing this way never needs a synchronous `setState` call inside
 * the effect body itself — which the project's lint rules refuse, since that
 * pattern causes a cascading extra render on every mount.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
