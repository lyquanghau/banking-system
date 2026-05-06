import fs from "fs";
import path from "path";
const hre = require("hardhat");

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
      `Deployment file not found for network "${networkName}". Run steps 1 and 2 first.`
    );
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentRecord;
}

function writeDeploymentFile(networkName: string, payload: DeploymentRecord) {
  const filePath = getDeploymentFile(networkName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const currentNetwork = await hre.ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const deployment = readDeploymentFile(networkName);

  if (!deployment.mockUsdc) {
    throw new Error("mockUsdc address is missing. Run 1-deploy-mockusdc.ts first.");
  }

  if (!deployment.vaultManager) {
    throw new Error("vaultManager address is missing. Run 2-deploy-vaultmanager.ts first.");
  }

  const SavingCore = await hre.ethers.getContractFactory("SavingCore");
  const savingCore = await SavingCore.deploy(
    deployer.address,
    deployment.mockUsdc,
    deployment.vaultManager
  );
  await savingCore.waitForDeployment();

  const vaultManager = await hre.ethers.getContractAt("VaultManager", deployment.vaultManager);
  await (await vaultManager.setSavingCore(await savingCore.getAddress())).wait();

  deployment.network = networkName;
  deployment.chainId = Number(currentNetwork.chainId);
  deployment.updatedAt = new Date().toISOString();
  deployment.deployer = deployer.address;
  deployment.savingCore = await savingCore.getAddress();

  writeDeploymentFile(networkName, deployment);

  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${deployment.chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`VaultManager: ${deployment.vaultManager}`);
  console.log(`SavingCore: ${deployment.savingCore}`);
  console.log(`VaultManager.savingCore set successfully`);
  console.log(`Deployment file: ${getDeploymentFile(networkName)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
