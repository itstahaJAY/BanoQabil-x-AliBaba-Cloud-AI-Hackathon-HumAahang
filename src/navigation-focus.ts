// The persistent main landmark is outside the navigator's aria-hidden screens.
export function prepareNavigationFocus(doc?: Document) {
  const root = doc?.querySelector<HTMLElement>('[data-navigation-root]');
  const active = doc?.activeElement;
  if (root && active && active !== root && root.contains(active)) root.focus({ preventScroll: true });
}

export function completeNavigationFocus(doc?: Document) {
  const root = doc?.querySelector<HTMLElement>('[data-navigation-root]');
  if (!root || !doc) return;
  const active = doc.activeElement;
  // Keep keyboard focus on a visible tab/control. Recover only lost or hidden focus.
  if (!active || active === doc.body || active === root || active.closest('[aria-hidden="true"], [inert]') || !active.getClientRects().length) {
    root.focus({ preventScroll: true });
  }
}
