import { ServiceAccount } from 'firebase-admin';
import { initDb } from 'firestore';
import { server } from 'server';
import { TransferEmitter, TransferEvent } from 'types';
import * as serviceAccount from './creds/nftc-dev-firebase.json';
import Emittery from 'emittery';
import { transferHandler, updateOrdersHandler } from 'transfer-handlers';

function main() {
  const db = initDb(serviceAccount as ServiceAccount);

  const transferEmitter = new Emittery<TransferEvent>();

  const listenForTransfers: (emitter: TransferEmitter) => void = server;

  transferHandler(
    transferEmitter,
    [{ fn: console.log, name: 'logger', throwErrorOnFailure: false }, updateOrdersHandler],
    db
  );

  listenForTransfers(transferEmitter);
}

main();
