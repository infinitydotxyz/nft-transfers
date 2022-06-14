import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import firebaseAdmin, { ServiceAccount } from 'firebase-admin';

/**
 * Creates a new connection to the database and returns the instance (if successful).
 */
export function initDb(serviceAccount: ServiceAccount): firebaseAdmin.firestore.Firestore {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount)
  });
  firebaseAdmin.firestore().settings({ ignoreUndefinedProperties: true });

  return getDb();
}

/**
 * Returns the firestore instance (singleton).
 */
export function getDb(): firebaseAdmin.firestore.Firestore {
  return firebaseAdmin.firestore();
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
