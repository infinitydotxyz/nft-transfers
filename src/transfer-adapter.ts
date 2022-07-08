import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
import { NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { BigNumber, ethers } from 'ethers';
import { GoldskyTransferData, GoldskyTransferDataV2 } from 'types/goldsky-transfer';
import { TransferEventType, Transfer, TransferLog } from 'types/transfer';

export function erc721TransferLogAdapter(transfer: TransferLog, type: TransferEventType): Transfer {
  const topics = transfer.topics;

  let from = trimLowerCase(ethers.utils.hexValue(topics[1]));
  let to = trimLowerCase(ethers.utils.hexValue(topics[2]));
  if (from === '0x0') {
    from = NULL_ADDRESS;
  }
  if (to === '0x0') {
    to = NULL_ADDRESS;
  }

  const address = trimLowerCase(transfer.address);
  const tokenId = BigNumber.from(topics[3]).toBigInt().toString();

  return {
    txHash: transfer.transactionHash,
    from,
    to,
    address,
    chainId: ChainId.Mainnet, // TODO support other chains
    tokenId,
    blockNumber: transfer.blockNumber,
    timestamp: Date.now(),
    type,
    tokenStandard: TokenStandard.ERC721
  };
}

export function transferAdapter(
  transfer: GoldskyTransferData | GoldskyTransferDataV2,
  type: TransferEventType
): Transfer {
  if ('transaction_hash' in transfer) {
    return transferAdapterV2(transfer, type);
  }
  return transferAdapterV1(transfer, type);
}

export function transferAdapterV2(transfer: GoldskyTransferDataV2, type: TransferEventType): Transfer {
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
    type,
    tokenStandard: transfer.type === '721' ? TokenStandard.ERC721 : TokenStandard.ERC1155
  };
}

export function transferAdapterV1(transfer: GoldskyTransferData, type: TransferEventType): Transfer {
  return {
    txHash: transfer.id,
    from: trimLowerCase(transfer.from),
    to: trimLowerCase(transfer.to),
    address: trimLowerCase(transfer.contract),
    chainId: ChainId.Mainnet, // TODO support other chains
    tokenId: transfer.token_id,
    blockNumber: transfer.block_number,
    timestamp: transfer.timestamp * 1000,
    type,
    tokenStandard: transfer.type === '721' ? TokenStandard.ERC721 : TokenStandard.ERC1155
  };
}
