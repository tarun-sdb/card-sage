import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import SmsReader from './sms-reader';
import { parseSms } from '../../../src/engine/sms';

// Nightly auto-scan: background fetch reads recent bank SMS once a day,
// appends new card transactions to AsyncStorage. App loads them on mount,
// no button press needed. Falls back silently when backgrounding is
// unavailable (dev builds / permission denied) — manual read still works.

const TASK = 'card-sage-nightly-scan';
const TXNS_KEY = 'card-sage:txns';
const MARK_KEY = 'card-sage:sms-marker';

export async function loadTxns() {
  try {
    const raw = await AsyncStorage.getItem(TXNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function registerNightlyScan() {
  if (Platform.OS !== 'android') return;
  if (!TaskManager.isTaskDefined(TASK)) {
    TaskManager.defineTask(TASK, scanTask);
  }
  try {
    await BackgroundFetch.registerTaskAsync(TASK, {
      minimumInterval: 60 * 60, // min 1h between runs; scanTask skips unless stale
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (e) {
    // Dev client / unsupported: keep manual read as fallback.
  }
}

async function scanTask() {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const messages = await SmsReader.readSms(200);
    const marker = parseInt((await AsyncStorage.getItem(MARK_KEY)) || '0', 10);
    const fresh = messages
      .filter((m) => new Date(m.date).getTime() > marker)
      .map((m) => ({ ...parseSms(m.sender, m.body), date: m.date }))
      .filter((t) => t.amount != null);

    if (fresh.length) {
      const existing = await loadTxns();
      await AsyncStorage.setItem(TXNS_KEY, JSON.stringify([...fresh, ...existing]));
      const latest = Math.max(...messages.map((m) => new Date(m.date).getTime()));
      await AsyncStorage.setItem(MARK_KEY, String(latest));
    }
    return fresh.length
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}
