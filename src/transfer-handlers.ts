import { Transfer, TransferEmitter, TransferEventType } from './types/transfer';
import { OrderItem } from 'models/order-item';
import { Order } from 'models/order';
import { FirestoreOrder } from '@infinityxyz/lib/types/core/OBOrder';

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
