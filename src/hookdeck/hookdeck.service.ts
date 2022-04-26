import axios, { AxiosInstance } from 'axios';
import { HookdeckConfig } from './hookdeck.types';

export class HookdeckService {
  private readonly client: AxiosInstance;

  constructor(private config: HookdeckConfig, apiKey: string) {
    const baseUrl = `https://api.hookdeck.com/${config.apiVersion}/`;
    const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Basic ${base64ApiKey}`
      }
    });
  }

  async connect(): Promise<{ connected: boolean }> {
    try {
      await this.client.put(`/connections`, {
        name: this.config.connectionName,
        source: {
          name: this.config.sourceName
        },
        destination: {
          name: this.config.destinationName,
          url: 'https://example.com/webhook'
        }
      });
      return { connected: true };
    } catch (err) {
      console.error(err);
      return { connected: false };
    }
  }
}
