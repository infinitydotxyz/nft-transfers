import { ChainId } from '@infinityxyz/lib/types/core';
import { AlchemyNftWithMetadata } from '@infinityxyz/lib/types/services/alchemy';
import { normalize } from 'path';
import axios from 'axios';

const client = axios.create();
const apiKey = process.env.ALCHEMY_API_KEY ?? '';

export async function fetchTokenFromAlchemy(
  chainId: ChainId,
  collectionAddress: string,
  tokenId: string
): Promise<AlchemyNftWithMetadata | undefined> {
  console.log('Fetching token from Alchemy for', chainId, collectionAddress, tokenId);
  const url = getBaseUrl(chainId, '/getNFTMetadata');
  try {
    const response = await client.get(url.toString(), {
      params: {
        contractAddress: collectionAddress,
        tokenId
      }
    });
    const data = response.data as AlchemyNftWithMetadata;

    if (!data) {
      throw new Error('No data returned from alchemy');
    }
    return data;
  } catch (err) {
    console.error('failed to get user nfts from alchemy', err);
    return undefined;
  }
}

function getBaseUrl(chainId: ChainId, path: string) {
  switch (chainId) {
    case ChainId.Mainnet:
      return new URL(normalize(`https://eth-mainnet.alchemyapi.io/v2/${apiKey}/${path}`));
    case ChainId.Goerli:
      return new URL(normalize(`https://eth-goerli.alchemyapi.io/v2/${apiKey}/${path}`));
    case ChainId.Polygon:
      return new URL(normalize(`https://polygon-mainnet.g.alchemyapi.io/v2/${apiKey}/${path}`));

    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}
