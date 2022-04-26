import { readFile } from 'fs/promises';
import { parse } from 'yaml';

export async function getServiceName() {
  const data = await readFile('./app.yaml', 'utf8');
  const { service } = parse(data);
  if (!service) {
    throw new Error('Could not find service name in app.yaml');
  }
  return service as string;
}
