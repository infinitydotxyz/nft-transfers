import { initDb } from 'firestore';
import { server } from 'server';
import * as Emittery from 'emittery';
import { transferHandler, updateOrdersHandler, updateOwnershipHandler } from 'transfer-handlers';
import { TransferEvent, TransferEmitter, Transfer } from 'types/transfer';
import { filterByContractAddress } from 'filter-by-contract-address';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { HookdeckService } from 'hookdeck/hookdeck.service';
import * as chalk from 'chalk';
import { hookdeckConfigs, serviceAccount, transferEndpoint } from 'config';

const log = {
  fn: (transfer: Transfer) => {
    console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
  },
  name: 'logger',
  throwErrorOnFailure: false
};

async function main(): Promise<void> {
  initDb(serviceAccount);

  const transferEmitter = new Emittery<TransferEvent>();
  const initTransferListener: (emitter: TransferEmitter, transferEndpoint: URL) => Promise<void> = server;

  // TODO add infinity addresses
  // dont think we need this anymore
  const INFINITY_CONTRACT_ADDRESS = '';
  const addressesToExclude = [INFINITY_CONTRACT_ADDRESS].map((address) => trimLowerCase(address));

  const filters = [filterByContractAddress({ blockList: new Set(addressesToExclude) })];
  transferHandler(transferEmitter, [log, updateOrdersHandler, updateOwnershipHandler], filters);

  await initTransferListener(transferEmitter, transferEndpoint);

  for (const hookdeckConfig of hookdeckConfigs) {
    const hookdeck = new HookdeckService(hookdeckConfig);
    const { connected, isPaused } = await hookdeck.connect();
    if (!connected) {
      throw new Error('Could not connect to hookdeck');
    }
    if (isPaused) {
      console.log(chalk.red('Hookdeck connection is paused'));
    }
  }
}

void main();
