import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import firebaseAdmin, { ServiceAccount } from 'firebase-admin';

/**
 * Creates a new connection to the database and returns the instance (if successful).
 */
export function initDb(serviceAccount: ServiceAccount): firebaseAdmin.firestore.Firestore {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount)
  });

  return getDb();
}

/**
 * Returns the firestore instance (singleton).
 */
export function getDb(): firebaseAdmin.firestore.Firestore {
  const db = firebaseAdmin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export async function getUsername(address: string): Promise<string> {
  try {
    const db = getDb();
    const user = await db.collection(firestoreConstants.USERS_COLL).doc(address).get();
    return user?.data?.()?.username ?? '';
  } catch (err) {
    console.error(`Failed to get user doc for ${address}`);
    return '';
  }
}
