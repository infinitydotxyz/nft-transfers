import * as chalk from 'chalk';
import { hookdeckConfigs, transferEndpoint } from 'config';
import * as Emittery from 'emittery';
import { HookdeckService } from 'hookdeck/hookdeck.service';
import { server } from 'server';
import { feedHandler, transferHandler, updateOrdersHandler, updateOwnershipHandler } from 'transfer-handlers';
import { Transfer, TransferEmitter, TransferEvent } from 'types/transfer';

const log = {
  fn: (transfer: Transfer) => {
    console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
  },
  name: 'logger',
  throwErrorOnFailure: false
};

async function main(): Promise<void> {
  const transferEmitter = new Emittery<TransferEvent>();
  const initTransferListener: (emitter: TransferEmitter, transferEndpoint: URL) => Promise<void> = server;

  transferHandler(transferEmitter, [log, updateOrdersHandler, updateOwnershipHandler, feedHandler]);

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
