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
    return {
      network: networkName,
      chainId: 0,
      updatedAt: new Date(0).toISOString()
    };
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

  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy(deployer.address);
  await mockUsdc.waitForDeployment();

  const deployment = readDeploymentFile(networkName);
  deployment.network = networkName;
  deployment.chainId = Number(currentNetwork.chainId);
  deployment.updatedAt = new Date().toISOString();
  deployment.deployer = deployer.address;
  deployment.mockUsdc = await mockUsdc.getAddress();

  writeDeploymentFile(networkName, deployment);

  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${deployment.chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`Deployment file: ${getDeploymentFile(networkName)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
