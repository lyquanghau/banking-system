import fs from "fs";
import path from "path";

type DeploymentRecord = {
  network: string;
  chainId: number;
  updatedAt: string;
  deployer?: string;
  mockUsdc?: string;
  vaultManager?: string;
  savingCore?: string;
};

function getDeploymentFile(networkName: string): string {
  return path.join(__dirname, "..", "deployments", `${networkName}.json`);
}

function readDeploymentFile(networkName: string): DeploymentRecord {
  const filePath = getDeploymentFile(networkName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Deployment file not found for network "${networkName}". Run deploy steps first.`
    );
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentRecord;
}

function resolveRpcUrl(networkName: string): string {
  if (networkName === "sepolia") {
    return process.env.SEPOLIA_RPC_URL || "";
  }

  if (networkName === "amoy") {
    return process.env.AMOY_RPC_URL || "";
  }

  if (networkName === "localhost") {
    return "http://127.0.0.1:8545";
  }

  return process.env.RPC_URL || "";
}

async function main() {
  const networkName = process.env.DEPLOY_TARGET_NETWORK || process.argv[2];
  if (!networkName) {
    throw new Error("Provide network name as DEPLOY_TARGET_NETWORK or as the first CLI argument.");
  }

  const deployment = readDeploymentFile(networkName);
  if (!deployment.mockUsdc || !deployment.vaultManager || !deployment.savingCore) {
    throw new Error("Deployment file is incomplete. Run deploy steps 1-3 first.");
  }

  const rpcUrl = resolveRpcUrl(networkName);
  const frontendConfigPath = path.join(__dirname, "..", "frontend", "src", "config.js");

  const configContents = `export const CONTRACTS = {
  token: "${deployment.mockUsdc}",
  vault: "${deployment.vaultManager}",
  core: "${deployment.savingCore}"
};

export const DEMO_ACCOUNTS = {
  admin: "",
  feeReceiver: "",
  alice: "",
  bob: ""
};

export const LOCAL_NETWORK = {
  chainId: ${deployment.chainId},
  rpcUrl: "${rpcUrl}"
};

export const AUTO_RENEW_GRACE_PERIOD_DAYS = 3;
export const USDC_DECIMALS = 6;
`;

  fs.writeFileSync(frontendConfigPath, configContents);

  console.log(`Updated frontend config for network: ${networkName}`);
  console.log(`Config file: ${frontendConfigPath}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`VaultManager: ${deployment.vaultManager}`);
  console.log(`SavingCore: ${deployment.savingCore}`);
  console.log(`Chain ID: ${deployment.chainId}`);
  console.log(`RPC URL: ${rpcUrl || "(empty)"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
