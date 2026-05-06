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
      `Deployment file not found for network "${networkName}". Run 1-deploy-mockusdc.ts first.`
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

  const feeReceiver = process.env.FEE_RECEIVER_ADDRESS || deployer.address;

  const VaultManager = await hre.ethers.getContractFactory("VaultManager");
  const vaultManager = await VaultManager.deploy(
    deployer.address,
    deployment.mockUsdc,
    feeReceiver
  );
  await vaultManager.waitForDeployment();

  deployment.network = networkName;
  deployment.chainId = Number(currentNetwork.chainId);
  deployment.updatedAt = new Date().toISOString();
  deployment.deployer = deployer.address;
  deployment.vaultManager = await vaultManager.getAddress();

  writeDeploymentFile(networkName, deployment);

  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${deployment.chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`Fee receiver: ${feeReceiver}`);
  console.log(`VaultManager: ${deployment.vaultManager}`);
  console.log(`Deployment file: ${getDeploymentFile(networkName)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
