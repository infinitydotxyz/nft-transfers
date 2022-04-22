import { ChainOBOrder } from '@infinityxyz/lib/types/core/OBOrder';

export enum OrderStatus {
  ValidActive = 'validActive',
  ValidInactive = 'validInactive',
  Invalid = 'invalid'
}

export interface FirestoreOrder {
  id: string;
  orderStatus: OrderStatus;
  chainId: string;
  isSellOrder: boolean;
  numItems: number;
  startPriceEth: number;
  endPriceEth: number;
  startPriceWei: string;
  endPriceWei: string;
  startTimeMs: number;
  endTimeMs: number;
  minBpsToSeller: number;
  nonce: string;
  complicationAddress: string;
  currencyAddress: string;
  makerUsername: string;
  makerAddress: string;
  takerUsername: string;
  takerAddress: string;
  signedOrder: ChainOBOrder;
}

export interface FirestoreOrderItem {
  id: string;
  orderStatus: OrderStatus;
  chainId: string;
  isSellOrder: boolean;
  numItems: number;
  startPriceEth: number;
  endPriceEth: number;
  startTimeMs: number;
  endTimeMs: number;
  makerUsername: string;
  makerAddress: string;
  takerUsername: string;
  takerAddress: string;
  collection: string;
  collectionName: string;
  profileImage: string;
  tokenId: string;
  tokenName: string;
  imageUrl: string;
  numTokens: number;
}
