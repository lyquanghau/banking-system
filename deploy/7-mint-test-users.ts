import fs from "fs";
import path from "path";
const hre = require("hardhat");

type DeploymentRecord = {
  mockUsdc?: string;
};

const USDC_DECIMALS = 6n;
const UNIT = 10n ** USDC_DECIMALS;

function usdc(amount: number): bigint {
  return BigInt(amount) * UNIT;
}

function getDeploymentFile(networkName: string): string {
  return path.join(__dirname, "..", "deployments", `${networkName}.json`);
}

function readDeploymentFile(networkName: string): DeploymentRecord {
  const filePath = getDeploymentFile(networkName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Deployment file not found for network "${networkName}". Deploy contracts first.`
    );
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentRecord;
}

function parseRecipients(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;
  const deployment = readDeploymentFile(networkName);

  if (!deployment.mockUsdc) {
    throw new Error("MockUSDC address not found in deployment file.");
  }

  const recipients = parseRecipients(process.env.USER_MINT_ADDRESSES);
  if (recipients.length === 0) {
    throw new Error("USER_MINT_ADDRESSES is empty. Provide one or more addresses in .env.");
  }

  const mintAmount = Number(process.env.USER_MINT_AMOUNT || "50000");
  const mintUnits = usdc(mintAmount);
  const mockUsdc = await hre.ethers.getContractAt("MockUSDC", deployment.mockUsdc);

  console.log(`Network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`Mint amount per user: ${mintAmount} mUSDC\n`);

  for (const recipient of recipients) {
    await (await mockUsdc.mint(recipient, mintUnits)).wait();
    console.log(`Minted ${mintAmount} mUSDC to ${recipient}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
