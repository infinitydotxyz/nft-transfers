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
import { join } from 'path';
import * as chalk from 'chalk';

const log = {
  fn: (transfer: Transfer) => {
    console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
  },
  name: 'logger',
  throwErrorOnFailure: false
};

async function main(): Promise<void> {
  initDb(serviceAccount as ServiceAccount);

  const transferEmitter = new Emittery<TransferEvent>();
  const initTransferListener: (emitter: TransferEmitter, transferEndpoint: URL) => Promise<void> = server;

  // TODO add infinity addresses
  const INFINITY_CONTRACT_ADDRESS = '';
  const addressesToExclude = [INFINITY_CONTRACT_ADDRESS].map((address) => trimLowerCase(address));

  const filters = [filterByContractAddress({ blockList: new Set(addressesToExclude) })];
  transferHandler(transferEmitter, [log, updateOrdersHandler], filters);

  const service = `nft-transfers`;
  const host = new URL(`https://${service}-dot-${serviceAccount.project_id}.ue.r.appspot.com/`);
  const transferEndpoint = new URL(join(host.toString(), `/nftTransfer`));

  const config: HookdeckConfig = {
    connectionName: `${service}-${serviceAccount.project_id}`,
    sourceName: 'goldsky-transfers',
    destinationName: 'infinity-dev',
    destinationUrl: transferEndpoint.toString(),
    apiVersion: '2022-03-01'
  };

  await initTransferListener(transferEmitter, transferEndpoint);

  const hookdeck = new HookdeckService(config);
  const { connected, isPaused } = await hookdeck.connect();
  if (!connected) {
    throw new Error('Could not connect to hookdeck');
  }
  if (isPaused) {
    console.log(chalk.red('Hookdeck connection is paused'));
  }
  console.log(chalk.green(`Connected to hookdeck`));
}

void main();
