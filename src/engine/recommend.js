// Recommendation engine. Pure functions, no React deps.
// Input: user's cards (from CardAdvisor dataset), action, amount, spend-used-per-card.
// Output: ranked card picks for that action.

// Card earns effective ratePct (already cash-equivalent per dataset).
// App fee reduces it: net = rate - fee.
export function netRate(card, action, app) {
  const reward = rewardFor(card, action, app);
  if (!reward) return null;
  const fee = app?.feePct ?? 0;
  return { ...reward, netPct: reward.ratePct - fee };
}

// Find the reward row that applies to this action+app.
// Merchant-scoped rows (co-brand, portal) fire ONLY when target app matches;
// otherwise they're ignored entirely (a PhonePe-exclusive rate is never
// a generic category rate).
export function rewardFor(card, action, app) {
  const rows = card.rewards || [];
  const scoped = (r) => !!r.merchants;
  // A scoped row fires only when BOTH: it mentions the chosen app, OR the
  // action's merchant keywords, AND its category matches the action.
  const inScope = (r) =>
    r.category === action.category &&
    (app && r.merchants.toLowerCase().includes(app.id.replace("-", " ")) ||
      (action.merchantKeywords || []).some((k) => r.merchants.toLowerCase().includes(k)));
  if (app) {
    const byMerchant = rows.filter((r) => scoped(r) && inScope(r));
    if (byMerchant.length) return bestRow(byMerchant);
  }
  // Generic rows only: unscoped, matching the action's category.
  if (action.category) {
    const byCat = rows.filter((r) => !scoped(r) && r.category === action.category);
    if (byCat.length) return bestRow(byCat);
  }
  return bestRow(rows.filter((r) => !scoped(r) && r.category === "DEFAULT"));
}

function bestRow(rows) {
  return rows.reduce((a, b) => (b.ratePct > a.ratePct ? b : a));
}

// Rank user's cards for an action+app, minus monthly cap already spent.
export function recommend(userCards, action, app, spent = {}) {
  return userCards
    .map((c) => {
      const r = netRate(c, action, app);
      if (!r) return null;
      const key = `${c.cardKey}:${r.category}`;
      const used = spent[key] || 0;
      const cap = r.monthlyCapRs;
      const remaining = cap != null ? Math.max(0, cap - used) : null;
      return { card: c, reward: r, used, cap, remaining };
    })
    .filter(Boolean)
    .sort((a, b) => b.reward.netPct - a.reward.netPct);
}

// Skip-card actions (bills where fees beat rewards). Returns true when even the
// best card's net rate can't beat the fee-free default (bank app / UPI).
export function shouldSkipCard(userCards, action, app, spent = {}) {
  if (!action.note && !action.apps.some((a) => a.recommend === "skip-card")) return false;
  const top = recommend(userCards, action, app, spent)[0];
  // Net rate under ~0.5% isn't worth card friction; default is fee-free.
  return !top || top.reward.netPct < 0.5;
}
