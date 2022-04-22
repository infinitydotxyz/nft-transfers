import { Transfer, TransferEmitter, TransferEventType } from './types/transfer';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, FirestoreOrderItem, OrderStatus } from 'types/firestore-order';
import { getUsername } from 'firestore';

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

export async function updateOrders(transfer: Transfer, db: FirebaseFirestore.Firestore): Promise<void> {}

// export async function updateOrders(transfer: Transfer, db: FirebaseFirestore.Firestore): Promise<void> {
//   const affectedOrders = await getAffectedOrders(transfer, db);

//   const handler = transfer.type === TransferEventType.Transfer ? handleTransferForOrder : handleRevertTransferForOrder;

//   for (const orderDoc of affectedOrders) {
//       const update = await handler(transfer, orderDoc, db);
//       const orderItems = await getOrderItemsFromOrder(orderDoc.ref);
//       const batch = db.batch();
//       batch.update(orderDoc.ref, update);
//       orderItems.forEach((snapshot) => {
//         batch.update(snapshot.ref, update);
//       });
//       await batch.commit();
//   }
// }

// async function getAffectedOrders(transfer: Transfer, db: FirebaseFirestore.Firestore) {
//   // const orderItemsQuery = db
//   //   .collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL)
//   //   .where('chainId', '==', transfer.chainId)
//   //   .where('collection', '==', transfer.address)
//   //   .where('tokenId', '==', transfer.tokenId)

//   // if(transfer.type === TransferEventType.Transfer) {
//   //   // TODO how do we know if another nft has made the order invalid?

//   // /**
//   //  * if the order is a listing, and the maker is transfer.from
//   //  * then we need to make the order as invalid active
//   //  */
//   // const listingItemsQueryByOldOwner = orderItemsQuery.where('isSellOrder', '==', true).where('maker', '==', transfer.from).where('orderStatus', '==', OrderStatus.ValidActive);

//   // /**
//   //  * if the order is a listing and the maker is transfer.to
//   //  * then we need to mark the order a valid active
//   //  */
//   // const listingItemsQueryByNewOwner = orderItemsQuery.where('isSellOrder', '==', true).where('maker', '==', transfer.to).where('orderStatus', '==', OrderStatus.ValidInactive);

//   // /**
//   //  * if the order is an offer, then update the taker from the
//   //  * previous owner to the new owner
//   //  * TODO can offers be ValidInactive?
//   //  */
//   // const offerItemsQuery = orderItemsQuery.where('isSellOrder', '==', false).where('taker', '==', transfer.from).where('orderStatus', '==', OrderStatus.ValidActive);

//   // // const results = await Promise.all([listingItemsQuery.get(), offerItemsQuery.get()]);

//   // // const orders = [...results[0].docs, ...results[1].docs];

//   // // return orders;

//   // } else {
//   //   // revert a previous transfer
//   // /**
//   //  * if the order is a listing, and the maker is transfer.from
//   //  * then we need to make the order as invalid active
//   //  */
//   //  const listingItemsQueryByOldOwner = orderItemsQuery.where('isSellOrder', '==', true).where('maker', '==', transfer.to).where('orderStatus', '==', OrderStatus.ValidActive);

//   //  /**
//   //   * if the order is a listing and the maker is transfer.to
//   //   * then we need to mark the order a valid active
//   //   */
//   //  const listingItemsQueryByNewOwner = orderItemsQuery.where('isSellOrder', '==', true).where('maker', '==', transfer.from).where('orderStatus', '==', OrderStatus.ValidInactive);

//   //  /**
//   //   * if the order is an offer, then update the taker from the
//   //   * previous owner to the new owner
//   //   * TODO can offers be ValidInactive?
//   //   */
//   //  const offerItemsQuery = orderItemsQuery.where('isSellOrder', '==', false).where('taker', '==', transfer.to).where('orderStatus', '==', OrderStatus.ValidActive);
//   // }
// }

// export async function handleTransferForOrder(
//   transfer: Transfer,
//   orderDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
//   db: FirebaseFirestore.Firestore
// ): Promise<Partial<FirestoreOrderItem>> {
//   const order = orderDoc.data() as FirestoreOrder;
//   let update: Partial<FirestoreOrderItem> = {};
//   const isListing = order.isSellOrder === true;

//   if (isListing) {
//     update = { orderStatus: OrderStatus.ValidInactive };
//   } else {
//     const newTaker = transfer.to;
//     const takerUsername = await getUsername(newTaker, db);
//     update = { takerAddress: newTaker, takerUsername };
//   }
//   return update;
// }

// export async function handleRevertTransferForOrder(
//   transfer: Transfer,
//   orderDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
//   db: FirebaseFirestore.Firestore
// ):Promise<Partial<FirestoreOrderItem>> {
//   const order = orderDoc.data() as FirestoreOrder;

//   let update: Partial<FirestoreOrderItem> = {};

//   const isListing = order.isSellOrder === true;
//   if(isListing) {
//     update = { orderStatus: OrderStatus.ValidActive };
//   } else {
//     const newTaker = transfer.from;
//     const takerUsername = await getUsername(newTaker, db);
//     update = { takerAddress: newTaker, takerUsername };
//   }

//   return update;
// }

// function getOrderItemsFromOrder(orderRef: FirebaseFirestore.DocumentReference) {
//   return orderRef.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL).get();
// }
