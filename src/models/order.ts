import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb, getUsername } from 'firestore';
import { FirestoreOrder, FirestoreOrderItem, OrderStatus } from 'types/firestore-order';
import { Transfer } from 'types/transfer';
import { OrderItem } from './order-item';
import { Order as IOrder, OrderType } from './order.interface';

export class Order implements IOrder {
  static getRef(orderId: string) {
    const db = getDb();
    return db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(orderId) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  constructor(private order: FirestoreOrder) {
    this.orderItemsRef = this.ref.collection(
      firestoreConstants.ORDER_ITEMS_SUB_COLL
    ) as FirebaseFirestore.CollectionReference<FirestoreOrderItem>;
  }

  // TODO what should happen if the maker is the same as the taker?
  public async handleTransfer(transfer: Transfer) {
    const orderItems = await this.getOrderItems();
    for (const orderItem of orderItems) {
      const matchesTransfer = orderItem.transferMatches(transfer);
      if (matchesTransfer) {
        await orderItem.transfer(transfer);
        await orderItem.save();
      }
    }

    const { orderStatus: updatedOrderStatus, updateTakerUsername } = this.getOrderStatus(orderItems);

    let requiresUpdate = updateTakerUsername;
    if (updateTakerUsername) {
      this.order.takerUsername = await getUsername(this.order.takerAddress);
    }

    if (updatedOrderStatus !== this.order.orderStatus) {
      this.order.orderStatus = updatedOrderStatus;
      requiresUpdate = true;
    }

    if (requiresUpdate) {
      await this.save();
    }
    return this.order;
  }

  private getOrderStatus(orderItems: OrderItem[]): { orderStatus: OrderStatus; updateTakerUsername: boolean } {
    let status: OrderStatus = OrderStatus.ValidActive;
    let updateTakerUsername = false;
    const ranking = {
      [OrderStatus.ValidActive]: 0,
      [OrderStatus.ValidInactive]: 1,
      [OrderStatus.Invalid]: 2
    };
    const updateStatus = (itemStatus: OrderStatus) => {
      if (ranking[itemStatus] > ranking[status]) {
        status = itemStatus;
      }
    };

    for (const item of orderItems) {
      const itemStatus = item.orderStatus;
      updateStatus(itemStatus);
    }

    if (this.type === OrderType.Offer) {
      /**
       * if the order is an offer, we need to make sure that
       * the taker is the same for all order items
       */
      const takers = new Set<string>();
      for (const item of orderItems) {
        takers.add(item.taker);
      }

      if (takers.size === 1) {
        const taker = takers.values().next().value as string;
        if (taker !== this.order.takerAddress) {
          this.order.takerAddress = taker;
          updateTakerUsername = true;
        }
        updateStatus(OrderStatus.ValidActive);
      }
    }

    return { orderStatus: status, updateTakerUsername };
  }

  private async save() {
    await this.ref.update(this.order);
  }

  private async getOrderItems(): Promise<OrderItem[]> {
    const orderItems = await this.orderItemsRef.get();
    return orderItems.docs.map((doc) => new OrderItem(doc.data(), doc.ref));
  }

  public get type() {
    return this.order.isSellOrder ? OrderType.Listing : OrderType.Offer;
  }

  private get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return Order.getRef(this.order.id);
  }

  private orderItemsRef: FirebaseFirestore.CollectionReference<FirestoreOrderItem>;
}
