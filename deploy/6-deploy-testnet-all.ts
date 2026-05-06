import { execSync } from "child_process";

function runStep(label: string, command: string, env: NodeJS.ProcessEnv) {
  console.log(`\n=== ${label} ===`);
  console.log(command);
  execSync(command, {
    stdio: "inherit",
    env
  });
}

async function main() {
  const networkName = process.env.DEPLOY_TARGET_NETWORK || process.argv[2];

  if (!networkName) {
    throw new Error("Provide target network via DEPLOY_TARGET_NETWORK or the first CLI argument.");
  }

  const env = {
    ...process.env,
    DEPLOY_TARGET_NETWORK: networkName
  };

  runStep(
    "Deploy MockUSDC",
    `npx hardhat run deploy/1-deploy-mockusdc.ts --network ${networkName}`,
    env
  );
  runStep(
    "Deploy VaultManager",
    `npx hardhat run deploy/2-deploy-vaultmanager.ts --network ${networkName}`,
    env
  );
  runStep(
    "Deploy SavingCore",
    `npx hardhat run deploy/3-deploy-savingcore.ts --network ${networkName}`,
    env
  );
  runStep(
    "Initialize Testnet State",
    `npx hardhat run deploy/4-init-testnet.ts --network ${networkName}`,
    env
  );
  runStep(
    "Sync Frontend Config",
    `npx hardhat run deploy/5-sync-frontend-config.ts --network ${networkName}`,
    env
  );

  console.log(`\nTestnet deployment flow completed for network: ${networkName}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
