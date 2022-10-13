import { FirestoreOrder, FirestoreOrderItem, OBOrderStatus } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import FirestoreBatchHandler from 'batch-handler';
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
  public async handleTransfer(transfer: Transfer, db: FirebaseFirestore.Firestore): Promise<FirestoreOrder> {
    const batch = new FirestoreBatchHandler(db);
    const orderItems = await this.getOrderItems();
    for (const orderItem of orderItems) {
      const matchesTransfer = orderItem.transferMatches(transfer);
      if (matchesTransfer) {
        await orderItem.transfer(transfer);
        await orderItem.save(batch);
      }
    }

    await batch.flush();
    const { orderStatus: updatedOrderStatus } = this.getOrderStatus(orderItems);

    if (updatedOrderStatus !== this.order.orderStatus) {
      this.order.orderStatus = updatedOrderStatus;
    }
    await this.setOrderStatus(updatedOrderStatus, orderItems, batch);

    await batch.flush();
    return this.order;
  }

  async setOrderStatus(
    orderStatus: OBOrderStatus,
    orderItems: OrderItem[],
    batch?: FirestoreBatchHandler
  ): Promise<void> {
    for (const orderItem of orderItems) {
      if (orderItem.orderStatus !== orderStatus) {
        orderItem.orderStatus = orderStatus;
        await orderItem.save(batch);
      }
    }
    if (this.order.orderStatus !== orderStatus) {
      this.order.orderStatus = orderStatus;
      console.log(`Order status for ${this.order.id} changed from ${this.order.orderStatus} to ${orderStatus}`);
      await this.save(batch);
    }

    if (batch) {
      await batch.flush();
    }
  }

  public async updateStatus(
    db: FirebaseFirestore.Firestore,
    getOwner: (chainId: string, address: string, tokenId: string) => Promise<string>
  ): Promise<void> {
    const batch = new FirestoreBatchHandler(db);
    const orderItems = await this.getOrderItems();
    for (const orderItem of orderItems) {
      const originalStatus = orderItem.orderStatus;
      const token = orderItem.token;
      const isCollectionOrder = token.tokenId === '';
      if (!isCollectionOrder) {
        let ownerChanged = false;
        const owner = await getOwner(token.chainId, token.address, token.tokenId);
        if (owner !== orderItem.owner) {
          console.log(`Order Item owner changed from ${orderItem.owner} to ${owner}. Updating...`);
          await orderItem.updateOwner(owner);
          ownerChanged = true;
        }
        await orderItem.updateStatus();
        if (ownerChanged || orderItem.orderStatus !== originalStatus) {
          console.log(`Order item status changed from ${originalStatus} to ${orderItem.orderStatus}`);
          await orderItem.save(batch);
        }
      }
    }
    await batch.flush();

    const { orderStatus: updatedOrderStatus } = this.getOrderStatus(orderItems);

    await this.setOrderStatus(updatedOrderStatus, orderItems, batch);
    await batch.flush();
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

  private async save(batchHandler?: FirestoreBatchHandler): Promise<void> {
    if (batchHandler) {
      return await batchHandler.addAsync(this.ref, this.order, { merge: true });
    }
    await this.ref.set(this.order, { merge: true });
    return;
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
