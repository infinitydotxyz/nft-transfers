import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';

export enum TransferEventType {
  Transfer = 'transfer',
  RevertTransfer = 'revertTransfer'
}

export interface Transfer {
  txHash: string;

  blockHash: string;

  from: string;

  to: string;

  address: string;

  chainId: ChainId;

  tokenId: string;

  tokenStandard: TokenStandard;

  transactionIndex: number;

  blockNumber: number;

  /**
   * epoch ms
   */
  timestamp: number;

  type: TransferEventType;

  logIndex: number;

  removed: boolean;
  topics: string[];
  data: string;
}

export type TransferEvent = {
  transfer: Transfer;
};

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
