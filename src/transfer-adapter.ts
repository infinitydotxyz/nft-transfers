import { TokenStandard } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { config } from 'config';
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
    blockHash: transfer.blockHash,
    from,
    to,
    address: tokenAddress,
    chainId: config.eth.chainId,
    tokenId,
    blockNumber: transfer.blockNumber,
    timestamp: Date.now(),
    type,
    tokenStandard: TokenStandard.ERC721,
    logIndex: transfer.logIndex,
    transactionIndex: transfer.transactionIndex,
    removed: transfer.removed,
    topics: transfer.topics,
    data: transfer.data
  };
}
