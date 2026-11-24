#!/usr/bin/env node
// Kodo skill helper (T-C01). It reads the chain and builds calldata. It never signs, never sends
// and never confirms anything: the agent previews the call with Agentic Wallet and the user decides.
//
//   node pulse.mjs prepare --from <wallet> --p10 <bps> --p50 <bps> --p90 <bps>
//       Reveals today's forecast if this machine holds its salt, commits tomorrow's with a fresh
//       salt saved locally first, and prints the submit() calldata plus the preview command.
//   node pulse.mjs status [--from <wallet>]
//       One line: today's crowd band, yesterday's result, your skill and streak.
//
// Numbers are basis points of BNB's % change over the UTC day (100 bps = 1%).
// Options for testing: --rpc <url> --contract <address>. The salt store is ~/.human-pulse/state.json
// (or $PULSE_STATE). Losing it only means that one forecast cannot be revealed.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, isAddress, keccak256, parseAbi } from 'viem'

// The live contract (deployments/mainnet.json, T-A05). A redeploy changes this one line.
export const NETWORK = { chainId: 56, rpc: 'https://bsc-rpc.publicnode.com', contract: '0xa6EE7846434C385847B4e79EF529531a1124FfF6' }
export const MAX_BPS = 5000
const CUTOFF_S = 600 // no prepare in the last 10 minutes of the UTC day: a tx landing after 00:00 would not match
const ZERO = `0x${'00'.repeat(32)}`
const DISCLAIMER = 'Forecasting signal only. Not financial advice.'

export const PULSE_ABI = parseAbi([
  'function submit(bytes32 nextCommit, bool hasReveal, int32 p10, int32 p50, int32 p90, bytes32 salt)',
  'function today() view returns (uint64)',
  'function startDay() view returns (uint64)',
  'function agentId() view returns (address)',
  'function forecastOf(address voter, uint64 day) view returns ((bytes32 hash, int32 p10, int32 p50, int32 p90, bool revealed, bool scored))',
  'function stats(address voter) view returns ((uint32 daysCommitted, uint32 daysScored, uint32 missedReveals, uint32 daysInBand, uint32 beatStreak, uint64 lastScoredDay, uint128 totalLoss, uint128 totalBaselineLoss))',
  'function crowdBand(uint64 day) view returns (int32 p10, int32 p50, int32 p90, uint32 n)',
  'function dayInfo(uint64 day) view returns ((uint8 status, int32 changeBps, uint32 sigmaBps, uint32 reveals, int256 openPrice, int256 closePrice, uint256 crowdLoss, uint256 baselineLoss))',
])
const AGENT_ID_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)'])

/* ------------------------------------------------------------------ pure parts (tested) */

/** keccak256(abi.encode(voter, day, p10, p50, p90, salt)), as PulseForecast.commitHash(). */
export function commitHash(voter, day, p10, p50, p90, salt) {
  return keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint64' }, { type: 'int32' }, { type: 'int32' }, { type: 'int32' }, { type: 'bytes32' }],
    [getAddress(voter.toLowerCase()), BigInt(day), p10, p50, p90, salt]))
}

/** A whole number of bps. A percent passed by mistake is refused with the corrected value. */
export function parseBps(raw, name) {
  const s = String(raw ?? '').trim()
  if (/^[+-]?\d{1,6}$/.test(s)) return Number(s)
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+%|\d*\.\d+%)$/.test(s)) {
    const v = s.replace('%', '')
    throw new Error(`--${name} ${s} is not a whole number of bps. 1% is 100 bps, so ${v}% is --${name} ${Math.round(parseFloat(v) * 100)}.`)
  }
  throw new Error(`--${name} needs a whole number of basis points, for example --${name} -320 for -3.20%. Got "${s}".`)
}

/** [p10, p50, p90] with the contract's own checks, so a bad forecast fails here, not on chain. */
export function readForecast({ p10, p50, p90 }) {
  const p = [parseBps(p10, 'p10'), parseBps(p50, 'p50'), parseBps(p90, 'p90')]
  if (!(p[0] <= p[1] && p[1] <= p[2])) throw new Error(`The forecast must have p10 <= p50 <= p90; got ${p.join(', ')}. Reorder the numbers.`)
  if (p.some((x) => x < -MAX_BPS || x > MAX_BPS)) throw new Error(`Each number must be within -${MAX_BPS} and +${MAX_BPS} bps (+-50%); got ${p.join(', ')}.`)
  return p
}

/** submit(nextCommit, hasReveal, p10, p50, p90, salt) calldata. Either part may be absent. */
export function buildSubmit({ nextCommit, reveal }) {
  const [p10, p50, p90] = reveal ? reveal.p : [0, 0, 0]
  return encodeFunctionData({ abi: PULSE_ABI, functionName: 'submit', args: [nextCommit ?? ZERO, !!reveal, p10, p50, p90, reveal ? reveal.salt : ZERO] })
}

/** The saved forecast whose hash is the one on chain, or null. Several prepares may exist for one day. */
export function pickReveal(entries, voter, day, onchainHash) {
  return entries.find((e) => commitHash(voter, day, ...e.p, e.salt) === onchainHash) ?? null
}

export const dayLabel = (d) => new Date(Number(d) * 86400000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
const pct = (bps) => `${bps > 0 ? '+' : bps < 0 ? '-' : ''}${(Math.abs(bps) / 100).toFixed(2)}%`
const band = (p) => `${pct(p[0])} / ${pct(p[1])} / ${pct(p[2])}`

/* ------------------------------------------------------------------ local salt store */

const statePath = () => process.env.PULSE_STATE || join(homedir(), '.human-pulse', 'state.json')
const stateKey = (contract, voter, day) => `${NETWORK.chainId}:${contract.toLowerCase()}:${voter.toLowerCase()}:${day}`

function loadState() {
  let text
  try { text = readFileSync(statePath(), 'utf8') } catch (e) { if (e.code === 'ENOENT') return { version: 1, entries: {} }; throw e }
  try {
    const s = JSON.parse(text)
    if (s && typeof s.entries === 'object') return s
  } catch {}
  throw new Error(`${statePath()} is not a valid Kodo state file. It holds your salts, so do not delete it: move it aside or fix it, then run again.`)
}

function saveState(state) {
  const p = statePath()
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  writeFileSync(`${p}.tmp`, JSON.stringify(state, null, 1), { mode: 0o600 })
  renameSync(`${p}.tmp`, p)
}

/* ------------------------------------------------------------------ chain */

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    const eq = a.indexOf('=')
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length) out[a.slice(2)] = argv[++i] // values may start with '-': --p10 -320
    else throw new Error(`${a} needs a value, for example ${a} -320. Add it and run again.`)
  }
  return out
}

async function connect(args) {
  const contract = args.contract ?? NETWORK.contract
  if (!isAddress(contract, { strict: false })) throw new Error(`--contract ${contract} is not an address. Leave --contract out to use the live Kodo contract.`)
  const client = createPublicClient({ transport: http(args.rpc ?? NETWORK.rpc, { retryCount: 2, timeout: 15000 }) })
  const chainId = await client.getChainId()
  if (chainId !== NETWORK.chainId) throw new Error(`The RPC is on chain ${chainId}, not BNB Smart Chain (${NETWORK.chainId}). Pass a BSC mainnet RPC with --rpc.`)
  if (!(await client.getCode({ address: contract }))) throw new Error(`No contract at ${contract} on this RPC. Check --contract, or update the skill.`)
  const read = (functionName, a = []) => client.readContract({ address: contract, abi: PULSE_ABI, functionName, args: a })
  return { client, contract: getAddress(contract), read }
}

function wallet(args) {
  if (!args.from) throw new Error('--from is required: your Agentic Wallet address on BSC (baw wallet address --json, the entry with binanceChainId "56").')
  // a mixed-case address must carry a valid checksum, so a typo'd digit is caught here
  if (!isAddress(args.from, { strict: args.from !== args.from.toLowerCase() })) throw new Error(`--from ${args.from} is not a valid address (wrong length or checksum). Copy it again from baw wallet address --json.`)
  return getAddress(args.from.toLowerCase())
}

async function prepare(args) {
  const from = wallet(args)
  const p = readForecast(args)
  const { client, contract, read } = await connect(args)
  const block = await client.getBlock()
  const left = 86400 - Number(block.timestamp % 86400n)
  if (left < CUTOFF_S) throw new Error(`The UTC day ends in ${Math.ceil(left / 60)} min, and a transaction that lands after 00:00 UTC would not match this forecast. Wait until 00:00 UTC, then run prepare again.`)
  const today = await read('today')
  const tomorrow = today + 1n
  const [now, next] = await Promise.all([read('forecastOf', [from, today]), read('forecastOf', [from, tomorrow])])

  const state = loadState()
  const warnings = []
  let reveal = null
  if (now.hash !== ZERO && !now.revealed) {
    reveal = pickReveal(state.entries[stateKey(contract, from, today)] ?? [], from, today, now.hash)
    if (!reveal) warnings.push(`Your forecast for today (${dayLabel(today)}) cannot be revealed: its salt is not in ${statePath()} on this machine. It will count as a missed reveal (2x the baseline loss).`)
  }
  const commit = next.hash === ZERO
  if (!commit) warnings.push(`You already committed for ${dayLabel(tomorrow)}, and a commit cannot be changed. The numbers you gave now are not used.`)
  if (!commit && !reveal) {
    throw new Error(`Nothing to send. You already committed for ${dayLabel(tomorrow)}` +
      (now.revealed ? ` and revealed today's forecast.` : now.hash === ZERO ? '.' : ', and today\'s forecast cannot be revealed from this machine.') +
      ' Run prepare again after 00:00 UTC to reveal it and commit the next one.')
  }
  if (commit) {
    const agentId = await read('agentId')
    const held = await client.readContract({ address: agentId, abi: AGENT_ID_ABI, functionName: 'balanceOf', args: [from] })
    if (held === 0n) throw new Error(`${from} holds no Agent ID, and the contract only accepts forecasts from Agent ID holders. Claim one in the Binance App (Agentic Wallet), then try again.`)
  }

  let nextCommit
  if (commit) {
    const salt = `0x${randomBytes(32).toString('hex')}`
    nextCommit = commitHash(from, tomorrow, ...p, salt)
    // saved before the calldata is shown: whatever is sent, its salt is already on disk
    // re-read just before writing so a parallel prepare's salt is kept, not overwritten
    const fresh = loadState()
    const k = stateKey(contract, from, tomorrow)
    fresh.entries[k] = [...(fresh.entries[k] ?? []), { p, salt, savedAt: new Date().toISOString() }]
    for (const key of Object.keys(fresh.entries)) if (BigInt(key.split(':').pop()) < today - 7n) delete fresh.entries[key]
    saveState(fresh)
  }
  const data = buildSubmit({ nextCommit, reveal })
  const parts = [reveal && `reveals your forecast for today, ${dayLabel(today)} (${band(reveal.p)})`, commit && `locks ${band(p)} for ${dayLabel(tomorrow)}`].filter(Boolean)
  return {
    ok: true,
    summary: `This transaction ${parts.join(' and ')}. It sends no BNB and no tokens.`,
    chainId: NETWORK.chainId, from, to: contract, value: '0', data,
    reveal: reveal && { day: dayLabel(today), p10: reveal.p[0], p50: reveal.p[1], p90: reveal.p[2] },
    commit: commit ? { day: dayLabel(tomorrow), p10: p[0], p50: p[1], p90: p[2] } : null,
    // the calldata is only valid on the UTC day it was prepared: a commit landing later can never be revealed
    sendBefore: new Date(Number(today + 1n) * 86400000).toISOString(),
    previewCommand: `baw contract-call preview --binanceChainId ${NETWORK.chainId} --from ${from} --to ${contract} --value 0 --inputData ${data} --json`,
    warnings,
    note: `Preview this, show the user the preview, and execute only after the user says yes, before ${new Date(Number(today + 1n) * 86400000).toISOString()}. After that, run prepare again. ${DISCLAIMER}`,
  }
}

async function status(args) {
  const from = args.from ? wallet(args) : null
  const { read } = await connect(args)
  const today = await read('today')
  const [crowd, start, y] = await Promise.all([read('crowdBand', [today]), read('startDay'), read('dayInfo', [today - 1n])])
  const bits = [`Kodo, ${dayLabel(today)}: crowd ${crowd[3] > 0 ? `${pct(crowd[0])} to ${pct(crowd[2])}, middle ${pct(crowd[1])}, ${crowd[3]} revealed` : 'no reveals yet today'}`]
  if (today - 1n >= start) {
    bits.push(y.status === 1 ? `yesterday BNB ${pct(y.changeBps)}, ${y.crowdLoss < y.baselineLoss ? 'the crowd beat the baseline' : 'the baseline beat the crowd'}`
      : y.status === 2 ? 'yesterday void (stale price, nobody scored)' : 'yesterday not settled yet')
  }
  if (from) {
    const [s, next] = await Promise.all([read('stats', [from]), read('forecastOf', [from, today + 1n])])
    const skill = s.daysScored > 0 ? (Number(s.totalBaselineLoss) - Number(s.totalLoss)) / 10 / s.daysScored : null
    bits.push(`you ${skill === null ? 'have no scored days yet' : `${skill >= 0 ? '+' : ''}${skill.toFixed(1)} bps a day against the baseline over ${s.daysScored} days, streak ${s.beatStreak}`}` +
      (s.missedReveals > 0 ? `, ${s.missedReveals} missed reveals` : '') +
      `, ${next.hash !== ZERO ? 'tomorrow locked' : 'nothing locked for tomorrow'}`)
  }
  return `${bits.join('; ')}. ${DISCLAIMER}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  if (cmd === 'prepare') console.log(JSON.stringify(await prepare(args), null, 2))
  else if (cmd === 'status') console.log(await status(args))
  else throw new Error('Usage: node pulse.mjs prepare --from <wallet> --p10 <bps> --p50 <bps> --p90 <bps>, or node pulse.mjs status [--from <wallet>].')
}

const self = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href } catch { return '' } })()
if (import.meta.url === self) {
  main().catch((e) => {
    const rpc = e.shortMessage && /HTTP|fetch|timed out|network/i.test(e.shortMessage + e.details)
    console.error(`pulse: ${rpc ? `Could not reach BNB Smart Chain (${e.shortMessage}). Check the connection, or pass another BSC RPC with --rpc.` : e.shortMessage ?? e.message}`)
    process.exit(1)
  })
}
