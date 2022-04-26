import axios, { AxiosInstance } from 'axios';
import { HookdeckConfig } from './hookdeck.types';
import { exec } from 'child_process';
import * as chalk from 'chalk';
import { sleep } from 'utils';
export class HookdeckService {
  private readonly client: AxiosInstance;

  constructor(private config: HookdeckConfig) {
    const apiKey = process.env.HOOKDECK_API_KEY;
    if (!apiKey) {
      throw new Error('HOOKDECK_API_KEY environment variable is required');
    }
    const baseUrl = `https://api.hookdeck.com/${config.apiVersion}/`;
    const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Basic ${base64ApiKey}`
      }
    });
  }

  async connect(): Promise<{ connected: boolean; isPaused: boolean }> {
    try {
      if (process.env.HOST === 'localhost') {
        const res = await this.startHookdeckCli();
        console.log(chalk.green(`Hookdeck cli started`));
        return res;
      }
      const res = await this.initConnection();
      console.log(chalk.green('Hookdeck connection initialized'));
      return res;
    } catch (err) {
      console.error(err);
      return { connected: false, isPaused: false };
    }
  }

  private startHookdeckCli(): Promise<{ connected: boolean; isPaused: boolean }> {
    const command = `hookdeck listen 8080 ${this.config.sourceName}`;
    console.log(chalk.cyan(`Starting hookdeck cli...`));
    return new Promise((resolve, reject) => {
      let resolved = false;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolved = true;
          reject(error);
        }
        console.log(`[Hookdeck]: ${stdout}`);
        console.log(`[Hookdeck]: ${stderr}`);
      });

      /**
       * give the cli 2 seconds to start up
       */
      sleep(2000)
        .then(() => {
          if (!resolved) {
            resolved = true;
            resolve({ connected: true, isPaused: false });
          }
        })
        .catch(console.error);
    });
  }

  private async initConnection(): Promise<{ connected: boolean; isPaused: boolean }> {
    const res = await this.client.put(`/connections`, {
      name: this.config.connectionName,
      source: {
        name: this.config.sourceName
      },
      destination: {
        name: this.config.destinationName,
        url: this.config.destinationUrl
      }
    });
    const isPaused = res.data.paused_at !== null;
    return { connected: true, isPaused };
  }
}
