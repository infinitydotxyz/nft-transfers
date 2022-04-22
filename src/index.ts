import { ServiceAccount } from 'firebase-admin';
import { initDb } from 'firestore';
import { server } from 'server';
import * as serviceAccount from './creds/nftc-dev-firebase.json';
import * as Emittery from 'emittery';
import { transferHandler, updateOrdersHandler } from 'transfer-handlers';
import { TransferEvent, TransferEmitter, Transfer } from 'types/transfer';

function main() {
  initDb(serviceAccount as ServiceAccount);

  const transferEmitter = new Emittery<TransferEvent>();

  const listenForTransfers: (emitter: TransferEmitter) => void = server;

  const log = {
    fn: (transfer: Transfer) => {
      console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
    },
    name: 'logger',
    throwErrorOnFailure: false
  };

  transferHandler(transferEmitter, [log, updateOrdersHandler]);

  listenForTransfers(transferEmitter);
}

main();
