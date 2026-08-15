type RouteLocationSnapshot = {
  pathname: string;
  search: string;
  hash: string;
};

/** True while BrowserRouter history is ahead of React's last committed location. */
export function isBrowserRouteCommitPending(location: RouteLocationSnapshot): boolean {
  const historyState = window.history.state as { idx?: unknown } | null;
  return typeof historyState?.idx === 'number' && (
    window.location.pathname !== location.pathname
    || window.location.search !== location.search
    || window.location.hash !== location.hash
  );
}
