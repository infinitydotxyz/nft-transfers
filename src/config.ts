import { ChainId } from '@infinityxyz/lib/types/core';
import * as infinityDevServiceAccount from './creds/nftc-dev-firebase.json';
import * as infinityProdServiceAccount from './creds/nftc-infinity.json';
import * as pixelScoreServiceAccount from './creds/pixelscore-firebase.json';
import { getEnvironmentVariable } from 'utils';
import { ethers } from 'ethers';

const isProd = process.env.INFINITY_NODE_ENV === 'prod';

const getRPCUrl = (chainId: ChainId, apiKey: string) => {
  switch (chainId) {
    case ChainId.Mainnet:
      return `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;
    case ChainId.Goerli:
      return `https://eth-goerli.g.alchemy.com/v2/${apiKey}`;
    case ChainId.Polygon:
      return `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`;
    default:
      throw new Error('Unsupported chain id');
  }
};

const chainId = (process.env.CHAIN_ID || ChainId.Mainnet) as ChainId;
const network = parseInt(chainId, 10);
const alchemyApiKey = getEnvironmentVariable('ALCHEMY_API_KEY');
export const config = {
  env: {
    mode: isProd ? 'prod' : 'dev'
  },
  eth: {
    chainId: chainId,
    websocketProvider: new ethers.providers.AlchemyWebSocketProvider(network, alchemyApiKey),
    rpcProvider: new ethers.providers.StaticJsonRpcProvider(getRPCUrl(chainId, alchemyApiKey))
  },
  firestore: {
    infinityServiceAccount: isProd ? infinityProdServiceAccount : infinityDevServiceAccount,
    pixelScoreServiceAccount: pixelScoreServiceAccount
  }
};
