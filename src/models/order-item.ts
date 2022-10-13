import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { isOBOrderExpired } from '@infinityxyz/lib/utils/orders';
import { getUsername, infinityDb } from 'firestore';
import { Transfer } from 'types/transfer';
import { OrderType } from './order.types';
import { FirestoreOrderItem, OBOrderStatus } from '@infinityxyz/lib/types/core/OBOrder';
import FirestoreBatchHandler from 'batch-handler';

export class OrderItem {
  static readonly OWNER_INHERITS_OFFERS = true;

  static getImpactedOrderItemsQueries(transfer: Transfer): Record<string, FirebaseFirestore.Query<FirestoreOrderItem>> {
    const tokenQuery = infinityDb
      .collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL)
      .where('chainId', '==', transfer.chainId)
      .where('collectionAddress', '==', transfer.address)
      .where('tokenId', '==', transfer.tokenId) as FirebaseFirestore.Query<FirestoreOrderItem>;

    const offers = tokenQuery.where('isSellOrder', '==', false);
    const listings = tokenQuery.where('isSellOrder', '==', true);

    const impactedListings = listings.where('makerAddress', 'in', [transfer.to, transfer.from]);

    let impactedOffers = offers;
    if (!OrderItem.OWNER_INHERITS_OFFERS) {
      impactedOffers = offers.where('takerAddress', '==', transfer.from);
    }

    return {
      offers: impactedOffers,
      listings: impactedListings
    };
  }

  private initialOwner: string;

  private currentOwner: string;

  constructor(
    private orderItem: FirestoreOrderItem,
    private ref: FirebaseFirestore.DocumentReference<FirestoreOrderItem>
  ) {
    this.initialOwner = this._ownerFromOrder;
    this.currentOwner = this.initialOwner;
  }

  get orderStatus(): OBOrderStatus {
    return this.orderItem.orderStatus;
  }

  set orderStatus(orderStatus: OBOrderStatus) {
    this.orderItem.orderStatus = orderStatus;
  }

  get type(): OrderType {
    return this.orderItem.isSellOrder ? OrderType.Listing : OrderType.Offer;
  }

  get taker(): string {
    return this.orderItem.takerAddress;
  }

  get owner() {
    return this.currentOwner;
  }

  get token() {
    return {
      chainId: this.orderItem.chainId,
      address: this.orderItem.collectionAddress,
      tokenId: this.orderItem.tokenId
    };
  }

  transferMatches(transfer: Transfer): boolean {
    const correctToken =
      transfer.address === this.orderItem.collectionAddress &&
      transfer.tokenId === this.orderItem.tokenId &&
      transfer.chainId === this.orderItem.chainId;

    /**
     * if the order is a listing, then the order matches if
     * 1. the transfer is to the maker
     * 2. the transfer is from the maker
     */
    if (this.type === OrderType.Listing) {
      return (
        correctToken && (transfer.to === this.orderItem.makerAddress || transfer.from === this.orderItem.makerAddress)
      );
    }

    /**
     * the order is an offer
     *
     * if the order is an offer then the order matches if
     * 1. the transfer is to the taker
     * 2. the new owner inherits the offers on the token
     */
    const newOwnerWillBecomeTaker = OrderItem.OWNER_INHERITS_OFFERS;
    const takerIsGainingTokens = transfer.to === this.orderItem.takerAddress;
    // const takerIsLosingTokens = transfer.from === this.orderItem.takerAddress; // TODO erc1155
    const takerShouldBeUpdated = newOwnerWillBecomeTaker || takerIsGainingTokens;
    return correctToken && takerShouldBeUpdated;
  }

  async transfer(transfer: Transfer): Promise<FirestoreOrderItem> {
    if (!this.transferMatches(transfer)) {
      return this.orderItem;
    }

    await this.updateOwner(transfer.to);
    return this.orderItem;
  }

  async updateOwner(newOwner: string) {
    if (this.type === OrderType.Offer && OrderItem.OWNER_INHERITS_OFFERS) {
      this.orderItem.takerAddress = newOwner;
      const takerUsername = await getUsername(newOwner);
      this.orderItem.takerUsername = takerUsername;
    }
    this.currentOwner = newOwner;

    const orderStatus = await this.getOrderStatus();
    this.orderItem.orderStatus = orderStatus;
  }

  async save(batchHandler?: FirestoreBatchHandler): Promise<void> {
    if (batchHandler) {
      return await batchHandler.addAsync(this.ref, this.orderItem, { merge: true });
    }
    await this.ref.set(this.orderItem, { merge: true });
    return;
  }

  async updateStatus() {
    const orderStatus = await this.getOrderStatus();
    this.orderItem.orderStatus = orderStatus;
  }

  private get _ownerFromOrder(): string {
    if (this.type === OrderType.Offer) {
      return this.orderItem.takerAddress;
    }
    return this.orderItem.makerAddress;
  }

  /**
   * an order is live if the current time is between the start and end time
   */
  private get _isLive(): boolean {
    const now = Date.now();
    const isExpired = isOBOrderExpired(this.orderItem);

    return now >= this.orderItem.startTimeMs && !isExpired;
  }

  private async getOrderStatus(): Promise<OBOrderStatus> {
    if (!this._isLive) {
      console.log(`Order ${this.ref.id} is not live`);
      return OBOrderStatus.Invalid;
    }

    const currentOwnerQuantity = await this.getCurrentOwnerQuantity();
    const currentOwnerOwnsEnoughTokens = currentOwnerQuantity >= this.orderItem.numTokens;
    let isValidActive: boolean;
    if (this.type === OrderType.Offer) {
      const takerIsCurrentOwner = this.orderItem.takerAddress === this.currentOwner;
      const makerIsTaker = this.orderItem.makerAddress === this.orderItem.takerAddress;
      if (!takerIsCurrentOwner) {
        console.log(`OFFER Taker is not current owner`);
      }
      if (!currentOwnerOwnsEnoughTokens) {
        console.log(`OFFER Current owner does not own enough tokens`);
      }
      if (makerIsTaker) {
        console.log(`OFFER Maker is taker`);
      }
      isValidActive = takerIsCurrentOwner && currentOwnerOwnsEnoughTokens && !makerIsTaker;
      if (isValidActive) {
        console.log(
          `OFFER taker: ${this.orderItem.takerAddress} is current owner: ${this.currentOwner} and is not also the maker ${this.orderItem.makerAddress}`
        );
      }
    } else {
      const makerIsCurrentOwner = this.orderItem.makerAddress === this.currentOwner;
      if (!makerIsCurrentOwner) {
        console.log(`LISTING Maker is not current owner`);
      }
      if (!currentOwnerOwnsEnoughTokens) {
        console.log(`LISTING Current owner does not own enough tokens`);
      }
      isValidActive = makerIsCurrentOwner && currentOwnerOwnsEnoughTokens;
      if (isValidActive) {
        console.log(`LISTING maker ${this.orderItem.makerAddress} is current owner ${this.currentOwner}`);
      }
    }

    return isValidActive ? OBOrderStatus.ValidActive : OBOrderStatus.ValidInactive;
  }

  private async getCurrentOwnerQuantity(): Promise<number> {
    return new Promise<number>((resolve) => {
      resolve(1); // TODO this cannot be assumed for erc1155
    });
  }
}
