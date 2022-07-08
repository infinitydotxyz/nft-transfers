import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
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

  tokenStandard: TokenStandard;

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

export interface TransferLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean; // in case of reorgs this is true, else false
  id: string;
}
