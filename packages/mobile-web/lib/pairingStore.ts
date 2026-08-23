import type { PairingAccount } from "./pairing";

export type StoredPairing = {
  account: PairingAccount;
  encryptionKey: CryptoKey;
};

const databaseName = "nimbalyst-command-center";
const storeName = "secure-pairing";
const activeKey = "active";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open secure browser storage."));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Secure browser storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Secure browser storage was interrupted."));
    });
  } finally {
    database.close();
  }
}

export async function getStoredPairing(): Promise<StoredPairing | undefined> {
  return transact<StoredPairing | undefined>("readonly", (store) => store.get(activeKey));
}

export async function saveStoredPairing(pairing: StoredPairing): Promise<void> {
  await transact<IDBValidKey>("readwrite", (store) => store.put(pairing, activeKey));
}

export async function clearStoredPairing(): Promise<void> {
  await transact<undefined>("readwrite", (store) => store.delete(activeKey));
}
