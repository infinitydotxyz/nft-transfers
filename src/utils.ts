export function getServiceName() {
  return 'nft-transfers';
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
