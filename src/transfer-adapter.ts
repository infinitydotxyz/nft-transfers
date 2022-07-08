import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
import { NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { BigNumber, ethers } from 'ethers';
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
