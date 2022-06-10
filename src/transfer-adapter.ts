import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { GoldskyTransferDataV2 } from 'types/goldsky-transfer';
import { TransferEventType, Transfer } from 'types/transfer';

export function transferAdapter(transfer: GoldskyTransferDataV2, type: TransferEventType): Transfer {
  const chainId = transfer._gs_chain === 'mainnet' ? ChainId.Mainnet : undefined;
  if (!chainId) {
    throw new Error(`Invalid chain id ${transfer._gs_chain}`); // TODO support other chains
  }
  return {
    txHash: transfer.transaction_hash,
    from: trimLowerCase(transfer.from),
    to: trimLowerCase(transfer.to),
    address: trimLowerCase(transfer.contract_id),
    chainId: chainId,
    tokenId: transfer.token_id,
    blockNumber: parseInt(transfer.block_number, 10),
    timestamp: parseInt(transfer.timestamp, 10) * 1000,
    type
  };
}
