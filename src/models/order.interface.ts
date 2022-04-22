export enum OrderType {
  Listing = 'listing',
  Offer = 'offer'
}

export interface Order {
  type: OrderType;
}
