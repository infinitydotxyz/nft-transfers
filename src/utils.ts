import { trimLowerCase } from '@infinityxyz/lib/utils';
import { createHash } from 'crypto';
import { JsonRpcProvider } from '@ethersproject/providers';

export const JSON_RPC_MAINNET_KEYS = (() => {
  const apiKeys = getMultipleEnvVariables('JSON_RPC_MAINNET');
  return apiKeys;
})();

export function randomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomItem<T>(array: T[]): T {
  const index = randomInt(0, array.length - 1);
  return array[index];
}

function getMultipleEnvVariables(prefix: string, minLength = 1): string[] {
  const variables = [];
  let i = 0;

  for (;;) {
    try {
      const apiKey = getEnvironmentVariable(`${prefix}${i}`);
      variables.push(apiKey);
      i += 1;
    } catch (err) {
      break;
    }
  }

  if (variables.length < minLength) {
    throw new Error(
      `Env Variable: ${prefix} failed to get min number of keys. Found: ${variables.length} Expected: at least ${minLength}`
    );
  }

  return variables;
}

function getEnvironmentVariable(name: string, required = true): string {
  const variable = process.env[name] ?? '';
  if (required && !variable) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return variable;
}

export function getServiceName() {
  return 'nft-transfers';
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export function getDocIdHash({
  chainId,
  collectionAddress,
  tokenId
}: {
  collectionAddress: string;
  tokenId: string;
  chainId: string;
}) {
  const data = chainId.trim() + '::' + trimLowerCase(collectionAddress) + '::' + tokenId.trim();
  return createHash('sha256').update(data).digest('hex').trim().toLowerCase();
}

const mainnetProviders = JSON_RPC_MAINNET_KEYS.map((item) => {
  return new JsonRpcProvider(item);
});

export function getProviderByChainId(chainId: string): JsonRpcProvider {
  let chainIdProviders;
  if (chainId === '1') {
    chainIdProviders = mainnetProviders;
  }
  if (!chainIdProviders || chainIdProviders.length === 0) {
    throw new Error(`Provider not available for chain id: ${chainId}`);
  }
  const provider = randomItem(chainIdProviders);
  return provider;
}
