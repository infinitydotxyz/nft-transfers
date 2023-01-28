import { ChainId } from '@infinityxyz/lib/types/core';
import { ethers } from 'ethers';
import { NftTransferEvent, NftTransferEventsSync } from './types';
import { infinityDb } from 'firestore';
import FirestoreBatchHandler from 'firestore/batch-handler';
import { erc721TransferLogAdapter } from 'transfer-adapter';
import { transferHandlerV2 } from './handler';
import { TransferEventType, TransferLog } from 'types/transfer';
import { streamQueryWithRef } from 'firestore/stream-query';
import PQueue from 'p-queue';
import { config } from 'config';
import { FieldPath } from 'firebase-admin/firestore';

export class Sync {
  protected websocketProvider: ethers.providers.WebSocketProvider;
  protected provider: ethers.providers.StaticJsonRpcProvider;

  public readonly TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  protected get syncRef(): FirebaseFirestore.DocumentReference<NftTransferEventsSync> {
    return this._db
      .collection('_sync')
      .doc('onChainEventSync')
      .collection('nftTransfersSync')
      .doc(this._chainId) as FirebaseFirestore.DocumentReference<NftTransferEventsSync>;
  }

  constructor(protected _chainId: ChainId, protected _db: FirebaseFirestore.Firestore) {
    this.websocketProvider = config.eth.websocketProvider;
    this.provider = config.eth.rpcProvider;
  }

  async sync() {
    const [currentBlockNumber, currentFinalizedBlock] = await Promise.all([
      this.provider.getBlockNumber(),
      this.provider.getBlock('finalized')
    ]);

    console.log(`Backfilling from block ${currentFinalizedBlock.number} to ${currentBlockNumber}...`);
    const sync = await this._getSync(currentBlockNumber, currentFinalizedBlock);
    await this._syncBlocks(
      sync.data.latestBlockNumber + 1,
      sync.data.finalizedBlockNumber + 1,
      currentBlockNumber,
      currentFinalizedBlock.number
    );
    await this._updateSync({
      latestBlockNumber: currentBlockNumber,
      finalizedBlockNumber: currentFinalizedBlock.number
    });

    console.log(`Completed backfilling`);

    const queue = new PQueue({ concurrency: 1 });

    console.log(`Listening for new blocks...`);
    const handler = (blockNumber: number) => {
      queue
        .add(async () => {
          const currentFinalizedBlock = await this.provider.getBlock('finalized');
          const sync = await this._getSync(blockNumber, currentFinalizedBlock);
          await this._syncBlocks(
            sync.data.latestBlockNumber + 1,
            sync.data.finalizedBlockNumber + 1,
            blockNumber,
            currentFinalizedBlock.number
          );
          await this._updateSync({
            latestBlockNumber: blockNumber,
            finalizedBlockNumber: currentFinalizedBlock.number
          });
        })
        .catch((err) => {
          console.error(`Failed to sync blockNumber: ${blockNumber}`, err);
        });
    };

    this.websocketProvider.on('block', handler);

    return async () => {
      this.websocketProvider.off('block', handler);
      await queue.onIdle();
    };
  }

  protected async _getSync(currentBlockNumber: number, currentFinalizedBlock: ethers.providers.Block) {
    const syncSnap = await this.syncRef.get();
    const sync: NftTransferEventsSync = syncSnap.data() ?? {
      metadata: {
        chainId: this._chainId,
        updatedAt: Date.now()
      },
      data: {
        latestBlockNumber: currentBlockNumber,
        finalizedBlockNumber: currentFinalizedBlock.number
      }
    };

    return sync;
  }

  protected async _updateSync(data: NftTransferEventsSync['data']) {
    const update: NftTransferEventsSync = {
      metadata: {
        chainId: this._chainId,
        updatedAt: Date.now()
      },
      data
    };
    await this.syncRef.set(update, { merge: true });
  }

  protected async _syncBlocks(
    fromLatestBlock: number,
    fromFinalizedBlock: number,
    toLatestBlock: number,
    toFinalizedBlock: number
  ) {
    const queue = new PQueue({ concurrency: 20 });

    let successful = true;

    if (fromFinalizedBlock <= toFinalizedBlock) {
      console.log(`Syncing blocks from ${fromFinalizedBlock} to ${toFinalizedBlock} (finalized)...`);
      for (let blockNumber = fromFinalizedBlock; blockNumber <= toFinalizedBlock; blockNumber += 1) {
        queue
          .add(async () => {
            console.log(`Finalizing block ${blockNumber}...`);
            const block = await this.provider.getBlock(blockNumber);
            await this._processBlock(block, 'finalized');
          })
          .catch((err) => {
            successful = false;
            console.error(err);
          });
      }
      await queue.onIdle();
      console.log(`Synced blocks from ${fromFinalizedBlock} to ${toFinalizedBlock} (finalized)`);
    }

    const latestBlock = Math.max(fromLatestBlock, toFinalizedBlock + 1);
    if (latestBlock <= toLatestBlock) {
      console.log(`Syncing blocks from ${latestBlock} to ${toLatestBlock} (latest)...`);
      for (let blockNumber = latestBlock; blockNumber <= toLatestBlock; blockNumber += 1) {
        queue
          .add(async () => {
            console.log(`Processing block ${blockNumber}...`);
            const block = await this.provider.getBlock(blockNumber);
            await this._processBlock(block, 'latest');
          })
          .catch((err) => {
            successful = false;
            console.error(err);
          });
      }
      await queue.onIdle();
      console.log(`Synced blocks from ${latestBlock} to ${toLatestBlock} (latest)`);
    }

    if (!successful) {
      throw new Error('Backfill failed');
    }
  }

  protected async _processBlock(block: ethers.providers.Block, commitment: 'latest' | 'safe' | 'finalized') {
    const batchHandler = new FirestoreBatchHandler(this._db);
    const logs = await this.provider.getLogs({
      fromBlock: block.number,
      toBlock: block.number,
      topics: [this.TRANSFER_TOPIC]
    });

    for (const transferLog of logs) {
      const isERC721Transfer = transferLog.topics.length === 4 && transferLog.topics[3];
      if (isERC721Transfer) {
        const transfer = erc721TransferLogAdapter(transferLog as unknown as TransferLog, TransferEventType.Transfer);
        await transferHandlerV2(transfer, block, commitment, batchHandler);
      }
    }

    await batchHandler.flush();

    if (commitment === 'finalized') {
      await this._processReorgs(block, batchHandler);
      await batchHandler.flush();
    }
  }

  protected async _processReorgs(block: ethers.providers.Block, batchHandler: FirestoreBatchHandler) {
    const eventsToRemove = infinityDb
      .collectionGroup('nftTransferEvents')
      .where('metadata.chainId', '==', this._chainId)
      .where('data.blockNumber', '==', block.number)
      .where('data.blockHash', '!=', block.hash)
      .orderBy('data.blockHash', 'asc')
      .orderBy(FieldPath.documentId(), 'asc') as FirebaseFirestore.Query<NftTransferEvent>;

    const stream = streamQueryWithRef(eventsToRemove, (item, ref) => [item?.data?.blockHash, ref]);
    for await (const { data, ref } of stream) {
      const update: NftTransferEvent = {
        metadata: {
          ...data.metadata,
          processed: false,
          commitment: 'finalized'
        },
        data: {
          ...data.data,
          removed: true
        }
      };
      await batchHandler.addAsync(ref, update, { merge: true });
    }
  }
}
