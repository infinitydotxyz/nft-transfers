import axios from 'axios';
import * as chalk from 'chalk';
import { host } from 'config';

/**
 * we must ping the service once started so that the
 * hookdeck service gets connected and beings sending
 * events to the correct endpoint
 */
async function ping() {
  try {
    const res = await axios.get(host.toString());
    if (res.status === 200) {
      console.log(chalk.green(`Service started`));
    }
  } catch (err) {
    console.log(chalk.red(`Failed to ping service`));
    console.error(err);
  }
}

void ping();
