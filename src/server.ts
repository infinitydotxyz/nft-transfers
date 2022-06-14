import * as chalk from 'chalk';
import * as express from 'express';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { Transfer, TransferEmitter, TransferEventType } from 'types/transfer';
import { GoldskyTransfer } from 'types/goldsky-transfer';
import { ChainId } from '@infinityxyz/lib/types/core';

export function server(transferEmitter: TransferEmitter): void {
  const app = express();
  const GOLDSKY_AUTH_HEADER = process.env.GOLDSKY_AUTH_HEADER;

  app.use(express.json());

  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  app.post('/nftTransfer', (req, res) => {
    const authHeader = req.headers['gs-webhook-auth'];
    if (authHeader !== GOLDSKY_AUTH_HEADER) {
      res.send(401);
      console.error('Received invalid auth header');
      return;
    }

    const goldskyTransfer = req.body as GoldskyTransfer;

    const operation = goldskyTransfer.event.op;

    const transferType = operation === 'INSERT' ? TransferEventType.Transfer : TransferEventType.RevertTransfer;

    let transfer: Transfer;
    if (transferType === TransferEventType.Transfer) {
      transfer = {
        txHash: goldskyTransfer.event.data.new.id,
        from: trimLowerCase(goldskyTransfer.event.data.new.from),
        to: trimLowerCase(goldskyTransfer.event.data.new.to),
        address: trimLowerCase(goldskyTransfer.event.data.new.contract),
        chainId: ChainId.Mainnet,
        tokenId: goldskyTransfer.event.data.new.token_id,
        tokenStandard: goldskyTransfer.event.data.new.type,
        blockNumber: goldskyTransfer.event.data.new.block_number,
        timestamp: goldskyTransfer.event.data.new.timestamp * 1000,
        type: transferType
      };
    } else {
      transfer = {
        txHash: goldskyTransfer.event.data.old.id,
        from: trimLowerCase(goldskyTransfer.event.data.old.from),
        to: trimLowerCase(goldskyTransfer.event.data.old.to),
        address: trimLowerCase(goldskyTransfer.event.data.old.contract),
        chainId: ChainId.Mainnet,
        tokenId: goldskyTransfer.event.data.old.token_id,
        tokenStandard: goldskyTransfer.event.data.old.type,
        blockNumber: goldskyTransfer.event.data.old.block_number,
        timestamp: goldskyTransfer.event.data.old.timestamp * 1000,
        type: transferType
      };
    }

    transferEmitter
      .emit('transfer', transfer)
      .then(() => {
        res.sendStatus(200);
      })
      .catch((err: any) => {
        console.error(err);
        res.sendStatus(500);
      });
  });

  const PORT = process.env.PORT || 8080;

  app.listen(PORT, () => {
    console.log(chalk.green(`nft-transfers listening on port ${PORT}`));
  });
}
