import { BaseCollection, BaseToken, TokenStandard } from '@infinityxyz/lib/types/core';
import { FirestoreOrder } from '@infinityxyz/lib/types/core/OBOrder';
import { trimLowerCase } from '@infinityxyz/lib/utils';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getCollectionDocId } from '@infinityxyz/lib/utils/firestore';
import { getDb } from 'firestore';
import { Order } from 'models/order';
import { OrderItem } from 'models/order-item';
import { Transfer, TransferEmitter, TransferEventType } from './types/transfer';

export type TransferHandlerFn = {
  fn: (transfer: Transfer) => Promise<void> | void;
  name: string;
  throwErrorOnFailure: boolean;
};

export const updateOrdersHandler: TransferHandlerFn = {
  fn: updateOrders,
  name: 'updateOrders',
  throwErrorOnFailure: true
};

export const updateOwnershipHandler: TransferHandlerFn = {
  fn: updateOwnership,
  name: 'updateOwnership',
  throwErrorOnFailure: true
};

export function transferHandler(
  transferEmitter: TransferEmitter,
  handlerFns: TransferHandlerFn[],
  filters: ((transfer: Transfer) => Promise<boolean>)[]
): void {
  transferEmitter.on('transfer', async (transfer) => {
    try {
      for (const filter of filters) {
        const shouldHandle = await filter(transfer);
        if (!shouldHandle) {
          return;
        }
      }

      const results = await Promise.allSettled(
        handlerFns.map(({ fn }) => {
          return fn(transfer);
        })
      );

      let index = 0;
      for (const result of results) {
        const handler = handlerFns[index];
        if (result.status === 'rejected' && handler.throwErrorOnFailure) {
          throw new Error(`${handler.name} failed to handle transfer. ${result.reason}`);
        }
        index += 1;
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
}

export async function updateOrders(transfer: Transfer): Promise<void> {
  const standardizedTransfer =
    transfer.type === TransferEventType.Transfer
      ? transfer
      : {
          ...transfer,
          type: TransferEventType.Transfer,
          from: transfer.to, // treat a revert as a transfer from the to address and to the from address
          to: transfer.from
        };

  const orderItemQueries = Object.values(OrderItem.getImpactedOrderItemsQueries(standardizedTransfer));
  const orderItemRefs = await Promise.all(orderItemQueries.map((query) => query.get()));

  const orderPromises = orderItemRefs
    .flatMap((item) => item.docs)
    .map((item) => {
      const order = item.ref.parent.parent;
      return new Promise<Order>((resolve, reject) => {
        order
          ?.get()
          .then((snap) => {
            const orderData = snap.data() as FirestoreOrder;
            if (orderData) {
              resolve(new Order(orderData));
            } else {
              reject(new Error('Order not found'));
            }
          })
          .catch(reject);
      });
    });

  const orders = await Promise.all(orderPromises);

  console.log(`Found: ${orders.length} orders to update`);

  for (const order of orders) {
    await order.handleTransfer(standardizedTransfer);
  }
}

export async function updateOwnership(transfer: Transfer): Promise<void> {
  const db = getDb();
  const batch = db.batch();
  const chainId = transfer.chainId;
  const collectionAddress = trimLowerCase(transfer.address);
  const tokenId = transfer.tokenId;
  const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
  const fromAddress = trimLowerCase(transfer.from);
  const toAddress = trimLowerCase(transfer.to);
  const tokenStandard =
    transfer.tokenStandard === '721'
      ? TokenStandard.ERC721
      : transfer.tokenStandard === '1155'
      ? TokenStandard.ERC1155
      : '';

  // update the asset under collections/nfts collection
  const tokenDocRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(collectionDocId)
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(tokenId);
  batch.set(tokenDocRef, { owner: transfer.to }, { merge: true });

  // update fromUser
  const fromUserDocRef = db.collection(firestoreConstants.USERS_COLL).doc(fromAddress);
  const fromUserCollectionDocRef = fromUserDocRef
    .collection(firestoreConstants.USER_COLLECTIONS_COLL)
    .doc(collectionDocId);
  const fromUserTokenDocRef = fromUserCollectionDocRef.collection(firestoreConstants.USER_NFTS_COLL).doc(tokenId);
  const fromUserTokenDoc = await fromUserTokenDocRef.get();
  // first check for the existence of this token in the user's collection
  // if it doesn't exist, no need to do anything
  if (fromUserTokenDoc.exists) {
    // update numNftsOwned
    const fromUserDocData = (await fromUserDocRef.get()).data();
    let numNftsOwned = fromUserDocData?.numNftsOwned;
    // ignore if we don't have this data
    // it is assumed an external service will have populated this data
    if (numNftsOwned !== undefined && numNftsOwned > 0) {
      numNftsOwned -= 1;
      batch.set(fromUserDocRef, { numNftsOwned }, { merge: true });
    }

    // update numCollectionNftsOwned
    const fromUserCollectionDocData = (await fromUserCollectionDocRef.get()).data();
    let numCollectionNftsOwned = fromUserCollectionDocData?.numCollectionNftsOwned;
    // ignore if we don't have this data
    if (numCollectionNftsOwned !== undefined && numCollectionNftsOwned > 0) {
      numCollectionNftsOwned -= 1;
      batch.set(fromUserCollectionDocRef, { numCollectionNftsOwned }, { merge: true });
    }

    // delete the tokenDoc
    batch.delete(fromUserTokenDocRef);

    // also delete collectionDoc if it is empty
    const collectionNfts = await fromUserCollectionDocRef.collection(firestoreConstants.USER_NFTS_COLL).limit(2).get();
    // 1 because we havent't deleted the tokenDoc yet
    if (collectionNfts.size === 1) {
      batch.delete(fromUserCollectionDocRef);
    }
  } else {
    console.log('Transfer Handler: From user token doc does not exist', fromAddress, collectionAddress, tokenId);
  }

  // update toUser
  const toUserDocRef = db.collection(firestoreConstants.USERS_COLL).doc(toAddress);
  const toUserCollectionDocRef = toUserDocRef.collection(firestoreConstants.USER_COLLECTIONS_COLL).doc(collectionDocId);
  const toUserTokenDocRef = toUserCollectionDocRef.collection(firestoreConstants.USER_NFTS_COLL).doc(tokenId);
  const toUserTokenDoc = await toUserTokenDocRef.get();
  // first check for the non-existence of this token in the user's collection
  // if it does exist, no need to do anything
  if (!toUserTokenDoc.exists) {
    // update numNftsOwned
    const toUserDocData = (await toUserDocRef.get()).data();
    let numNftsOwned = toUserDocData?.numNftsOwned;
    if (numNftsOwned !== undefined) {
      numNftsOwned += 1;
      batch.set(toUserDocRef, { numNftsOwned }, { merge: true });
    }

    // fetch collection data
    const collectionDocRef = await db.collection(firestoreConstants.COLLECTIONS_COLL).doc(collectionDocId).get();
    if (collectionDocRef.exists) {
      // update numCollectionNftsOwned
      const toUserCollectionDocData = (await toUserCollectionDocRef.get()).data();
      let numCollectionNftsOwned = toUserCollectionDocData?.numCollectionNftsOwned;
      if (numCollectionNftsOwned !== undefined) {
        numCollectionNftsOwned += 1;
      }
      const collectionDocData = collectionDocRef.data() as BaseCollection;
      const data = {
        chainId: collectionDocData.chainId,
        address: collectionDocData.address,
        slug: collectionDocData.slug,
        name: collectionDocData.metadata.name,
        description: collectionDocData.metadata.description,
        symbol: collectionDocData.metadata.symbol,
        profileImage: collectionDocData.metadata.profileImage,
        bannerImage: collectionDocData.metadata.bannerImage,
        displayType: collectionDocData.metadata.displayType,
        tokenStandard,
        numCollectionNftsOwned
      };
      batch.set(toUserCollectionDocRef, data, { merge: true });

      // add the tokenDoc
      const tokenDataDoc = await db
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(tokenId)
        .get();
      if (tokenDataDoc.exists) {
        const tokenData = tokenDataDoc.data() as BaseToken;
        const data = {
          ...tokenData,
          collectionAddress: collectionAddress,
          tokenStandard
        };
        batch.set(toUserTokenDocRef, data, { merge: false });
      } else {
        console.log('Transfer Handler: To user token doc does not exist', toAddress, collectionAddress, tokenId);
      }
    } else {
      console.log('Transfer Handler: Collection doc does not exist (not indexed)', collectionDocId);
    }
  } else {
    console.log('Transfer Handler: To user token doc already exists', toAddress, collectionAddress, tokenId);
  }

  batch
    .commit()
    .then(() => {
      console.log(`Updated ownership of ${chainId}:${collectionAddress}:${tokenId} to ${transfer.to}`);
    })
    .catch((err) => {
      console.error(`Failed to update ownership of ${chainId}:${collectionAddress}:${tokenId} to ${transfer.to}`);
      console.error(err);
    });
}
