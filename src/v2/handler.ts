import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { infinityDb, pixelScoreDb } from 'firestore';
import { Transfer } from 'types/transfer';
import { NftEventKind, NftTransferEvent } from './types';
import { constants, ethers } from 'ethers';
import { getDocIdHash } from 'utils';
import FirestoreBatchHandler from 'firestore/batch-handler';

export async function transferHandlerV2(
  transfer: Transfer,
  block: ethers.providers.Block,
  commitment: 'latest' | 'safe' | 'finalized',
  batchHandler: FirestoreBatchHandler
): Promise<void> {
  try {
    const id = `${transfer.blockNumber}:${transfer.blockHash}:${transfer.logIndex}`;

    const transferEvent: NftTransferEvent = {
      metadata: {
        kind: NftEventKind.Transfer,
        processed: false,
        commitment,
        timestamp: Date.now(),
        chainId: transfer.chainId,
        address: transfer.address,
        tokenId: transfer.tokenId
      },
      data: {
        from: transfer.from,
        to: transfer.to,
        isMint: transfer.from === constants.AddressZero,
        blockNumber: transfer.blockNumber,
        blockHash: transfer.blockHash,
        blockTimestamp: block.timestamp,
        transactionHash: transfer.txHash,
        transactionIndex: transfer.transactionIndex,
        logIndex: transfer.logIndex,
        removed: transfer.removed,
        topics: transfer.topics,
        data: transfer.data
      }
    };

    updatePixelScoreDb(transfer.to, transfer.chainId, transfer.address, transfer.tokenId);
    const collId = getCollectionDocId({ collectionAddress: transfer.address, chainId: transfer.chainId });

    const tokenRef = infinityDb
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(collId)
      .collection(firestoreConstants.COLLECTION_NFTS_COLL)
      .doc(transfer.tokenId);
    const transferRef = tokenRef.collection('nftTransferEvents').doc(id);

    await batchHandler.addAsync(transferRef, transferEvent, { merge: true });
  } catch (err) {
    console.error(err);
  }
}

const PIXELSCORE_DB_RANKINGS_COLL = 'rankings';
function updatePixelScoreDb(owner: string, chainId: string, collectionAddress: string, tokenId: string) {
  const docId = getDocIdHash({ chainId, collectionAddress, tokenId });
  if (pixelScoreDb) {
    pixelScoreDb
      .doc(`${PIXELSCORE_DB_RANKINGS_COLL}/${docId}`)
      .set({ owner }, { merge: true })
      .catch((err) => {
        console.log('Error updating ownership info in pixelscore db', err);
      });
  }
}
