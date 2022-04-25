import { ethers } from 'ethers';

const getNewEthersProvider = (chainId: string) => {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error(`ALCHEMY_API_KEY environment variable is not set`);
  }
  const provider = new ethers.providers.AlchemyProvider(parseInt(chainId, 10), apiKey);
  return provider;
};

const providers: Map<string, ethers.providers.AlchemyProvider> = new Map();

export function getEthersProvider(chainId: string) {
  let provider = providers.get(chainId);

  if (provider) {
    return provider;
  }

  provider = getNewEthersProvider(chainId);
  providers.set(chainId, provider);
  return provider;
}
