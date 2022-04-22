import { FirestoreOrder, FirestoreOrderItem, OrderStatus } from '../types/firestore-order';
import { initDb } from '../firestore';
import * as serviceAccount from '../creds/nftc-dev-firebase.json';
import { ServiceAccount } from 'firebase-admin';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import * as Emittery from 'emittery';
import { Transfer, TransferEvent, TransferEventType } from 'types/transfer';
import { transferHandler, updateOrdersHandler } from 'transfer-handlers';

const db = initDb(serviceAccount as ServiceAccount);
const id = 'asdfasdf';
const initialOrderStatus = OrderStatus.ValidActive;
const chainId = '1';
const isSellOrder = false;
const orderItem: FirestoreOrderItem = {
  id,
  orderStatus: initialOrderStatus,
  chainId,
  isSellOrder,
  numItems: 1,
  startPriceEth: 1,
  endPriceEth: 1,
  startTimeMs: Date.now(),
  endTimeMs: 0,
  makerUsername: '_____',
  makerAddress: '0x22c3b13EC38cbE06Cf3a4C49c100C65ce830A662'.toLowerCase(),
  takerUsername: '',
  takerAddress: '',
  collection: '0xce25e60a89f200b1fa40f6c313047ffe386992c3'.toLowerCase(),
  collectionName: 'dotdotdots',
  profileImage:
    'https://lh3.googleusercontent.com/2Y14SBzLC9owK2YVmTyMkBnF3wKCtXZaFQQcx01Q1bDNR056hW4-z6VzoGgDm0eKrxbSS9EBKpF_acibXRosvvHOkPMaTsqBB4N-nA=w600',
  tokenId: '2381',
  tokenName: 'dotdotdot 2381',
  imageUrl:
    'https://lh3.googleusercontent.com/2Y14SBzLC9owK2YVmTyMkBnF3wKCtXZaFQQcx01Q1bDNR056hW4-z6VzoGgDm0eKrxbSS9EBKpF_acibXRosvvHOkPMaTsqBB4N-nA=w600',
  numTokens: 1
};

async function createOrder() {
  const orderItems = [orderItem];
  orderItems.forEach((item) => (item.numItems = orderItems.length));

  const first = orderItems[0];
  const order: FirestoreOrder = {
    id: first.id,
    orderStatus: first.orderStatus,
    chainId: first.chainId,
    isSellOrder: first.isSellOrder,
    numItems: orderItems.length,
    startPriceEth: first.startPriceEth,
    endPriceEth: first.endPriceEth,
    startPriceWei: '',
    endPriceWei: '',
    startTimeMs: first.startTimeMs,
    endTimeMs: first.endTimeMs,
    minBpsToSeller: 0,
    nonce: '1',
    complicationAddress: '',
    currencyAddress: '',
    makerUsername: first.makerUsername,
    makerAddress: first.makerAddress,
    takerUsername: first.takerUsername,
    takerAddress: first.takerAddress,
    signedOrder: {} as any
  };

  const orderDoc = db.collection(firestoreConstants.ORDERS_COLL).doc(id);

  const batch = db.batch();

  orderItems.forEach((item) => batch.set(orderDoc.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL).doc(), item));
  batch.set(orderDoc, order);

  await batch.commit();

  console.log(`Created order ${id}`);
}

async function transfer() {
  const transferEmitter = new Emittery<TransferEvent>();

  const log = {
    fn: (transfer: Transfer) => {
      console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
    },
    name: 'logger',
    throwErrorOnFailure: false
  };

  transferHandler(transferEmitter, [log, updateOrdersHandler]);

  const transfer: Transfer = {
    type: TransferEventType.Transfer,
    to: orderItem.makerAddress,
    from: '0x0000000000000000000000000000000000000000',
    address: orderItem.collection,
    chainId: orderItem.chainId,
    tokenId: orderItem.tokenId,
    blockNumber: 1000,
    timestamp: Date.now()
  };

  await transferEmitter.emit('transfer', transfer);
  console.log('complete');
}

void transfer();
