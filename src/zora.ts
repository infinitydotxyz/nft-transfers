import { gql, GraphQLClient } from 'graphql-request';
import { ZoraSingleTokenResponse } from '@infinityxyz/lib/types/services/zora/tokens';

const ZORA_API_ENDPOINT = 'https://api.zora.co/graphql';
const zoraClient = new GraphQLClient(ZORA_API_ENDPOINT, {
  headers: {
    'X-API-KEY': process.env.ZORA_API_KEY ?? ''
  }
});

export async function fetchTokenFromZora(
  chainId: string,
  collectionAddress: string,
  tokenId: string
): Promise<ZoraSingleTokenResponse> {
  console.log('Fetching zora data for', collectionAddress, 'tokenId', tokenId);
  const query = gql`
    query TokenQuery {
      token(token: { address: "0x726719d0b5d62bde627372d449c23dac8661d523", tokenId: "6560" }) {
        token {
          collectionName
          owner
          tokenId
          name
          description
          tokenUrl
          tokenUrlMimeType
          attributes {
            displayType
            traitType
            value
          }
          mintInfo {
            mintContext {
              blockNumber
              blockTimestamp
              transactionHash
            }
            price {
              chainTokenPrice {
                currency {
                  address
                  decimals
                  name
                }
                decimal
              }
            }
            toAddress
            originatorAddress
          }
          content {
            mediaEncoding {
              ... on ImageEncodingTypes {
                large
                poster
                original
                thumbnail
              }
              ... on VideoEncodingTypes {
                large
                poster
                original
                preview
                thumbnail
              }
              ... on AudioEncodingTypes {
                large
                original
              }
            }
            mimeType
            size
            url
          }
          image {
            url
            mediaEncoding {
              ... on ImageEncodingTypes {
                large
                poster
                original
                thumbnail
              }
              ... on VideoEncodingTypes {
                large
                poster
                original
                preview
                thumbnail
              }
              ... on AudioEncodingTypes {
                large
                original
              }
            }
            mimeType
            size
          }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const data = (await zoraClient.request(query)) as ZoraSingleTokenResponse;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return data;
}
