import axios, { AxiosInstance } from 'axios';
import { HookdeckConfig } from './hookdeck.types';

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
      const res = await this.client.put(`/connections`, {
        name: this.config.connectionName,
        source: {
          name: this.config.sourceName
        },
        destination: {
          name: this.config.destinationName,
          url: 'https://example.com/webhook'
        }
      });
      const isPaused = res.data.paused_at !== null;
      return { connected: true, isPaused };
    } catch (err) {
      console.error(err);
      return { connected: false, isPaused: false };
    }
  }
}
