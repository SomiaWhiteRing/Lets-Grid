// IndexedDB database implementation

interface FormData {
  id: string
  imageData: string
  canvasData: string | null
  timestamp: number
  size: number
  blankAreas?: Array<{ x: number; y: number; width: number; height: number }>
}

const DB_NAME = "FormsApp"
const STORE_NAME = "forms"
const DB_VERSION = 1

let db: IDBDatabase | null = null

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve()
      return
    }

    if (!window.indexedDB) {
      reject(new Error("Your browser does not support IndexedDB"))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      reject(new Error("Failed to open database"))
    }

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result
      resolve()
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
  })
}

// Add a function to check if DB is initialized
export const isDBInitialized = (): boolean => {
  return db !== null
}

// Add a function to ensure DB is initialized before any operation
export const ensureDBInitialized = async (): Promise<void> => {
  if (!isDBInitialized()) {
    await initDB()
  }
}

export const saveForm = (formData: FormData): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"))
      return
    }

    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(formData)

    request.onerror = () => {
      reject(new Error("Failed to save form"))
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

export const updateForm = (formData: FormData): Promise<void> => {
  return saveForm(formData)
}

export const getFormById = (id: string): Promise<FormData | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"))
      return
    }

    const transaction = db.transaction([STORE_NAME], "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onerror = () => {
      reject(new Error("Failed to get form"))
    }

    request.onsuccess = () => {
      resolve(request.result || null)
    }
  })
}

export const getAllForms = (): Promise<FormData[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"))
      return
    }

    const transaction = db.transaction([STORE_NAME], "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => {
      reject(new Error("Failed to get forms"))
    }

    request.onsuccess = () => {
      // Sort by timestamp, newest first
      const forms = request.result as FormData[]
      forms.sort((a, b) => b.timestamp - a.timestamp)
      resolve(forms)
    }
  })
}

export const deleteForm = (id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"))
      return
    }

    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => {
      reject(new Error("Failed to delete form"))
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

