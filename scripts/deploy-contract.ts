#!/usr/bin/env ts-node
/**
 * Deploy the Lumigift escrow contract to Stellar Testnet or Mainnet.
 *
 * Usage:
 *   STELLAR_NETWORK=testnet ts-node scripts/deploy-contract.ts
 *   STELLAR_NETWORK=mainnet ts-node scripts/deploy-contract.ts
 *
 * For mainnet the deployer secret key is fetched from AWS Secrets Manager
 * (secret name: LUMIGIFT_MAINNET_DEPLOYER_KEY). The env var
 * STELLAR_SERVER_SECRET_KEY is used as a fallback for testnet / local runs.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const network = process.env.STELLAR_NETWORK ?? "testnet";
const isMainnet = network === "mainnet";

const rpcUrl = isMainnet
  ? "https://soroban-rpc.stellar.org"
  : "https://soroban-testnet.stellar.org";

const networkPassphrase = isMainnet
  ? "Public Global Stellar Network ; September 2015"
  : "Test SDF Network ; September 2015";

const wasmPath = path.resolve(
  __dirname,
  "../contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"
);

if (!fs.existsSync(wasmPath)) {
  console.error("WASM not found. Run `npm run contract:build` first.");
  process.exit(1);
}

/** Fetch the deployer secret key from AWS Secrets Manager (mainnet only). */
async function fetchSecretFromAWS(secretName: string): Promise<string> {
  // Lazy-require so the AWS SDK is only needed at runtime on mainnet.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {
    SecretsManagerClient,
    GetSecretValueCommand,
  } = require("@aws-sdk/client-secrets-manager");

  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  const raw: string = response.SecretString ?? "";
  // Support both plain-string secrets and JSON objects like {"key":"S..."}
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.key ?? parsed.secret ?? Object.values(parsed)[0];
  } catch {
    return raw.trim();
  }
}

/** Persist a deployment record to deployments/<network>.json. */
function saveDeploymentRecord(contractId: string, txHash: string): void {
  const dir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${network}.json`);
  const existing: object[] = fs.existsSync(filePath)
    ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as object[])
    : [];

  existing.push({
    contractId,
    txHash,
    deployedAt: new Date().toISOString(),
    network,
  });

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`📄 Deployment record saved to deployments/${network}.json`);
}

async function main(): Promise<void> {
  let secretKey: string;

  if (isMainnet) {
    const secretName =
      process.env.LUMIGIFT_SECRET_NAME ?? "LUMIGIFT_MAINNET_DEPLOYER_KEY";
    console.log(`🔐 Fetching deployer key from AWS Secrets Manager (${secretName})…`);
    secretKey = await fetchSecretFromAWS(secretName);
  } else {
    secretKey = process.env.STELLAR_SERVER_SECRET_KEY ?? "";
    if (!secretKey) {
      console.error(
        "Missing required environment variable: STELLAR_SERVER_SECRET_KEY"
      );
      process.exit(1);
    }
  }

  if (!/^S[A-Z2-7]{55}$/.test(secretKey)) {
    console.error(
      "Deployer key does not match expected Stellar secret key format."
    );
    process.exit(1);
  }

  console.log(`🚀 Deploying to ${network}…`);

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
    console.error("Deployment failed:", result.stderr || result.error?.message);
    process.exit(1);
  }

  const contractId = result.stdout.trim();
  // The Stellar CLI prints the contract ID on stdout; the tx hash appears in
  // stderr diagnostic output. Extract it with a best-effort regex.
  const txHashMatch = result.stderr?.match(/[0-9a-fA-F]{64}/);
  const txHash = txHashMatch ? txHashMatch[0] : "unknown";

  console.log(`✅ Contract deployed: ${contractId}`);
  console.log(`   Tx hash: ${txHash}`);

  saveDeploymentRecord(contractId, txHash);

  if (!isMainnet) {
    console.log(`Add to .env: STELLAR_ESCROW_CONTRACT_ID=${contractId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
