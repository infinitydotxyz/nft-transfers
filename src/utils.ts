import { readFileSync } from 'fs';
import { parse } from 'yaml';

export function getServiceName() {
  const data = readFileSync('./app.yaml', 'utf8');
  const { service } = parse(data);
  if (!service) {
    throw new Error('Could not find service name in app.yaml');
  }
  return service as string;
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
