/**
 * Device-local source text storage for translated STRING widgets.
 *
 * Translation drafts intentionally live outside workflow JSON so exported
 * workflows continue to contain only the value that ComfyUI will execute.
 */

const DB_NAME = 'ComfyMobileUITranslationDrafts';
const DB_VERSION = 1;
const STORE_NAME = 'translationDrafts';

export interface TranslationDraft {
  id: string;
  scope: string;
  nodeId: number;
  widgetName: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Failed to open translation draft storage.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
  });

  return databasePromise;
};

const runRequest = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result!: T;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error('Translation draft request failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error('Translation draft transaction was aborted.'));
  });
};

export const createTranslationDraftId = (
  scope: string,
  nodeId: number,
  widgetName: string
): string => JSON.stringify([scope, nodeId, widgetName]);

export const getTranslationDraft = async (id: string): Promise<TranslationDraft | null> => {
  const draft = await runRequest<TranslationDraft | undefined>('readonly', (store) => store.get(id));
  return draft || null;
};

export const saveTranslationDraft = async (draft: TranslationDraft): Promise<void> => {
  await runRequest<IDBValidKey>('readwrite', (store) => store.put(draft));
};

export const deleteTranslationDraft = async (id: string): Promise<void> => {
  await runRequest<undefined>('readwrite', (store) => store.delete(id));
};

export const getAllTranslationDrafts = async (): Promise<TranslationDraft[]> => {
  return runRequest<TranslationDraft[]>('readonly', (store) => store.getAll());
};

export const replaceTranslationDrafts = async (drafts: TranslationDraft[]): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.clear();
    drafts.forEach((draft) => store.put(draft));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Failed to restore translation drafts.'));
    transaction.onabort = () => reject(transaction.error || new Error('Translation draft restore was aborted.'));
  });
};
