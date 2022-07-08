import {
  BaseCollection,
  BaseToken,
  ChainId,
  EtherscanLinkType,
  InfinityLinkType,
  Token,
  TokenStandard,
  UserOwnedCollection,
  UserOwnedToken
} from '@infinityxyz/lib/types/core';
import { EventType, NftTransferEvent } from '@infinityxyz/lib/types/core/feed';
import { FirestoreOrder } from '@infinityxyz/lib/types/core/OBOrder';
import { AlchemyNftWithMetadata } from '@infinityxyz/lib/types/services/alchemy';
import { ZoraToken } from '@infinityxyz/lib/types/services/zora/tokens';
import {
  getEtherscanLink,
  getInfinityLink,
  getSearchFriendlyString,
  getUserDisplayName,
  hexToDecimalTokenId,
  trimLowerCase
} from '@infinityxyz/lib/utils';
import { ETHEREUM_INFINITY_EXCHANGE_ADDRESS, firestoreConstants, NULL_ADDRESS } from '@infinityxyz/lib/utils/constants';
import { getCollectionDocId } from '@infinityxyz/lib/utils/firestore';
import { fetchTokenFromAlchemy } from 'alchemy';
import { filterByContractAddress } from 'filter-by-contract-address';
import { firestore } from 'firebase-admin';
import { infinityDb, pixelScoreDb } from 'firestore';
import { Order } from 'models/order';
import { OrderItem } from 'models/order-item';
import { getDocIdHash, getProviderByChainId } from 'utils';
import { Transfer, TransferEmitter, TransferEventType } from './types/transfer';

// these addresses are used to ignore 'to' ownership transfers
const DEAD_ADDRESSES = new Set([
  '0x000000000000000000000000000000000000dead',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000008',
  '0x0000000000000000000000000000000000000009'
]);

const PIXELSCORE_DB_RANKINGS_COLL = 'rankings';

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

export const feedHandler: TransferHandlerFn = {
  fn: writeTransferToFeed,
  name: 'writeTransferToFeed',
  throwErrorOnFailure: true
};

export function transferHandler(transferEmitter: TransferEmitter, handlerFns: TransferHandlerFn[]): void {
  transferEmitter.on('transfer', async (transfer) => {
    try {
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
  const INFINITY_CONTRACT_ADDRESSES: string[] = [ETHEREUM_INFINITY_EXCHANGE_ADDRESS];
  const addressesToExclude = INFINITY_CONTRACT_ADDRESSES.map((address) => trimLowerCase(address));
  const filters = [filterByContractAddress({ blockList: new Set(addressesToExclude) })];
  for (const filter of filters) {
    const shouldHandle = await filter(transfer);
    if (!shouldHandle) {
      return;
    }
  }

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
  const batch = infinityDb.batch();
  const chainId = transfer.chainId;
  const collectionAddress = trimLowerCase(transfer.address);
  const tokenId = transfer.tokenId;
  const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
  const fromAddress = trimLowerCase(transfer.from);
  const toAddress = trimLowerCase(transfer.to);
  const tokenStandard = transfer.tokenStandard === TokenStandard.ERC721 ? TokenStandard.ERC721 : TokenStandard.ERC1155;

  // update the asset under collections/nfts collection
  const collectionNftDocRef = infinityDb
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(collectionDocId)
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(tokenId);
  batch.set(collectionNftDocRef, { owner: transfer.to }, { merge: true });

  // update fromUser
  await updateFromUserDoc(fromAddress, chainId, collectionAddress, tokenId, batch);

  // update toUser
  await updateToUserDoc(toAddress, chainId, collectionAddress, tokenId, tokenStandard, batch);

  // updare pixelScoreDb
  updatePixelScoreDb(toAddress, chainId, collectionAddress, tokenId);

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

export async function writeTransferToFeed(transfer: Transfer): Promise<void> {
  try {
    const chainId = transfer.chainId;
    const feedRef = infinityDb.collection(firestoreConstants.FEED_COLL);
    const transferDocRef = feedRef.doc(transfer.txHash);
    const nftData = await infinityDb
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(getCollectionDocId({ collectionAddress: transfer.address, chainId }))
      .collection(firestoreConstants.COLLECTION_NFTS_COLL)
      .doc(transfer.tokenId)
      .get();
    const collectionData = (
      await infinityDb
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(getCollectionDocId({ collectionAddress: transfer.address, chainId }))
        .get()
    ).data() as BaseCollection;

    const from = transfer.from;
    const to = transfer.to;
    const provider = getProviderByChainId(chainId);
    const [fromDisplayName, toDisplayName] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      [from, to].map((item) => getUserDisplayName(item, chainId, provider as any))
    );

    const nft: Partial<Token> | undefined = nftData as Partial<Token> | undefined;

    const collectionSlug = nft?.collectionSlug ?? collectionData?.slug ?? '';
    const collectionName = nft?.collectionName ?? collectionData?.metadata?.name ?? '';
    const nftName = nft?.metadata?.name ?? nft?.tokenId ?? transfer.tokenId;
    const nftSlug = nft?.slug ?? trimLowerCase(nftName) ?? '';
    const image =
      nft?.image?.url ??
      nft?.alchemyCachedImage ??
      nft?.image?.originalUrl ??
      collectionData?.metadata?.profileImage ??
      '';

    if (!collectionSlug || !collectionName || !nftName || !image) {
      console.log(
        `Not writing transfer to feed as some data is empty for ${transfer.address} ${transfer.tokenId}`,
        collectionSlug,
        collectionName,
        nftName,
        image
      );
      return;
    }

    const nftTransferEvent: NftTransferEvent = {
      type: EventType.NftTransfer,
      hasBlueCheck: nft?.hasBlueCheck ?? false,
      from,
      to,
      fromDisplayName,
      toDisplayName,
      tokenStandard: transfer.tokenStandard,
      txHash: transfer.txHash,
      quantity: 1, // default ERC721
      chainId,
      collectionAddress: transfer.address,
      collectionName,
      collectionSlug,
      collectionProfileImage: collectionData.metadata.profileImage,
      nftName,
      nftSlug,
      likes: 0,
      comments: 0,
      tokenId: transfer.tokenId,
      image,
      timestamp: transfer.timestamp,
      internalUrl: getInfinityLink({
        type: InfinityLinkType.Asset,
        collectionAddress: transfer.address,
        tokenId: transfer.tokenId,
        chainId
      }),
      externalUrl: getEtherscanLink({ type: EtherscanLinkType.Transaction, transactionHash: transfer.txHash })
    };

    transferDocRef
      .set(nftTransferEvent)
      .then(() => {
        console.log(`Wrote transfer to feed ${transferDocRef.path}`);
      })
      .catch((err) => {
        console.error(`Failed to write transfer to feed ${transfer.txHash}`);
        console.error(err);
      });
  } catch (err) {
    console.error('Error writng transfer to feed', err);
    return;
  }
}

async function updateFromUserDoc(
  fromAddress: string,
  chainId: string,
  collectionAddress: string,
  tokenId: string,
  batch: FirebaseFirestore.WriteBatch
): Promise<void> {
  if (fromAddress !== NULL_ADDRESS) {
    const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
    const fromUserDocRef = infinityDb.collection(firestoreConstants.USERS_COLL).doc(fromAddress);
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
      const collectionNfts = await fromUserCollectionDocRef
        .collection(firestoreConstants.USER_NFTS_COLL)
        .limit(2)
        .get();
      // 1 because we haven't deleted the tokenDoc yet
      if (collectionNfts.size === 1) {
        batch.delete(fromUserCollectionDocRef);
      }
    } else {
      console.log('Transfer Handler: From user token doc does not exist', fromAddress, collectionAddress, tokenId);
    }
  }
}

async function updateToUserDoc(
  toAddress: string,
  chainId: ChainId,
  collectionAddress: string,
  tokenId: string,
  tokenStandard: TokenStandard,
  batch: FirebaseFirestore.WriteBatch
): Promise<void> {
  if (!DEAD_ADDRESSES.has(toAddress)) {
    const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
    const collectionNftDocRef = infinityDb
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(collectionDocId)
      .collection(firestoreConstants.COLLECTION_NFTS_COLL)
      .doc(tokenId);
    const toUserDocRef = infinityDb.collection(firestoreConstants.USERS_COLL).doc(toAddress);
    const toUserCollectionDocRef = toUserDocRef
      .collection(firestoreConstants.USER_COLLECTIONS_COLL)
      .doc(collectionDocId);
    const toUserTokenDocRef = toUserCollectionDocRef.collection(firestoreConstants.USER_NFTS_COLL).doc(tokenId);
    const toUserTokenDoc = await toUserTokenDocRef.get();
    // first check for the non-existence of this token in the user's collection
    // if it does exist, no need to do anything
    if (!toUserTokenDoc.exists) {
      // update numNftsOwned
      batch.set(toUserDocRef, { numNftsOwned: firestore.FieldValue.increment(1) }, { merge: true });

      // fetch collection data
      const collectionDocRef = await infinityDb
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(collectionDocId)
        .get();
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
        batch.set(
          toUserCollectionDocRef,
          { numCollectionNftsOwned: firestore.FieldValue.increment(1) },
          { merge: true }
        );

        // add the tokenDoc
        const tokenDataDoc = await collectionNftDocRef.get();
        if (tokenDataDoc.exists && tokenDataDoc.data()) {
          const tokenData = tokenDataDoc.data() as BaseToken;
          const data: UserOwnedToken = {
            ...userOwnedCollectionData,
            ...tokenData
          };
          batch.set(toUserTokenDocRef, data, { merge: true });
        } else {
          // commenting this out as we are seeing rate limits
          // fetch token data from Zora
          // const zoraTokenData = await fetchTokenFromZora(chainId, collectionAddress, tokenId);
          // fetch token data from Alchemy for its cached image and as a possible backup
          const alchemyData = await fetchTokenFromAlchemy(chainId, collectionAddress, tokenId);

          // if (zoraTokenData?.data?.token?.token) {
          //   const transformedData = transformZoraTokenData(zoraTokenData.data.token.token);
          //   const userAssetData = {
          //     ...userOwnedCollectionData,
          //     ...transformedData,
          //     alchemyCachedImage: alchemyData?.media?.[0]?.gateway
          //   };
          //   batch.set(toUserTokenDocRef, userAssetData, { merge: true });
          // } else
          if (alchemyData) {
            const transformedData = transformAlchemyTokenData(alchemyData);
            const userAssetData = {
              ...userOwnedCollectionData,
              ...transformedData
            };
            batch.set(toUserTokenDocRef, userAssetData, { merge: true });
          } else {
            console.log('Alchemy has no data for', chainId, collectionAddress, tokenId);
          }
        }
      } else {
        console.log('Transfer Handler: Collection doc does not exist (not indexed)', collectionDocId);
      }
    } else {
      console.log('Transfer Handler: To user token doc already exists', toAddress, collectionAddress, tokenId);
    }
  }
}

function updatePixelScoreDb(owner: string, chainId: string, collectionAddress: string, tokenId: string) {
  const docId = getDocIdHash({ chainId, collectionAddress, tokenId });
  pixelScoreDb
    .doc(`${PIXELSCORE_DB_RANKINGS_COLL}/${docId}`)
    .set({ owner }, { merge: true })
    .then(() => {
      console.log('=================== PixelScore DB updated for =======================', docId);
    })
    .catch((err) => {
      console.log('Error updating ownership info in pixelscore db', err);
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function transformZoraTokenData(fetchedTokenData: ZoraToken['token']): Partial<UserOwnedToken> {
  const transformedData: Partial<UserOwnedToken> = {
    tokenId: fetchedTokenData.tokenId,
    slug: getSearchFriendlyString(fetchedTokenData.name),
    metadata: {
      name: fetchedTokenData.name,
      description: fetchedTokenData.description,
      image: fetchedTokenData.image?.url,
      attributes: fetchedTokenData.attributes
    },
    minter: fetchedTokenData.mintInfo?.originatorAddress,
    mintedAt: new Date(fetchedTokenData.mintInfo?.mintContext?.blockTimestamp).getTime(),
    mintTxHash: fetchedTokenData.mintInfo?.mintContext?.transactionHash,
    mintPrice: fetchedTokenData.mintInfo?.price?.chainTokenPrice?.decimal,
    owner: fetchedTokenData.owner,
    tokenStandard: TokenStandard.ERC721,
    numTraitTypes: fetchedTokenData.attributes?.length,
    zoraImage: fetchedTokenData.image,
    zoraContent: fetchedTokenData.content,
    image: {
      updatedAt: Date.now(),
      originalUrl: fetchedTokenData.image?.url
    },
    tokenUri: fetchedTokenData.tokenUrl,
    updatedAt: Date.now()
  };
  return transformedData;
}

function transformAlchemyTokenData(fetchedTokenData: AlchemyNftWithMetadata): Partial<UserOwnedToken> {
  const transformedData: Partial<UserOwnedToken> = {
    tokenId: hexToDecimalTokenId(fetchedTokenData.id.tokenId),
    slug: getSearchFriendlyString(fetchedTokenData.title ?? fetchedTokenData.metadata.name),
    metadata: {
      name: fetchedTokenData.title ?? fetchedTokenData.metadata.name,
      description: fetchedTokenData.description ?? fetchedTokenData.metadata.description,
      image: fetchedTokenData.metadata?.image,
      attributes: fetchedTokenData.metadata?.attributes
    },
    tokenStandard: TokenStandard.ERC721,
    numTraitTypes: fetchedTokenData.metadata?.attributes?.length,
    alchemyCachedImage: fetchedTokenData.media?.[0]?.gateway,
    image: {
      url: fetchedTokenData.media?.[0]?.gateway ?? fetchedTokenData.media?.[0]?.raw,
      updatedAt: Date.now(),
      originalUrl: fetchedTokenData.media?.[0]?.raw ?? fetchedTokenData.metadata?.image
    },
    tokenUri: fetchedTokenData.tokenUri?.gateway ?? fetchedTokenData.tokenUri?.raw,
    updatedAt: Date.now()
  };
  return transformedData;
}
