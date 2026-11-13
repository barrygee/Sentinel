/**
 * The page's own address. A function rather than `window.location` read in
 * place so a spec can stand in an HTTPS page: jsdom's `location` can't be
 * replaced.
 */
export function pageLocation(): Location {
  return window.location
}
