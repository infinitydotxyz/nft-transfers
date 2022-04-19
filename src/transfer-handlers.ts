import { Transfer, TransferEmitter } from 'types';

export type TransferHandlerFn = {
  fn: (transfer: Transfer, db: FirebaseFirestore.Firestore) => Promise<void> | void;
  name: string;
  throwErrorOnFailure: boolean;
};

export const updateOrdersHandler: TransferHandlerFn = {
  fn: updateOrders,
  name: 'updateOrders',
  throwErrorOnFailure: true
};

export function transferHandler(
  transferEmitter: TransferEmitter,
  handlerFns: TransferHandlerFn[],
  db: FirebaseFirestore.Firestore
) {
  transferEmitter.on('transfer', async (transfer) => {
    try {
      const results = await Promise.allSettled(
        handlerFns.map(({ fn }) => {
          return fn(transfer, db);
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

const retry = async (fn: () => Promise<void>, maxAttempts = 3, attempt = 0) => {
  try {
    await fn();
  } catch (err) {
    if (attempt === maxAttempts) {
      throw err;
    }
    await retry(fn, maxAttempts, attempt + 1);
  }
};

export async function updateOrders(transfer: Transfer, db: FirebaseFirestore.Firestore): Promise<void> {
  const orderItemsRef = db.collectionGroup('orderItems');
  const invalidOrdersRef = db.collection('orders').doc('all').collection('invalid');

  const ordersForItemQuery = orderItemsRef
    .where('chainId', '==', transfer.chainId) // TODO still needs to be added to the order item schema
    .where('collection', '==', transfer.address)
    .where('tokenId', '==', transfer.tokenId);
  // TODO filter by validActive

  const orderItemSnaps = await ordersForItemQuery.get();

  /**
   * get orderItems for the nft that was transferred
   *
   * for each orderItem, get the order and all of it's nested order items
   *
   * delete the order and all order items from validActive
   *
   * write order and all order items to invalid
   */
  const orderDocRefs: Map<string, FirebaseFirestore.DocumentReference> = new Map();
  for (const orderItemSnap of orderItemSnaps.docs) {
    const orderDocRef = orderItemSnap.ref.parent.parent;
    if (orderDocRef?.id) {
      orderDocRefs.set(orderDocRef?.id, orderDocRef);
    }
  }

  for (const [, orderDocRef] of orderDocRefs) {
    await retry(async () => {
      const orderDoc = await orderDocRef.get();
      if (orderDoc.exists) {
        const batch = db.batch();
        const order = orderDoc.data();
        const orderItems = await orderDoc.ref.collection('orderItems').get();
        const invalidOrderDocRef = invalidOrdersRef.doc(orderDocRef.id);
        batch.delete(orderDoc.ref);
        batch.set(invalidOrderDocRef, order);
        for (const orderItemDoc of orderItems.docs) {
          const orderItem = orderItemDoc.data();
          const invalidOrderItemDoc = invalidOrderDocRef.collection('orderItems').doc(orderItemDoc.id);
          batch.delete(orderItemDoc.ref);
          batch.set(invalidOrderItemDoc, orderItem);
        }
        await batch.commit();
      }
    });
  }
}
