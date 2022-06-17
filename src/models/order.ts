import { FirestoreOrder, FirestoreOrderItem, OBOrderStatus } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { infinityDb } from 'firestore';
import { Transfer } from 'types/transfer';
import { OrderItem } from './order-item';
import { OrderType } from './order.types';

export class Order {
  static getRef(orderId: string): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return infinityDb
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(orderId) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  private orderItemsRef: FirebaseFirestore.CollectionReference<FirestoreOrderItem>;

  constructor(private order: FirestoreOrder) {
    this.orderItemsRef = this.ref.collection(
      firestoreConstants.ORDER_ITEMS_SUB_COLL
    ) as FirebaseFirestore.CollectionReference<FirestoreOrderItem>;
  }

  // TODO what is profile image? does it need to be updated when user address is updated?
  public async handleTransfer(transfer: Transfer): Promise<FirestoreOrder> {
    const orderItems = await this.getOrderItems();
    for (const orderItem of orderItems) {
      const matchesTransfer = orderItem.transferMatches(transfer);
      if (matchesTransfer) {
        await orderItem.transfer(transfer);
        await orderItem.save();
      }
    }

    const { orderStatus: updatedOrderStatus } = this.getOrderStatus(orderItems);

    let requiresUpdate = false;
    if (updatedOrderStatus !== this.order.orderStatus) {
      this.order.orderStatus = updatedOrderStatus;
      requiresUpdate = true;
    }

    if (requiresUpdate) {
      await this.save();
    }
    return this.order;
  }

  private getOrderStatus(orderItems: OrderItem[]): { orderStatus: OBOrderStatus } {
    let status: OBOrderStatus = OBOrderStatus.ValidActive;
    const ranking = {
      [OBOrderStatus.ValidActive]: 0,
      [OBOrderStatus.ValidInactive]: 1,
      [OBOrderStatus.Invalid]: 2
    };
    const updateStatus = (itemStatus: OBOrderStatus) => {
      if (ranking[itemStatus] > ranking[status]) {
        status = itemStatus;
      }
    };

    for (const item of orderItems) {
      const itemStatus = item.orderStatus;
      updateStatus(itemStatus);
    }

    return { orderStatus: status };
  }

  private async save(): Promise<FirebaseFirestore.WriteResult> {
    return await this.ref.update(this.order);
  }

  private async getOrderItems(): Promise<OrderItem[]> {
    const orderItems = await this.orderItemsRef.get();
    return orderItems.docs.map((doc) => new OrderItem(doc.data(), doc.ref));
  }

  public get type(): OrderType {
    return this.order.isSellOrder ? OrderType.Listing : OrderType.Offer;
  }

  private get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return Order.getRef(this.order.id);
  }
}
