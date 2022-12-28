// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Multer } from 'multer';
import { infinityDb } from 'firestore';
import { config } from 'config';
import { Sync } from 'v2/sync';

export async function main() {
  const sync = new Sync(config.eth.chainId, infinityDb);

  await sync.sync();
}

void main();
