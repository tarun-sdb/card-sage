// Pure validation for card reward data, no RN deps (runs under node --test).
export function validateCards(raw) {
  if (!raw || !Array.isArray(raw.cards) || !raw.cards.length) return null;
  const bad = raw.cards.filter((c) => !c.cardKey || !c.name || !Array.isArray(c.rewards));
  return bad.length ? null : raw.cards;
}