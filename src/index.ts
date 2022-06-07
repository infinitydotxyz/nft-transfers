import { ServiceAccount } from 'firebase-admin';
import { initDb } from 'firestore';
import { server } from 'server';
import * as serviceAccount from './creds/nftc-dev-firebase.json';
import * as Emittery from 'emittery';
import { transferHandler, updateOrdersHandler, updateOwnershipHandler } from 'transfer-handlers';
import { TransferEvent, TransferEmitter, Transfer } from 'types/transfer';
import { filterByContractAddress } from 'filter-by-contract-address';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';

function main(): void {
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

  // TODO add infinity addresses
  const INFINITY_CONTRACT_ADDRESS = '';
  const addressesToExclude = [INFINITY_CONTRACT_ADDRESS].map((address) => trimLowerCase(address));

  const filters = [filterByContractAddress({ blockList: new Set(addressesToExclude) })];
  transferHandler(transferEmitter, [log, updateOrdersHandler, updateOwnershipHandler], filters);

  listenForTransfers(transferEmitter);
}

main();
