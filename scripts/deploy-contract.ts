#!/usr/bin/env ts-node
/**
 * Deploy the Lumigift escrow contract to Stellar Testnet or Mainnet.
 * Idempotent: if STELLAR_ESCROW_CONTRACT_ID is already set in the environment
 * (or in a local .env.local file), the script skips deployment and exits 0.
 *
 * Usage:
 *   STELLAR_NETWORK=testnet ts-node scripts/deploy-contract.ts
 *
 * To force a fresh deployment, unset STELLAR_ESCROW_CONTRACT_ID first.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const network = process.env.STELLAR_NETWORK ?? "testnet";
const rpcUrl =
  network === "mainnet"
    ? "https://soroban-rpc.stellar.org"
    : "https://soroban-testnet.stellar.org";
const networkPassphrase =
  network === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

const wasmPath = path.resolve(
  __dirname,
  "../contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"
);
const envLocalPath = path.resolve(__dirname, "../.env.local");

// ─── Idempotency check ────────────────────────────────────────────────────────

function readEnvLocal(): Record<string, string> {
  if (!fs.existsSync(envLocalPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envLocalPath, "utf-8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

function writeContractIdToEnvLocal(contractId: string): void {
  const key = "STELLAR_ESCROW_CONTRACT_ID";
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, "utf-8");
    if (content.includes(`${key}=`)) {
      fs.writeFileSync(
        envLocalPath,
        content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${contractId}`)
      );
      return;
    }
  }
  fs.appendFileSync(envLocalPath, `\n${key}=${contractId}\n`);
}

const envLocal = readEnvLocal();
const existingContractId =
  process.env.STELLAR_ESCROW_CONTRACT_ID ?? envLocal["STELLAR_ESCROW_CONTRACT_ID"];

if (existingContractId && existingContractId !== "replace_with_deployed_contract_id") {
  console.log(`✅ Contract already deployed: ${existingContractId}`);
  console.log("   To redeploy, unset STELLAR_ESCROW_CONTRACT_ID and re-run.");
  process.exit(0);
}

// ─── Pre-flight checks ────────────────────────────────────────────────────────

if (!fs.existsSync(wasmPath)) {
  console.error("❌ WASM not found. Run `npm run contract:build` first.");
  process.exit(1);
}

const secretKey = process.env.STELLAR_SERVER_SECRET_KEY;
if (!secretKey) {
  console.error("❌ Missing required environment variable: STELLAR_SERVER_SECRET_KEY");
  process.exit(1);
}

if (!/^S[A-Z2-7]{55}$/.test(secretKey)) {
  console.error("❌ STELLAR_SERVER_SECRET_KEY does not match expected Stellar secret key format.");
  process.exit(1);
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

console.log(`🚀 Deploying escrow contract to ${network}…`);

const result = spawnSync(
  "stellar",
  [
    "contract",
    "deploy",
    "--wasm",
    wasmPath,
    "--source",
    secretKey,
    "--rpc-url",
    rpcUrl,
    "--network-passphrase",
    networkPassphrase,
  ],
  { encoding: "utf-8", shell: false }
);

if (result.error || result.status !== 0) {
  console.error("❌ Deployment failed:", result.stderr || result.error?.message);
  process.exit(1);
}

const contractId = result.stdout.trim();
console.log(`✅ Contract deployed: ${contractId}`);
console.log(`   Network:    ${network}`);
console.log(`   RPC URL:    ${rpcUrl}`);
console.log(`   Explorer:   https://stellar.expert/explorer/testnet/contract/${contractId}`);

writeContractIdToEnvLocal(contractId);
console.log(`   Saved STELLAR_ESCROW_CONTRACT_ID to .env.local`);
