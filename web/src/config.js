// The one place that says which contract the site reads. Switching network is one line here,
// or a build mode: `vite --mode fork` reads deployments/fork.json from the local fork (T-A07).
//   sample   the labelled sample data in mock-data.js (until a contract is deployed)
//   fork     deployments/fork.json, a local anvil fork of BSC mainnet
//   testnet  deployments/testnet.json (T-A03)
//   mainnet  deployments/mainnet.json (T-A05)
const DEFAULT_NETWORK = 'sample'

const RPC = {
  testnet: 'https://bsc-testnet-rpc.publicnode.com',
  mainnet: 'https://bsc-rpc.publicnode.com',
}

const files = import.meta.glob('../../deployments/*.json', { eager: true, import: 'default' })

export function siteConfig() {
  const mode = import.meta.env.MODE
  const network = ['fork', 'testnet', 'mainnet', 'sample'].includes(mode) ? mode : DEFAULT_NETWORK
  if (network === 'sample') return { network }
  const dep = files[`../../deployments/${network}.json`]
  if (!dep?.address) {
    throw new Error(`No deployments/${network}.json with an address. ` +
      (network === 'fork' ? 'Run the fork first: node fork/run.mjs.' : 'The contract is not deployed on this network yet.'))
  }
  if (!Number.isSafeInteger(dep.deployBlock) || dep.deployBlock <= 0) {
    throw new Error(`deployments/${network}.json has no deployBlock. Add the contract's deploy block number so the site does not scan the chain from genesis.`)
  }
  return { network, address: dep.address, deployBlock: dep.deployBlock, rpc: dep.rpc ?? RPC[network] }
}
