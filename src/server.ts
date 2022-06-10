import * as chalk from 'chalk';
import * as express from 'express';
import { Transfer, TransferEmitter, TransferEventType } from 'types/transfer';
import { GoldskyTransferV2 } from 'types/goldsky-transfer';
import { transferAdapter } from 'transfer-adapter';

export async function server(transferEmitter: TransferEmitter, transferEndpoint: URL): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    const GOLDSKY_AUTH_HEADER = process.env.GOLDSKY_AUTH_HEADER;

    app.use(express.json());

    app.get('/', (req, res) => {
      res.send('Hello World!');
    });

    app.post(`${transferEndpoint.pathname}`, (req, res) => {
      const authHeader = req.headers['gs-webhook-auth'];
      if (authHeader !== GOLDSKY_AUTH_HEADER) {
        res.send(401);
        console.error('Received invalid auth header');
        return;
      }

      const goldskyTransfer = req.body as GoldskyTransferV2;

      const operation = goldskyTransfer.event.op;

      const transferType = operation === 'INSERT' ? TransferEventType.Transfer : TransferEventType.RevertTransfer;

      try {
        let transfer: Transfer;
        if (transferType === TransferEventType.Transfer) {
          transfer = transferAdapter(goldskyTransfer.event.data.new, transferType);
        } else {
          transfer = transferAdapter(goldskyTransfer.event.data.old, transferType);
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
      } catch (err) {
        console.error(err);
        res.sendStatus(500);
      }
    });

    const PORT = process.env.PORT || 8080;

    app.listen(PORT, () => {
      console.log(chalk.green(`nft-transfers listening on port ${PORT}`));
      resolve();
    });
  });
}
