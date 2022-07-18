import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { BigNumber, ethers } from 'ethers';
import { TransferEventType, Transfer, TransferLog } from 'types/transfer';

export function erc721TransferLogAdapter(transfer: TransferLog, type: TransferEventType): Transfer {
  const topics = transfer.topics;

  const from = trimLowerCase(ethers.utils.hexZeroPad(ethers.utils.hexValue(topics[1]), 20));
  const to = trimLowerCase(ethers.utils.hexZeroPad(ethers.utils.hexValue(topics[2]), 20));

  const tokenAddress = trimLowerCase(transfer.address);
  const tokenId = BigNumber.from(topics[3]).toBigInt().toString();

  return {
    txHash: transfer.transactionHash,
    from,
    to,
    address: tokenAddress,
    chainId: ChainId.Mainnet, // TODO support other chains
    tokenId,
    blockNumber: transfer.blockNumber,
    timestamp: Date.now(),
    type,
    tokenStandard: TokenStandard.ERC721
  };
}
