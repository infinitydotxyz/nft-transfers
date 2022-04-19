import chalk from 'chalk';
import * as express from 'express';
import { Request } from 'express';
import { GoldskyTransfer, Transfer, TransferEmitter } from 'types';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';

export function server(transferEmitter: TransferEmitter) {
  const app = express();
  app.use(
    express.json({
      // Store the rawBody buffer on the request
      verify: (req: Request, res, buf) => {
        (req as any).rawBody = buf;
      }
    })
  );

  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  app.get('/nftTransfer', (req, res) => {
    // TODO validate signature

    const goldskyTransfer = req.body as GoldskyTransfer;

    const transfer: Transfer = {
      from: trimLowerCase(goldskyTransfer.event.data.new.from),
      to: trimLowerCase(goldskyTransfer.event.data.new.to),
      address: trimLowerCase(goldskyTransfer.event.data.new.contract),
      chainId: '1',
      tokenId: goldskyTransfer.event.data.new.token_id,
      blockNumber: goldskyTransfer.event.data.new.block_number,
      timestamp: goldskyTransfer.event.data.new.timestamp * 1000
    };

    transferEmitter
      .emit('transfer', transfer)
      .then(() => {
        res.sendStatus(200);
      })
      .catch((err) => {
        console.error(err);
        res.sendStatus(500);
      });
  });

  const PORT = process.env.PORT || 8080;

  app.listen(PORT, () => {
    console.log(chalk.green(`nft-transfers listening on port ${PORT}`));
  });
}
