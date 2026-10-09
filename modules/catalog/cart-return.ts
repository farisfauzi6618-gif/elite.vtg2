export type CartLine = { productId: string; groupId: string; quantity: number; name: string; label: string };
export type BasketHandoff = { id: string; lines: { productId: string; groupId: string; quantity: number }[] };

export function reconcileReturnedCart(cart: CartLine[], pending: unknown, fragment: string) {
  const id = new URLSearchParams(fragment.replace(/^#/, '')).get('belanja-lagi');
  if (!id || !pending || typeof pending !== 'object') return { cart, completed: false };
  const handoff = pending as BasketHandoff;
  if (handoff.id !== id || !Array.isArray(handoff.lines) || handoff.lines.length > 20 ||
    handoff.lines.some(x => !x || typeof x.productId !== 'string' || typeof x.groupId !== 'string' || !Number.isSafeInteger(x.quantity) || x.quantity < 1 || x.quantity > 20)) {
    return { cart, completed: false };
  }
  // This is device-local basket cleanup, never proof of payment or a stock mutation.
  const remaining = cart.map(x => {
    const sent = handoff.lines.filter(l => l.productId === x.productId && l.groupId === x.groupId).reduce((n,l) => n + l.quantity, 0);
    return { ...x, quantity: Math.max(0, x.quantity - sent) };
  }).filter(x => x.quantity > 0);
  return { cart: remaining, completed: true };
}
