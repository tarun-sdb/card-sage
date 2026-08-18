// Card data loader: remote JSON first, then AsyncStorage cache, then the
// bundled copy. The remote source is GitHub raw for now (no server exists
// for card reward rates); swap REMOTE_URL when a real endpoint shows up.
import AsyncStorage from '@react-native-async-storage/async-storage';
import bundled from '../../../src/data/cards.json';
import { validateCards } from '../../../src/engine/card-data';

const REMOTE_URL = 'https://raw.githubusercontent.com/tarun-sdb/card-sage/main/src/data/cards.json';
const CACHE_KEY = 'card-sage:cards';
const TIMEOUT_MS = 6000;

export async function loadCards() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(REMOTE_URL, { signal: ctl.signal });
    if (r.ok) {
      const cards = validateCards(await r.json());
      if (cards) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cards)).catch(() => {});
        return cards;
      }
    }
  } catch {
    // fall through to cache, then bundle
  } finally {
    clearTimeout(t);
  }
  const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
  if (cached) {
    const cards = validateCards(JSON.parse(cached));
    if (cards) return cards;
  }
  return bundled.cards;
}