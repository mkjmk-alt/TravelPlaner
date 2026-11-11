import { canonicalSyncJson } from './legacyUserStateImporter.js';

const DATABASE_NAME = 'tripplot-sync-queue';
const DATABASE_VERSION = 1;
const STORE_NAME = 'operations';

export class IndexedDBQueueStore {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = DATABASE_NAME } = {}) {
    if (!indexedDB) throw new Error('This browser does not provide IndexedDB for offline sync.');
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.databasePromise = null;
  }

  open() {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.databaseName, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'queueKey' });
            store.createIndex('userID', 'userID', { unique: false });
            store.createIndex('operationID', 'operationID', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open the sync queue.'));
        request.onblocked = () => reject(new Error('The sync queue database is blocked by another tab.'));
      });
    }
    return this.databasePromise;
  }

  async put(operation) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const queueKey = `${operation.userID}:${operation.operationID}`;
      let failure = null;
      const lookup = store.get(queueKey);
      lookup.onsuccess = () => {
        const existing = lookup.result;
        if (existing && canonicalSyncJson(existing.operation) !== canonicalSyncJson(operation)) {
          failure = new Error('A queued operation ID cannot be reused with a different body.');
          transaction.abort();
          return;
        }
        store.put({ queueKey, userID: operation.userID, operationID: operation.operationID, operation });
      };
      lookup.onerror = () => reject(lookup.error || new Error('Could not read the queued operation.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not save the queued operation.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('The sync queue write was aborted.'));
    });
  }

  async list(userID) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).index('userID').getAll(userID);
      let rows = [];
      request.onsuccess = () => { rows = request.result || []; };
      request.onerror = () => reject(request.error || new Error('Could not read pending sync operations.'));
      transaction.oncomplete = () => resolve(rows.map(row => row.operation));
      transaction.onerror = () => reject(transaction.error || new Error('Could not read the sync queue.'));
    });
  }

  async remove(operationID, userID = null) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.index('operationID').getAll(operationID);
      request.onsuccess = () => (request.result || [])
        .filter(row => !userID || row.userID === userID)
        .forEach(row => store.delete(row.queueKey));
      request.onerror = () => reject(request.error || new Error('Could not find the completed sync operation.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove the completed sync operation.'));
    });
  }
}
