import { createAlchemyWeb3 } from '@alch/alchemy-web3';
import Emittery from 'emittery';
import { erc721TransferLogAdapter } from 'transfer-adapter';
import { feedHandler, transferHandler, updateOrdersHandler, updateOwnershipHandler } from 'transfer-handlers';
import { Transfer, TransferEvent, TransferEventType, TransferLog } from 'types/transfer';
import Web3 from 'web3';

// Using WebSockets
const alchemyWeb3 = createAlchemyWeb3(`wss://eth-mainnet.ws.alchemyapi.io/ws/${process.env.ALCHEMY_API_KEY}`);
const quickNodeWeb3 = new Web3(`wss://dark-frosty-dawn.quiknode.pro/${process.env.QUICK_NODE_KEY}/`);
const useAlchemyWeb3 = process.env.USE_ALCHEMY_WEB3 === 'true';

const log = {
  fn: (transfer: Transfer) => {
    console.log(`Received Transfer: ${transfer.type} ${transfer.address} ${transfer.tokenId}`);
  },
  name: 'logger',
  throwErrorOnFailure: false
};

const transferEmitter = new Emittery<TransferEvent>();

function main() {
  initTransferListener();
  transferHandler(transferEmitter, [log, updateOrdersHandler, updateOwnershipHandler, feedHandler]);
}

function initTransferListener() {
  // also matches ERC20 transfer topic but the third indexed topic log won't be empty for ERC721s
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  // filters on all transfer logs
  const transferFilter = { topics: [transferTopic] };
  // init subscription
  if (useAlchemyWeb3) {
    console.log(
      '============================================ Using Alchemy Web3 ==============================================='
    );
    alchemyWeb3.eth.subscribe('logs', transferFilter).on('data', handleTransferLog);
  } else {
    console.log(
      '============================================ Using Quick Node Web3 ==============================================='
    );
    quickNodeWeb3.eth.subscribe('logs', transferFilter).on('data', handleTransferLog);
  }
}

function handleTransferLog(data: any) {
  const transferLog = data as TransferLog;
  const isERC721Transfer = transferLog.topics.length === 4 && transferLog.topics[3];
  if (isERC721Transfer) {
    const transferEventType = transferLog.removed ? TransferEventType.RevertTransfer : TransferEventType.Transfer;
    try {
      const transfer = erc721TransferLogAdapter(transferLog, transferEventType);
      transferEmitter.emit('transfer', transfer).catch((err: any) => {
        console.error(err);
      });
    } catch (err) {
      console.error(err);
    }
  }
}

void main();
