import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {firebaseConfig} from '../dist/assets/firebase-config.js';
import {DEFAULT_GIFT_GUIDANCE, normalizeGiftGuidance} from '../dist/assets/site-content.js';

const root = resolve(import.meta.dirname, '..');
const databaseBase = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const apiKey = encodeURIComponent(firebaseConfig.apiKey);

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw new Error(`Неподдерживаемый тип Firestore: ${Object.keys(value).join(', ')}`);
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function fetchJson(url, {allowMissing = false} = {}) {
  const response = await fetch(url);
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore REST вернул ${response.status}: ${await response.text()}`);
  return response.json();
}

async function fetchGifts() {
  const gifts = [];
  let pageToken = '';
  do {
    const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const body = await fetchJson(`${databaseBase}/gifts?pageSize=100&key=${apiKey}${token}`);
    for (const document of body.documents || []) {
      gifts.push({
        id: decodeURIComponent(document.name.split('/').at(-1)),
        ...decodeFields(document.fields),
        firestoreUpdateTime: document.updateTime
      });
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return gifts.sort((left, right) => {
    const created = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    return created || left.id.localeCompare(right.id, 'ru');
  });
}

async function fetchGuidance() {
  const document = await fetchJson(`${databaseBase}/siteContent/giftGuidance?key=${apiKey}`, {allowMissing: true});
  if (!document) return {...DEFAULT_GIFT_GUIDANCE, updatedAt: null, firestoreUpdateTime: null};
  return {...normalizeGiftGuidance(decodeFields(document.fields)), updatedAt: decodeValue(document.fields.updatedAt), firestoreUpdateTime: document.updateTime};
}

const [gifts, giftGuidance] = await Promise.all([fetchGifts(), fetchGuidance()]);
if (!gifts.length) throw new Error('Firestore вернул пустой список. Снимок не создан, чтобы не зафиксировать потерю данных.');

const snapshot = {
  schemaVersion: 1,
  projectId: firebaseConfig.projectId,
  capturedAt: new Date().toISOString(),
  giftGuidance,
  gifts
};

await mkdir(resolve(root, 'data'), {recursive: true});
await writeFile(resolve(root, 'data/firestore-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Saved Firestore snapshot: ${gifts.length} gifts.`);
