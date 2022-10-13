import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants, trimLowerCase } from '@infinityxyz/lib/utils';
import { ethers } from 'ethers';
import { infinityDb } from 'firestore';
import { Order } from 'models/order';
import { streamQueryWithRef } from 'stream-query';
import { getProviderByChainId } from 'utils';
import { ERC721ABI } from '@infinityxyz/lib/abi';

const cache = new Map<string, string>();

async function getERC721Owner(chainId: string, address: string, tokenId: string) {
  try {
    const id = `${chainId}-${address}-${tokenId}`;
    const cachedOwner = cache.get(id);
    if (cachedOwner) {
      return cachedOwner;
    }
    const provider = getProviderByChainId(chainId);
    const contract = new ethers.Contract(address, ERC721ABI, provider);
    const owner = trimLowerCase(await contract.ownerOf(tokenId));
    cache.set(id, owner);
    return owner;
  } catch (err) {
    console.error(`failed to get owner`, err);

    return '';
  }
}

async function verifyOrders() {
  const db = infinityDb;

  const ordersRef = db.collection(
    firestoreConstants.ORDERS_COLL
  ) as FirebaseFirestore.CollectionReference<FirestoreOrder>;

  const stream = streamQueryWithRef(ordersRef);

  for await (const item of stream) {
    const data = item.data;
    if (data && data.chainId === '1') {
      console.log(`Verifying order ${item.data?.id}`);
      const order = new Order(data);
      await order.updateStatus(db, getERC721Owner);
    }
  }
}

void verifyOrders();
