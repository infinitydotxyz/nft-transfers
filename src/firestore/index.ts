import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import fbAdmin from 'firebase-admin';
import { config } from '../config';

export const fsAdminPixelScore = (config.firestore.pixelScoreServiceAccount as any)?.project_id
  ? fbAdmin.initializeApp(
      {
        credential: fbAdmin.credential.cert(config.firestore.pixelScoreServiceAccount as fbAdmin.ServiceAccount)
      },
      'pixelscore'
    )
  : undefined;

export const fsAdminInfinity = fbAdmin.initializeApp(
  {
    credential: fbAdmin.credential.cert(config.firestore.infinityServiceAccount as fbAdmin.ServiceAccount)
  },
  'infinity'
);

export const pixelScoreDb = fsAdminPixelScore ? fsAdminPixelScore.firestore() : undefined;
pixelScoreDb?.settings?.({ ignoreUndefinedProperties: true });

if (!pixelScoreDb) {
  console.log(`\nPixelScore Firestore not initialized\n`);
}

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
