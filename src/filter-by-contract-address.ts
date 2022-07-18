import { ETHEREUM_INFINITY_EXCHANGE_ADDRESS } from '@infinityxyz/lib/utils';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { ethers } from 'ethers';
import { getEthersProvider } from 'providers';
import { Transfer } from 'types/transfer';
import { InfinityExchangeABI } from '@infinityxyz/lib/abi/infinityExchange';

const infinityExchangeIface = new ethers.utils.Interface(InfinityExchangeABI);
const INFINITY_TRANSFER_NFTS_FUNCTION_NAME = 'transferMultipleNFTs';

export const filterByContractAddress =
  (options: { blockList: Set<string> }) =>
  async (transfer: Transfer): Promise<boolean> => {
    const provider = getEthersProvider(transfer.chainId);
    const tx = await provider.getTransaction(transfer.txHash);
    const from = trimLowerCase(tx.from);
    const to = trimLowerCase(tx.to);

    const decodedData = infinityExchangeIface.parseTransaction({ data: tx.data, value: tx.value });
    const functionName = decodedData.name;

    if (options.blockList.has(from) || options.blockList.has(to)) {
      // should still handle the case where Infinity Exchange is used to transfer/batch transfer NFTs via its helper function
      if (to === ETHEREUM_INFINITY_EXCHANGE_ADDRESS && functionName === INFINITY_TRANSFER_NFTS_FUNCTION_NAME) {
        return true;
      } else {
        console.log(`Filtered out transfer ${transfer.txHash}`);
        return false;
      }
    }
    return true;
  };
