import { ChainId } from '@infinityxyz/lib/types/core';
import * as infinityDevServiceAccount from './creds/nftc-dev-firebase.json';
import * as infinityProdServiceAccount from './creds/nftc-infinity.json';
import * as pixelScoreServiceAccount from './creds/pixelscore-firebase.json';
import { getEnvironmentVariable } from 'utils';

const isProd = process.env.INFINITY_NODE_ENV === 'prod';

export const config = {
  env: {
    mode: isProd ? 'prod' : 'dev'
  },
  eth: {
    chainId: (process.env.CHAIN_ID || ChainId.Mainnet) as ChainId,
    alchemyApiKey: getEnvironmentVariable('ALCHEMY_API_KEY')
  },
  firestore: {
    infinityServiceAccount: isProd ? infinityProdServiceAccount : infinityDevServiceAccount,
    pixelScoreServiceAccount: pixelScoreServiceAccount
  }
};
