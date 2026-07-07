import { Firestore } from '@google-cloud/firestore';

export interface QuizData {
  question: string;
  options: string[];
  correctOption: string;
  explanation: string;
}

export interface IdiomCache {
  idiom: string;
  quiz?: QuizData;
  imageUrl?: string;
  createdAt: string;
}

// In-memory cache fallback for offline/local development
const localMemoryCache = new Map<string, IdiomCache>();

let db: Firestore | null = null;

try {
  // Only attempt initialization if environment hints at GCP availability,
  // or let Firestore constructor try and fail gracefully.
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  });
} catch (error) {
  console.warn('[Firestore] Client initialization failed. Using in-memory fallback cache for development.');
}

const COLLECTION_NAME = 'idiom_cache';

/**
 * Normalizes an idiom string to be used as a document ID (e.g. "Spill the beans" -> "spill-the-beans")
 */
export function normalizeIdiom(idiom: string): string {
  return idiom
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Fetches cached idiom data
 */
export async function getCachedIdiom(idiom: string): Promise<IdiomCache | null> {
  const docId = normalizeIdiom(idiom);
  
  // Use Firestore if client is initialized
  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(docId);
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data() as IdiomCache;
      }
      return null;
    } catch (error) {
      console.warn('[Firestore] Error reading database, using in-memory fallback:', error);
    }
  }

  // Fallback to in-memory
  return localMemoryCache.get(docId) || null;
}

/**
 * Saves or updates cached idiom data
 */
export async function setCachedIdiom(idiom: string, data: Partial<IdiomCache>): Promise<void> {
  const docId = normalizeIdiom(idiom);
  const cacheEntry: IdiomCache = {
    ...localMemoryCache.get(docId),
    ...data,
    idiom: idiom.trim(),
    createdAt: data.createdAt || new Date().toISOString(),
  };

  // Update memory cache
  localMemoryCache.set(docId, cacheEntry);

  // Attempt Firestore write
  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(docId);
      await docRef.set(cacheEntry, { merge: true });
    } catch (error) {
      console.warn('[Firestore] Error writing to database:', error);
    }
  }
}
