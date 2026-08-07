import { useEffect, useMemo, useState } from "react";
import dataset from "./data/cards.json";
import { ACTIONS } from "./engine/actions";
import { recommend, shouldSkipCard } from "./engine/recommend";
import "./App.css";

const WALLET_KEY = "card-sage-wallet";

function loadWallet() {
  try {
    const saved = JSON.parse(localStorage.getItem(WALLET_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function App() {
  const [actionId, setActionId] = useState(ACTIONS[0].id);
  const [appId, setAppId] = useState(ACTIONS[0].apps[0].id);
  const [amount, setAmount] = useState(500);
  const [spentText, setSpentText] = useState("");
  const [walletKeys, setWalletKeys] = useState(loadWallet);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    localStorage.setItem(WALLET_KEY, JSON.stringify(walletKeys));
  }, [walletKeys]);

  const action = ACTIONS.find((a) => a.id === actionId);
  const app = action.apps.find((a) => a.id === appId) || action.apps[0];

  const wallet = useMemo(
    () => dataset.cards.filter((c) => walletKeys.includes(c.cardKey)),
    [walletKeys]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? dataset.cards.filter(
          (c) =>
            c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q)
        )
      : [];
  }, [query]);

  const spent = useMemo(() => {
    const m = {};
    spentText.split(",").forEach((pair) => {
      const [k, v] = pair.split(":").map((s) => s.trim());
      if (k && v) m[k] = Number(v);
    });
    return m;
  }, [spentText]);

  const picks = useMemo(
    () => recommend(wallet, action, app, spent),
    [wallet, action, app, spent]
  );
  const skip = shouldSkipCard(wallet, action, app, spent);

  const onAction = (id) => {
    const a = ACTIONS.find((x) => x.id === id);
    setActionId(id);
    setAppId(a.apps[0].id);
  };

  const toggleCard = (key) => {
    setWalletKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
    );
  };

  return (
    <div className="app">
      <header className="header-row">
        <div>
          <h1>Card Sage</h1>
          <p>Which card for this purchase? India cashback, fees and caps.</p>
        </div>
        <button className="wallet-btn" onClick={() => setPicking(true)}>
          Wallet ({wallet.length})
        </button>
      </header>

      {wallet.length === 0 && (
        <div className="panel empty-wallet">
          No cards in wallet.{" "}
          <button className="btn" onClick={() => setPicking(true)}>
            Add your cards
          </button>
        </div>
      )}

      <section className="actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            className={a.id === actionId ? "action active" : "action"}
            onClick={() => onAction(a.id)}
          >
            <span className="action-icon">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </section>

      <section className="panel">
        <div className="row">
          <label>
            App
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              {action.apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}{a.feePct ? ` (+${a.feePct}% fee)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (₹)
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
        </div>
        {action.note && <p className="note">{action.note}</p>}
        {app.warn && <p className="warn">⚠ {app.warn}</p>}
      </section>

      <section className="results">
        {wallet.length === 0 ? (
          <div className="card-pick skip">
            <div>
              <strong>Add cards first.</strong> Wallet empty — pick cards you own.
            </div>
          </div>
        ) : skip ? (
          <div className="card-pick skip">
            <div>
              <strong>Skip the card.</strong> {action.label} — bank app / UPI /
              cash better. Fees beat rewards here.
            </div>
          </div>
        ) : (
          picks.map((p, i) => {
            const gain = (p.reward.netPct / 100) * amount;
            return (
              <div key={p.card.cardKey} className="card-pick">
                <div className="rank">{i + 1}</div>
                <div className="pick-body">
                  <strong>{p.card.name}</strong>
                  <div className="meta">
                    {p.reward.rewardType} · {p.reward.netPct}% net
                    {app.feePct ? ` (${p.reward.ratePct}% − ${app.feePct}% fee)` : ""}
                    {p.cap != null && (
                      <span className={p.remaining === 0 ? "cap-out" : "cap"}>
                        {" "}
                        · cap ₹{p.cap}/mo, {p.remaining} left
                      </span>
                    )}
                  </div>
                  <div className="gain">≈ ₹{gain.toFixed(0)} back</div>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="panel redirect">
        <h3>Pay via {app.label}</h3>
        {app.url ? (
          <a className="btn" href={app.url} target="_blank" rel="noreferrer">
            Go to {app.label} →
          </a>
        ) : (
          <span className="muted">No redirect — do it in person / app</span>
        )}
      </section>

      <section className="panel">
        <label>
          Spent this month per card:category (debug, e.g. <code>sbi-cashback:UTILITY_BILLS:3000</code>)
          <input
            type="text"
            value={spentText}
            placeholder="cardKey:CATEGORY:amount, ..."
            onChange={(e) => setSpentText(e.target.value)}
          />
        </label>
      </section>

      <footer>
        <p>
          Data: CardAdvisor India Credit Card Facts (CC BY 4.0) ·{" "}
          <a href="https://cardadvisor.in/data">cardadvisor.in/data</a>
        </p>
      </footer>

      {picking && (
        <div className="modal-backdrop" onClick={() => setPicking(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Your cards</h3>
              <button className="close" onClick={() => setPicking(false)}>✕</button>
            </div>
            <input
              className="search"
              placeholder="Search by name or bank…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="card-list">
              {filtered.slice(0, 60).map((c) => (
                <label key={c.cardKey} className="card-option">
                  <input
                    type="checkbox"
                    checked={walletKeys.includes(c.cardKey)}
                    onChange={() => toggleCard(c.cardKey)}
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.issuer} · {c.rewardRateMaxPct}% max</small>
                  </span>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="muted">Type to search 280 cards.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
