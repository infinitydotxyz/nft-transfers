import {
  BaseCollection,
  BaseToken,
  TokenStandard,
  UserOwnedCollection,
  UserOwnedToken
} from '@infinityxyz/lib/types/core';
import { FirestoreOrder } from '@infinityxyz/lib/types/core/OBOrder';
import { getSearchFriendlyString, trimLowerCase } from '@infinityxyz/lib/utils';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getCollectionDocId } from '@infinityxyz/lib/utils/firestore';
import { firestore } from 'firebase-admin';
import { getDb } from 'firestore';
import { Order } from 'models/order';
import { OrderItem } from 'models/order-item';
import { fetchTokenFromZora } from 'zora';
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
  const tokenStandard = transfer.tokenStandard === TokenStandard.ERC721 ? TokenStandard.ERC721 : TokenStandard.ERC1155;

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
    // update numNftsOwned and numCollectionNftsOwned
    batch.set(fromUserDocRef, { numNftsOwned: firestore.FieldValue.increment(-1) }, { merge: true });
    batch.set(
      fromUserCollectionDocRef,
      { numCollectionNftsOwned: firestore.FieldValue.increment(-1) },
      { merge: true }
    );

    // delete the tokenDoc
    batch.delete(fromUserTokenDocRef);

    // also delete collectionDoc if it is empty
    const collectionNfts = await fromUserCollectionDocRef.collection(firestoreConstants.USER_NFTS_COLL).limit(2).get();
    // 1 because we haven't deleted the tokenDoc yet
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
    batch.set(toUserDocRef, { numNftsOwned: firestore.FieldValue.increment(1) }, { merge: true });

    // fetch collection data
    const collectionDocRef = await db.collection(firestoreConstants.COLLECTIONS_COLL).doc(collectionDocId).get();
    if (collectionDocRef.exists) {
      const collectionDocData = collectionDocRef.data() as BaseCollection;
      const userOwnedCollectionData: Omit<UserOwnedCollection, 'numCollectionNftsOwned'> = {
        chainId: collectionDocData.chainId,
        collectionAddress: collectionDocData.address,
        collectionSlug: collectionDocData.slug,
        collectionName: collectionDocData.metadata?.name ?? '',
        collectionDescription: collectionDocData.metadata?.description ?? '',
        collectionSymbol: collectionDocData.metadata?.symbol ?? '',
        collectionProfileImage: collectionDocData.metadata?.profileImage ?? '',
        collectionBannerImage: collectionDocData.metadata?.bannerImage ?? '',
        displayType: collectionDocData.metadata?.displayType ?? '',
        hasBlueCheck: collectionDocData.hasBlueCheck,
        tokenStandard
      };
      batch.set(toUserCollectionDocRef, userOwnedCollectionData, { merge: true });
      batch.set(toUserCollectionDocRef, { numCollectionNftsOwned: firestore.FieldValue.increment(1) }, { merge: true });

      // add the tokenDoc
      const tokenDataDoc = await db
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(tokenId)
        .get();

      if (tokenDataDoc.exists) {
        const tokenData = tokenDataDoc.data() as BaseToken;
        const data: UserOwnedToken = {
          ...userOwnedCollectionData,
          ...tokenData
        };
        batch.set(toUserTokenDocRef, data, { merge: true });
      } else {
        const zoraTokenData = await fetchTokenFromZora(chainId, collectionAddress, tokenId);
        const userAssetData: Partial<UserOwnedToken> = {
          ...userOwnedCollectionData,
          tokenId: zoraTokenData.data.token.token.tokenId,
          slug: getSearchFriendlyString(zoraTokenData.data?.token?.token?.name),
          metadata: {
            name: zoraTokenData.data?.token?.token?.name,
            description: zoraTokenData.data?.token?.token?.description,
            image: zoraTokenData.data?.token?.token?.image?.url,
            attributes: zoraTokenData.data?.token?.token?.attributes
          },
          minter: zoraTokenData.data?.token?.token?.mintInfo?.originatorAddress,
          mintedAt: new Date(zoraTokenData.data?.token?.token?.mintInfo?.mintContext?.blockTimestamp).getTime(),
          mintTxHash: zoraTokenData.data?.token?.token?.mintInfo?.mintContext?.transactionHash,
          mintPrice: zoraTokenData.data?.token?.token?.mintInfo?.price?.chainTokenPrice?.decimal,
          owner: zoraTokenData.data?.token?.token?.owner,
          tokenStandard: TokenStandard.ERC721,
          numTraitTypes: zoraTokenData.data?.token?.token?.attributes?.length,
          zoraImage: zoraTokenData.data?.token?.token?.image,
          zoraContent: zoraTokenData.data?.token?.token?.content,
          image: {
            url:
              zoraTokenData.data?.token?.token?.image?.mediaEncoding?.preview ??
              zoraTokenData.data?.token?.token?.image?.mediaEncoding?.large,
            updatedAt: Date.now(),
            originalUrl: zoraTokenData.data?.token?.token?.image?.url
          },
          tokenUri: zoraTokenData.data?.token?.token?.tokenUrl,
          updatedAt: Date.now()
        };
        batch.set(toUserTokenDocRef, userAssetData, { merge: true });
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
