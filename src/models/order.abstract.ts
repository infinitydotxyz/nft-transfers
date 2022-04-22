import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from 'firestore';
import { FirestoreOrder, FirestoreOrderItem, OrderStatus } from 'types/firestore-order';
import { Transfer } from 'types/transfer';
import { OrderItem } from './order-item';
import { Order as IOrder, OrderType } from './order.interface';

export abstract class Order implements IOrder {
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

  public async handleTransfer(transfer: Transfer) {
    const orderItems = await this.getOrderItems();
    for (const orderItem of orderItems) {
      const matchesTransfer = orderItem.transferMatches(transfer);
      if (matchesTransfer) {
        await orderItem.transfer(transfer);
        await orderItem.save();
      }
    }

    const updatedOrderStatus = this.getOrderStatus(orderItems);
    if (updatedOrderStatus !== this.order.orderStatus) {
      this.order.orderStatus = updatedOrderStatus;
      await this.save();
    }
    return this.order;
  }

  private getOrderStatus(orderItems: OrderItem[]) {
    let status: OrderStatus = OrderStatus.ValidActive;
    const ranking = {
      [OrderStatus.ValidActive]: 0,
      [OrderStatus.ValidInactive]: 1,
      [OrderStatus.Invalid]: 2
    };
    for (const item of orderItems) {
      const itemStatus = item.orderStatus;
      if (ranking[itemStatus] > ranking[status]) {
        status = itemStatus;
      }
    }
    return status;
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

  public get orderStatus(): OrderStatus {
    throw new Error('Not yet implemented');
  }

  private get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return Order.getRef(this.order.id);
  }

  private orderItemsRef: FirebaseFirestore.CollectionReference<FirestoreOrderItem>;
}
