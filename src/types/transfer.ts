import { ChainId } from '@infinityxyz/lib/types/core';
import Emittery from 'emittery';

export enum TransferEventType {
  Transfer = 'transfer',
  RevertTransfer = 'revertTransfer'
}

export interface Transfer {
  txHash: string;

  from: string;

  to: string;

  address: string;

  chainId: ChainId;

  tokenId: string;

  blockNumber: number;

  /**
   * epoch ms
   */
  timestamp: number;

  type: TransferEventType;
}

export type TransferEvent = {
  transfer: Transfer;
};

export type TransferEmitter = Emittery<TransferEvent>;
