import { ServiceAccount } from 'firebase-admin';
import { initDb } from 'firestore';
import { server } from 'server';
import * as serviceAccount from './creds/nftc-dev-firebase.json';
import * as Emittery from 'emittery';
import { transferHandler, updateOrdersHandler } from 'transfer-handlers';
import { TransferEvent, TransferEmitter, Transfer } from 'types/transfer';
import { filterByContractAddress } from 'filter-by-contract-address';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { HookdeckService } from 'hookdeck/hookdeck.service';
import { HookdeckConfig } from 'hookdeck/hookdeck.types';

const log = {
  fn: (transfer: Transfer) => {
    console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
  },
  name: 'logger',
  throwErrorOnFailure: false
};

function main(): void {
  initDb(serviceAccount as ServiceAccount);

  const transferEmitter = new Emittery<TransferEvent>();
  const listenForTransfers: (emitter: TransferEmitter) => void = server;

  // TODO add infinity addresses
  const INFINITY_CONTRACT_ADDRESS = '';
  const addressesToExclude = [INFINITY_CONTRACT_ADDRESS].map((address) => trimLowerCase(address));

  const filters = [filterByContractAddress({ blockList: new Set(addressesToExclude) })];
  transferHandler(transferEmitter, [log, updateOrdersHandler], filters);

  listenForTransfers(transferEmitter);
}

function test(): void {
  const apiKey = process.env.HOOKDECK_API_KEY;
  if (!apiKey) {
    throw new Error('HOOKDECK_API_KEY environment variable is required');
  }

  const config: HookdeckConfig = {
    connectionName: 'infinity-dev',
    sourceName: 'goldsky-transfers',
    destinationName: 'infinity-dev',
    destinationUrl: '', // TODO
    apiVersion: '2022-03-01'
  };

  const hookdeck = new HookdeckService(config, apiKey);

  hookdeck.connect().then().catch(console.error);
}

// main();
test();
