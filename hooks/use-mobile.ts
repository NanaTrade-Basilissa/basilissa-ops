import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * `useSyncExternalStore` rather than a `useState` + `useEffect` pair:
 * `matchMedia` is exactly the external, mutable store this hook exists for,
 * and subscribing this way never needs a synchronous `setState` call inside
 * the effect body itself — which the project's lint rules refuse, since that
 * pattern causes a cascading extra render on every mount.
 */
function subscribe(breakpoint: number) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }
}

/**
 * `breakpoint` defaults to the sidebar's own 768px (Tailwind `md`), but
 * callers matching a different Tailwind breakpoint in their className
 * (e.g. `sm:` at 640px) should pass that same number so the JS-driven
 * layout switch and the CSS one flip at the same width.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  return React.useSyncExternalStore(
    subscribe(breakpoint),
    () => window.innerWidth < breakpoint,
    () => false,
  )
}
