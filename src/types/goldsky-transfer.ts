export enum WebhookOperation {
  Insert = 'INSERT',
  Update = 'UPDATE',
  Delete = 'DELETE'
}

export interface GoldskyDeliveryInfo {
  max_retries: number;
  current_retry: number;
}

export interface GoldskyWebhookEvent<Data> {
  session_variables: unknown;
  op: WebhookOperation;
  data: Data;
}

export interface GoldskyWebhookTrigger {
  name: string;
}

export interface GoldskyWebhook<Data> {
  event: GoldskyWebhookEvent<Data>;
  created_at: string;
  id: string;
  delivery_info: GoldskyDeliveryInfo;
  trigger: GoldskyWebhookTrigger;
}

export interface GoldskyTransferData {
  to: string;
  from: string;
  /**
   * contract address
   */
  contract: string;
  id: string;
  block_number: number;
  vid: number;
  /**
   * timestamp in epoch seconds
   */
  timestamp: number;
  /**
   * range like: "[14580733,)",
   */
  block_range: string;
  token_id: string;
}

export interface GoldskyTransferDataV2 {
  to: string;
  from: string;
  _gs_chain: 'mainnet' | string;
  transaction_hash: string;
  id: string;
  // "14923743"
  block_number: string;
  /**
   * contract address
   */
  contract_id: string;
  /**
   * contract type "721"
   */
  type: '721' | string;
  vid: string;
  /**
   * timestamp in epoch seconds as a string
   */
  timestamp: string;
  _gs_gid: string;
  token_id: string;
}

export interface NewAndOldData<New, Old> {
  new: New;
  old: Old;
}

export type GoldskyTransfer = GoldskyWebhook<NewAndOldData<GoldskyTransferData, GoldskyTransferData>>;

export type GoldskyTransferV2 = GoldskyWebhook<NewAndOldData<GoldskyTransferDataV2, GoldskyTransferDataV2>>;
