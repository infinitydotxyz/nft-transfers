import { trimLowerCase } from '@infinityxyz/lib/utils';
import { createHash } from 'crypto';

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
