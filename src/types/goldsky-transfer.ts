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

export interface NewAndOldData<New, Old> {
  new: New;
  old: Old;
}

export type GoldskyTransfer = GoldskyWebhook<NewAndOldData<GoldskyTransferData, GoldskyTransferData>>;
