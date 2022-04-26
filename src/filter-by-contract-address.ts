import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { getEthersProvider } from 'providers';
import { Transfer } from 'types/transfer';

export const filterByContractAddress =
  (options: { blockList: Set<string> }) =>
  async (transfer: Transfer): Promise<boolean> => {
    const provider = getEthersProvider(transfer.chainId);
    const tx = await provider.getTransaction(transfer.txHash);
    const from = trimLowerCase(tx.from);
    const to = trimLowerCase(tx.to);

    if (options.blockList.has(from) || options.blockList.has(to)) {
      console.log(`Filtered out transfer ${transfer.txHash}`);
      return false;
    }
    return true;
  };
