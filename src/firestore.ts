import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import fbAdmin from 'firebase-admin';

import { default as pixelScoreServiceAccount } from './creds/pixelscore-firebase.json';
import { default as infinityServiceAccount } from './creds/nftc-infinity-firebase.json';

export const fsAdminPixelScore = fbAdmin.initializeApp(
  {
    credential: fbAdmin.credential.cert(pixelScoreServiceAccount as fbAdmin.ServiceAccount)
  },
  'pixelscore'
);

export const fsAdminInfinity = fbAdmin.initializeApp(
  {
    credential: fbAdmin.credential.cert(infinityServiceAccount as fbAdmin.ServiceAccount)
  },
  'infinity'
);

export const pixelScoreDb = fsAdminPixelScore.firestore();
pixelScoreDb.settings({ ignoreUndefinedProperties: true });

export const infinityDb = fsAdminInfinity.firestore();
infinityDb.settings({ ignoreUndefinedProperties: true });

export async function getUsername(address: string): Promise<string> {
  try {
    const user = await infinityDb.collection(firestoreConstants.USERS_COLL).doc(address).get();
    return user?.data?.()?.username ?? '';
  } catch (err) {
    console.error(`Failed to get user doc for ${address}`);
    return '';
  }
}
