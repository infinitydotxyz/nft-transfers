import { ServiceAccount } from 'firebase-admin';
import { getServiceName } from 'utils';
import { join } from 'path';
import { HookdeckConfig } from 'hookdeck/hookdeck.types';
// todo adi update this for prod
import * as serviceAccountJson from './creds/nftc-dev-firebase.json';

const serviceAccount = serviceAccountJson as ServiceAccount;

const serviceName = getServiceName();
const host = new URL(`https://${serviceName}-dot-${serviceAccountJson.project_id}.ue.r.appspot.com/`);
const transferEndpoint = new URL(join(host.toString(), `/nftTransfer`));

const hookdeckConfig: HookdeckConfig = {
  connectionName: `${serviceName}-${serviceAccountJson.project_id}`,
  sourceName: 'goldsky-transfers',
  destinationName: `${serviceName}-${serviceAccountJson.project_id}`,
  destinationUrl: transferEndpoint.toString(),
  apiVersion: '2022-03-01'
};

const hookdeckConfigV2: HookdeckConfig = {
  connectionName: `${serviceName}-${serviceAccountJson.project_id}`,
  sourceName: 'goldsky-transfers-v2',
  destinationName: `${serviceName}-${serviceAccountJson.project_id}`,
  destinationUrl: transferEndpoint.toString(),
  apiVersion: '2022-03-01'
};

const hookdeckConfigs = [hookdeckConfig, hookdeckConfigV2];

export { serviceAccount, serviceName, transferEndpoint, host, hookdeckConfigs };
