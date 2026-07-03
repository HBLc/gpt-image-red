import type { ProjectMode, SavedProject, SavedSingleImage } from './types'

const LEGACY_STORAGE_KEY = 'red-image-studio.history'
const LEGACY_SINGLE_STORAGE_KEY = 'red-image-studio.single-history'
const HISTORY_LIMIT_KEY = 'red-image-studio.history-limit'
const DB_NAME = 'red-image-studio'
const DB_VERSION = 2
const PROJECT_STORE_NAME = 'history'
const SINGLE_STORE_NAME = 'single-history'
const DEFAULT_HISTORY_LIMIT = 3
const MIN_HISTORY_LIMIT = 1
const MAX_HISTORY_LIMIT = 30

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SINGLE_STORE_NAME)) {
        db.createObjectStore(SINGLE_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function clampHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.trunc(value)))
}

export function getHistoryLimit(): number {
  try {
    return clampHistoryLimit(Number(localStorage.getItem(HISTORY_LIMIT_KEY) || DEFAULT_HISTORY_LIMIT))
  } catch {
    return DEFAULT_HISTORY_LIMIT
  }
}

function saveHistoryLimitValue(value: number): number {
  const next = clampHistoryLimit(value)
  try {
    localStorage.setItem(HISTORY_LIMIT_KEY, String(next))
  } catch {
    // Ignore: the in-memory UI state still uses the normalized value.
  }
  return next
}

function parseLegacyHistory(): SavedProject[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseLegacySingleHistory(): SavedSingleImage[] {
  try {
    const raw = localStorage.getItem(LEGACY_SINGLE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function sortByCreatedAt<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function projectMode(project: SavedProject): ProjectMode {
  return project.config.mode ?? 'xhs'
}

function capProjectHistory(projects: SavedProject[], limit = getHistoryLimit()): SavedProject[] {
  const buckets: Record<ProjectMode, SavedProject[]> = {
    xhs: [],
    taobao: [],
  }

  for (const project of sortByCreatedAt(projects)) {
    buckets[projectMode(project)].push(project)
  }

  return sortByCreatedAt([
    ...buckets.xhs.slice(0, limit),
    ...buckets.taobao.slice(0, limit),
  ])
}

function capSingleHistory(items: SavedSingleImage[], limit = getHistoryLimit()): SavedSingleImage[] {
  return sortByCreatedAt(items).slice(0, limit)
}

async function readAllProjectsFromDb(db: IDBDatabase): Promise<SavedProject[]> {
  const transaction = db.transaction(PROJECT_STORE_NAME, 'readonly')
  const store = transaction.objectStore(PROJECT_STORE_NAME)
  const items = await requestToPromise(store.getAll() as IDBRequest<SavedProject[]>)
  return sortByCreatedAt(items)
}

async function readAllSinglesFromDb(db: IDBDatabase): Promise<SavedSingleImage[]> {
  const transaction = db.transaction(SINGLE_STORE_NAME, 'readonly')
  const store = transaction.objectStore(SINGLE_STORE_NAME)
  const items = await requestToPromise(store.getAll() as IDBRequest<SavedSingleImage[]>)
  return sortByCreatedAt(items)
}

async function writeProjectsToDb(db: IDBDatabase, projects: SavedProject[]): Promise<SavedProject[]> {
  const capped = capProjectHistory(projects)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PROJECT_STORE_NAME)
    store.clear()
    for (const project of capped) store.put(project)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })

  return capped
}

async function writeSinglesToDb(db: IDBDatabase, items: SavedSingleImage[]): Promise<SavedSingleImage[]> {
  const capped = capSingleHistory(items)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SINGLE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SINGLE_STORE_NAME)
    store.clear()
    for (const item of capped) store.put(item)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })

  return capped
}

function filterProjects(projects: SavedProject[], mode?: ProjectMode): SavedProject[] {
  const capped = capProjectHistory(projects)
  return mode ? capped.filter((item) => projectMode(item) === mode) : capped
}

export async function loadHistory(mode?: ProjectMode): Promise<SavedProject[]> {
  try {
    const db = await openDatabase()
    const current = await readAllProjectsFromDb(db)
    if (current.length) {
      const capped = await writeProjectsToDb(db, current)
      return filterProjects(capped, mode)
    }

    const legacy = parseLegacyHistory()
    if (!legacy.length) return []

    const migrated = await writeProjectsToDb(db, legacy)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return filterProjects(migrated, mode)
  } catch {
    return filterProjects(parseLegacyHistory(), mode)
  }
}

export async function saveHistory(projects: SavedProject[], mode?: ProjectMode): Promise<SavedProject[]> {
  try {
    const db = await openDatabase()
    const current = mode ? await readAllProjectsFromDb(db) : []
    const merged = mode
      ? [...projects, ...current.filter((item) => projectMode(item) !== mode)]
      : projects
    const saved = await writeProjectsToDb(db, merged)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return filterProjects(saved, mode)
  } catch {
    const legacy = parseLegacyHistory()
    const capped = mode
      ? capProjectHistory([...projects, ...legacy.filter((item) => projectMode(item) !== mode)]).filter((item) => projectMode(item) === mode)
      : capProjectHistory(projects)
    const toStore = mode
      ? capProjectHistory([...capped, ...legacy.filter((item) => projectMode(item) !== mode)])
      : capped
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(toStore))
      return capped
    } catch {
      const withoutImages = capped.map((project) => ({ ...project, images: {} }))
      try {
        const storedWithoutImages = mode
          ? capProjectHistory([...withoutImages, ...legacy.filter((item) => projectMode(item) !== mode)])
          : withoutImages
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(storedWithoutImages))
      } catch {
        // Ignore: history is best-effort when browser storage is unavailable.
      }
      return withoutImages
    }
  }
}

export async function rememberProject(project: SavedProject): Promise<SavedProject[]> {
  const mode = projectMode(project)
  const current = (await loadHistory(mode)).filter((item) => item.id !== project.id)
  return saveHistory([project, ...current], mode)
}

export async function clearHistory(mode?: ProjectMode): Promise<void> {
  try {
    const db = await openDatabase()
    if (mode) {
      const kept = (await readAllProjectsFromDb(db)).filter((item) => projectMode(item) !== mode)
      await writeProjectsToDb(db, kept)
      return
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECT_STORE_NAME, 'readwrite')
      transaction.objectStore(PROJECT_STORE_NAME).clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB clear failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB clear aborted'))
    })
  } catch {
    // Ignore: localStorage cleanup below still removes legacy history.
  } finally {
    if (!mode) localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
}

export async function loadSingleHistory(): Promise<SavedSingleImage[]> {
  try {
    const db = await openDatabase()
    const current = await readAllSinglesFromDb(db)
    if (current.length) return writeSinglesToDb(db, current)

    const legacy = parseLegacySingleHistory()
    if (!legacy.length) return []

    const migrated = await writeSinglesToDb(db, legacy)
    localStorage.removeItem(LEGACY_SINGLE_STORAGE_KEY)
    return migrated
  } catch {
    return capSingleHistory(parseLegacySingleHistory())
  }
}

export async function saveSingleHistory(items: SavedSingleImage[]): Promise<SavedSingleImage[]> {
  try {
    const db = await openDatabase()
    const saved = await writeSinglesToDb(db, items)
    localStorage.removeItem(LEGACY_SINGLE_STORAGE_KEY)
    return saved
  } catch {
    const capped = capSingleHistory(items)
    try {
      localStorage.setItem(LEGACY_SINGLE_STORAGE_KEY, JSON.stringify(capped))
    } catch {
      // Ignore: single-image history is best-effort.
    }
    return capped
  }
}

export async function rememberSingleImage(item: SavedSingleImage): Promise<SavedSingleImage[]> {
  const current = (await loadSingleHistory()).filter((historyItem) => historyItem.id !== item.id)
  return saveSingleHistory([item, ...current])
}

export async function clearSingleHistory(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SINGLE_STORE_NAME, 'readwrite')
      transaction.objectStore(SINGLE_STORE_NAME).clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB clear failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB clear aborted'))
    })
  } catch {
    // Ignore: localStorage cleanup below still removes legacy history.
  } finally {
    localStorage.removeItem(LEGACY_SINGLE_STORAGE_KEY)
  }
}

export async function updateHistoryLimit(value: number): Promise<number> {
  const next = saveHistoryLimitValue(value)
  try {
    const db = await openDatabase()
    await writeProjectsToDb(db, await readAllProjectsFromDb(db))
    await writeSinglesToDb(db, await readAllSinglesFromDb(db))
  } catch {
    // Ignore: future reads and writes still apply the saved limit.
  }
  return next
}
