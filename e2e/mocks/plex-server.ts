import { buildCleanupWorld, CLEANUP_PLEX, type CleanupAnswers, type WorldCollection, type WorldHub } from '../helpers/cleanup-fixtures';
import { empty, json, notFound, startMockServer, text, type MockCall, type MockAnswer, type MockServer } from './request-log';

/**
 * A stand-in for the Plex server of media cleanup (TS 16.4). A spec points
 * the active Plex row at it with `useCleanupPlex()`
 * (`e2e/helpers/seed-cleanup.ts`). Only the token `e2e-cleanup-plex-token`
 * gets data; any other token gets 401, as Plex answers.
 *
 * Routes, in the shapes of the `w1-conn-read` fixtures, with the data of
 * `buildCleanupWorld(now)`:
 *
 * - `GET /identity` (XML): the machine identifier `e2e-cleanup-machine`.
 * - `GET /library/sections`, and `GET /library/sections/{id}/all?type=1|2|3|4|18`
 *   with container paging (`X-Plex-Container-Start` and `-Size`, as headers
 *   or query), `sort=addedAt:desc`, `addedAt>>` and the `Label` tags.
 * - `GET /library/metadata/{rk}` and `/children`: the items with their files,
 *   and the collections with `type: "collection"`.
 * - `GET /status/sessions`: no session, unless a spec sets them with
 *   `POST /__sessions` and the body `{ "sessions": [{ "ratingKey": "1001" }] }`.
 * - The collection routes of TS 8.10 and the hub routes, on collection and
 *   hub state kept in memory: get, list items, add (`uri`), remove, move,
 *   create, summary, sort, delete.
 * - `GET|POST /library/sections/{id}/refresh?path=` (the folder scan).
 * - `GET /photo/:/transcode`: a tiny PNG, so the poster route can prove a
 *   member's access.
 *
 * Every other route answers 404. Nothing here deletes a library item.
 */

/** A 1 x 1 PNG: the poster of every item. */
const POSTER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

interface PlexState {
  answers: CleanupAnswers['plex'];
  collections: Map<string, WorldCollection>;
  hubs: Map<string, WorldHub>;
  sessions: Record<string, unknown>[];
  nextKey: number;
}

function newState(now: number): PlexState {
  const answers = buildCleanupWorld(now).answers.plex;
  return {
    answers,
    collections: new Map(answers.collections.map((collection) => [collection.ratingKey, structuredClone(collection)])),
    hubs: new Map(answers.hubs.map((hub) => [hub.identifier, { ...hub }])),
    sessions: [],
    nextKey: 90101,
  };
}

const container = (fields: Record<string, unknown>) => json({ MediaContainer: fields });

function tokenOf(call: MockCall): string | null {
  const header = call.headers['x-plex-token'];
  return (Array.isArray(header) ? header[0] : header) ?? call.url.searchParams.get('X-Plex-Token');
}

/** Container paging: the start and size from the headers, else from the query (Plex reads both). */
function page<T>(call: MockCall, rows: readonly T[]) {
  const read = (name: string) => {
    const header = call.headers[name.toLowerCase()];
    const value = (Array.isArray(header) ? header[0] : header) ?? call.url.searchParams.get(name);
    return value === null || value === undefined || value === '' ? null : Number(value);
  };
  const start = read('X-Plex-Container-Start') ?? 0;
  const size = read('X-Plex-Container-Size') ?? rows.length;
  return { size: Math.max(0, Math.min(size, rows.length - start)), totalSize: rows.length, offset: start, rows: rows.slice(start, start + size) };
}

function collectionMeta(collection: WorldCollection): Record<string, unknown> {
  return {
    ratingKey: collection.ratingKey, key: `/library/collections/${collection.ratingKey}/children`, guid: `collection://e2e-cleanup-${collection.ratingKey}`,
    type: 'collection', title: collection.title, subtype: collection.subtype, summary: collection.summary, index: Number(collection.ratingKey),
    librarySectionID: Number(collection.sectionId), librarySectionTitle: collection.subtype === 'movie' ? 'Movies' : 'TV Shows',
    ratingCount: collection.items.length, childCount: String(collection.items.length), smart: false, collectionSort: '2',
    thumb: `/library/collections/${collection.ratingKey}/composite/${collection.addedAt}`, addedAt: collection.addedAt, updatedAt: collection.addedAt,
  };
}

function sectionRows(state: PlexState, sectionId: string, call: MockCall): MockAnswer {
  const section = state.answers.sections.find((candidate) => candidate.key === sectionId);
  if (!section) return notFound();
  const type = Number(call.url.searchParams.get('type') ?? (section.type === 'movie' ? 1 : 2));
  let rows = type === 18
    ? [...state.collections.values()].filter((collection) => collection.sectionId === sectionId).map(collectionMeta)
    : [...(state.answers.rows[sectionId]?.[type] ?? [])];
  const since = call.url.searchParams.get('addedAt>>');
  if (since !== null) rows = rows.filter((row) => Number(row.addedAt) >= Number(since));
  if (call.url.searchParams.get('sort') === 'addedAt:desc') rows.sort((a, b) => Number(b.addedAt) - Number(a.addedAt));
  const { rows: slice, ...paging } = page(call, rows);
  return container({ ...paging, allowSync: true, librarySectionID: Number(sectionId), librarySectionTitle: section.title, Metadata: slice });
}

function metadata(state: PlexState, ratingKey: string): MockAnswer {
  const collection = state.collections.get(ratingKey);
  if (collection) return container({ size: 1, librarySectionID: Number(collection.sectionId), Metadata: [collectionMeta(collection)] });
  const found = state.answers.metadata[ratingKey];
  if (!found) return notFound();
  return container({ size: 1, identifier: 'com.plexapp.plugins.library', librarySectionID: Number(found.sectionId), Metadata: [found.entry] });
}

/** The rating keys of an `uri` of TS 8.10 step 4.6: `server://{id}/com.plexapp.plugins.library/library/metadata/{rk1,rk2}`. */
function uriKeys(uri: string | null): string[] | null {
  const match = uri?.match(/^server:\/\/([^/]+)\/com\.plexapp\.plugins\.library\/library\/metadata\/([\d,]+)$/);
  if (!match || match[1] !== CLEANUP_PLEX.machineIdentifier) return null;
  return match[2].split(',').filter(Boolean);
}

function collectionRoutes(state: PlexState, call: MockCall, parts: string[]): MockAnswer | null {
  // parts: ['library', 'collections', rk?, 'items'?, itemRk?, 'move'?]
  const { method, url } = call;
  if (parts.length === 2 && method === 'POST') {
    const sectionId = url.searchParams.get('sectionId') ?? '';
    const type = url.searchParams.get('type');
    const title = url.searchParams.get('title');
    if (!state.answers.sections.some((section) => section.key === sectionId) || !title || !['1', '2', '3'].includes(type ?? '')) return json({ message: 'Bad request' }, 400);
    const ratingKey = String(state.nextKey++);
    const collection: WorldCollection = { ratingKey, sectionId, title, subtype: type === '1' ? 'movie' : 'show', summary: '', addedAt: Math.floor(Date.now() / 1000), items: [] };
    state.collections.set(ratingKey, collection);
    return container({ size: 1, Metadata: [collectionMeta(collection)] });
  }
  const collection = state.collections.get(parts[2] ?? '');
  if (!collection) return notFound();
  if (parts.length === 3 && method === 'GET') return metadata(state, collection.ratingKey);
  if (parts.length === 3 && method === 'DELETE') {
    state.collections.delete(collection.ratingKey);
    for (const [identifier, hub] of state.hubs) if (hub.ratingKey === collection.ratingKey) state.hubs.delete(identifier);
    return empty();
  }
  if (parts[3] !== 'items') return null;
  if (parts.length === 4 && method === 'GET') {
    const rows = collection.items.map((key) => state.answers.metadata[key]?.entry).filter((entry): entry is Record<string, unknown> => !!entry);
    const { rows: slice, ...paging } = page(call, rows);
    return container({ ...paging, librarySectionID: Number(collection.sectionId), title2: collection.title, Metadata: slice });
  }
  if (parts.length === 4 && method === 'PUT') {
    const keys = uriKeys(url.searchParams.get('uri'));
    if (!keys) return json({ message: 'Bad uri' }, 400);
    for (const key of keys) if (!collection.items.includes(key)) collection.items.push(key);
    return empty();
  }
  const item = parts[4] ?? '';
  if (parts.length === 5 && (method === 'DELETE' || method === 'PUT')) {
    collection.items = collection.items.filter((key) => key !== item);
    return empty();
  }
  if (parts.length === 6 && parts[5] === 'move' && method === 'PUT') {
    if (!collection.items.includes(item)) return notFound();
    const after = url.searchParams.get('after');
    const rest = collection.items.filter((key) => key !== item);
    const at = after === null ? 0 : rest.indexOf(after) + 1;
    if (after !== null && at === 0) return notFound();
    collection.items = [...rest.slice(0, at), item, ...rest.slice(at)];
    return empty();
  }
  return null;
}

const flag = (value: string | null) => value === '1' || value === 'true';

function hubRoutes(state: PlexState, call: MockCall, sectionId: string, identifier: string | undefined): MockAnswer | null {
  const { method, url } = call;
  if (!state.answers.sections.some((section) => section.key === sectionId)) return notFound();
  const flags = () => ({
    promotedToRecommended: flag(url.searchParams.get('promotedToRecommended')),
    promotedToOwnHome: flag(url.searchParams.get('promotedToOwnHome')),
    promotedToSharedHome: flag(url.searchParams.get('promotedToSharedHome')),
  });
  if (identifier === undefined && method === 'GET') {
    const item = url.searchParams.get('metadataItemId');
    const hubs = [...state.hubs.values()].filter((hub) => hub.sectionId === sectionId && (item === null || hub.ratingKey === item));
    return container({ size: hubs.length, Hub: hubs.map(({ sectionId: _section, ratingKey: _key, ...hub }) => ({ ...hub, recommendationsVisibility: 'all',
      homeVisibility: hub.promotedToSharedHome ? 'all' : hub.promotedToOwnHome ? 'admin' : 'none', deletable: true })) });
  }
  if (identifier === undefined && method === 'POST') {
    const ratingKey = url.searchParams.get('metadataItemId') ?? '';
    const collection = state.collections.get(ratingKey);
    if (!collection) return notFound();
    const hub: WorldHub = { identifier: `custom.collection.${sectionId}.${ratingKey}`, sectionId, ratingKey, title: collection.title, ...flags() };
    state.hubs.set(hub.identifier, hub);
    return empty();
  }
  if (identifier !== undefined && method === 'PUT') {
    const hub = state.hubs.get(identifier);
    if (!hub) return notFound();
    state.hubs.set(identifier, { ...hub, ...flags() });
    return empty();
  }
  return null;
}

function route(state: PlexState, call: MockCall): MockAnswer {
  if (tokenOf(call) !== CLEANUP_PLEX.token) return text('<html><head><title>Unauthorized</title></head><body><h1>401 Unauthorized</h1></body></html>', 401, 'text/html');
  const { method, url } = call;
  const parts = url.pathname.split('/').filter(Boolean);
  if (method === 'GET' && url.pathname === '/identity') {
    return text(`<?xml version="1.0" encoding="UTF-8"?>\n<MediaContainer size="0" claimed="1" machineIdentifier="${CLEANUP_PLEX.machineIdentifier}" version="1.41.0.0"/>\n`,
      200, 'application/xml');
  }
  if (method === 'GET' && url.pathname === '/library/sections') return container({ size: state.answers.sections.length, title1: 'Plex Library', Directory: state.answers.sections });
  if (method === 'GET' && (url.pathname === '/library/recentlyAdded' || url.pathname === '/library/onDeck')) return container({ size: 0, Metadata: [] });
  if (method === 'GET' && url.pathname === '/status/sessions') return container({ size: state.sessions.length, Metadata: state.sessions });
  if (method === 'GET' && url.pathname === '/photo/:/transcode') return { status: 200, bytes: POSTER, contentType: 'image/png' };
  if (parts[0] === 'library' && parts[1] === 'sections' && parts.length === 4) {
    if (parts[3] === 'all' && method === 'GET') return sectionRows(state, parts[2], call);
    if (parts[3] === 'all' && method === 'PUT' && url.searchParams.get('type') === '18') {
      const collection = state.collections.get(url.searchParams.get('id') ?? '');
      if (!collection || collection.sectionId !== parts[2]) return notFound();
      collection.summary = url.searchParams.get('summary.value') ?? collection.summary;
      return empty();
    }
    if (parts[3] === 'refresh' && (method === 'GET' || method === 'POST')) return empty();
  }
  if (parts[0] === 'library' && parts[1] === 'metadata' && parts.length >= 3) {
    if (parts.length === 3 && method === 'GET') return metadata(state, parts[2]);
    if (parts.length === 4 && parts[3] === 'children' && method === 'GET') {
      const rows = state.answers.children[parts[2]];
      return rows ? container({ size: rows.length, key: parts[2], Metadata: rows }) : notFound();
    }
    if (parts.length === 4 && parts[3] === 'prefs' && method === 'PUT') return state.collections.has(parts[2]) ? empty() : notFound();
  }
  if (parts[0] === 'library' && parts[1] === 'collections') return collectionRoutes(state, call, parts) ?? notFound();
  if (parts[0] === 'hubs' && parts[1] === 'sections' && parts[3] === 'manage') return hubRoutes(state, call, parts[2], parts[4]) ?? notFound();
  return notFound();
}

/** Starts the Plex mock on a free port of 127.0.0.1, with the world at the current time. */
export async function startMockPlex(): Promise<MockServer> {
  let state = newState(Date.now());
  return startMockServer({
    mock: 'plex',
    handle: (call) => route(state, call),
    reset: (now) => {
      state = newState(now);
    },
    control: (call) => {
      if (call.url.pathname !== '/__sessions' || call.method !== 'POST') return undefined;
      const body = call.body as { sessions?: unknown } | null;
      if (!body || !Array.isArray(body.sessions)) return json({ message: 'POST /__sessions needs { sessions: [...] }' }, 400);
      state.sessions = body.sessions.filter((session): session is Record<string, unknown> => session !== null && typeof session === 'object');
      return json({ sessions: state.sessions.length });
    },
  });
}
