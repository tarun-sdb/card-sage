// Card data loader: fast path serves cache → bundle instantly (never block
// launch on the network), then a background fetch refreshes the cache and
// reports fresh data via callback. The remote source is GitHub raw for now
// (no server exists for card reward rates); swap REMOTE_URL when a real
// endpoint shows up.
import AsyncStorage from '@react-native-async-storage/async-storage';
import bundled from '../../../src/data/cards.json';
import { validateCards } from '../../../src/engine/card-data';

const REMOTE_URL = 'https://raw.githubusercontent.com/tarun-sdb/card-sage/main/src/data/cards.json';
const CACHE_KEY = 'card-sage:cards';
const TIMEOUT_MS = 6000;

export async function loadCards(onRemote) {
  const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
  if (cached) {
    try {
      const cards = validateCards(JSON.parse(cached));
      if (cards) {
        refreshRemote(onRemote); // background: update cache + notify
        return cards;
      }
    } catch {
      // corrupt cache → fall through to bundle, refresh in background
    }
  }
  refreshRemote(onRemote);
  return bundled.cards;
}

function refreshRemote(onRemote) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  fetch(REMOTE_URL, { signal: ctl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((cards) => validateCards(cards))
    .then((cards) => {
      if (!cards) return;
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cards)).catch(() => {});
      if (onRemote) onRemote(cards);
    })
    .catch(() => {
      // offline / timeout: keep what we served
    })
    .finally(() => clearTimeout(t));
}
