import { TokenStandard } from '@infinityxyz/lib/types/core';

export interface UserOwnedCollection {
  chainId: string;
  address: string;
  slug: string;
  name: string;
  description: string;
  symbol: string;
  profileImage: string;
  bannerImage: string;
  displayType: string;
  hasBlueCheck: boolean;
  tokenStandard: TokenStandard;
  numCollectionNftsOwned: number;
}
