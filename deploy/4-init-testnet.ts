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

type PlanConfig = {
  tenorDays: number;
  aprBps: number;
  minDeposit: bigint;
  maxDeposit: bigint;
  penaltyBps: number;
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
      `Deployment file not found for network "${networkName}". Run deploy steps 1-3 first.`
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

  if (!deployment.mockUsdc || !deployment.vaultManager || !deployment.savingCore) {
    throw new Error("Deployment file is incomplete. Run deploy steps 1-3 first.");
  }

  const mockUsdc = await hre.ethers.getContractAt("MockUSDC", deployment.mockUsdc);
  const vaultManager = await hre.ethers.getContractAt("VaultManager", deployment.vaultManager);
  const savingCore = await hre.ethers.getContractAt("SavingCore", deployment.savingCore);

  const adminMintAmount = Number(process.env.ADMIN_MINT_AMOUNT || "1000000");
  const vaultFundAmount = Number(process.env.VAULT_FUND_AMOUNT || "20000");
  const userMintAmount = Number(process.env.USER_MINT_AMOUNT || "50000");
  const recipients = parseRecipients(process.env.USER_MINT_ADDRESSES);

  const plans: PlanConfig[] = [
    {
      tenorDays: 30,
      aprBps: 1200,
      minDeposit: usdc(100),
      maxDeposit: usdc(5000),
      penaltyBps: 500
    },
    {
      tenorDays: 90,
      aprBps: 1500,
      minDeposit: usdc(100),
      maxDeposit: usdc(20000),
      penaltyBps: 250
    }
  ];

  console.log(`Network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MockUSDC: ${deployment.mockUsdc}`);
  console.log(`VaultManager: ${deployment.vaultManager}`);
  console.log(`SavingCore: ${deployment.savingCore}\n`);

  const adminMintUnits = usdc(adminMintAmount);
  await (await mockUsdc.mint(deployer.address, adminMintUnits)).wait();
  console.log(`Minted ${adminMintAmount} mUSDC to deployer`);

  if (recipients.length > 0) {
    const userMintUnits = usdc(userMintAmount);
    for (const recipient of recipients) {
      await (await mockUsdc.mint(recipient, userMintUnits)).wait();
      console.log(`Minted ${userMintAmount} mUSDC to ${recipient}`);
    }
  }

  const vaultFundUnits = usdc(vaultFundAmount);
  await (await mockUsdc.approve(deployment.vaultManager, vaultFundUnits)).wait();
  await (await vaultManager.fundVault(vaultFundUnits)).wait();
  console.log(`Funded vault with ${vaultFundAmount} mUSDC`);

  const nextPlanId = Number(await savingCore.nextPlanId());
  if (nextPlanId === 1) {
    for (const plan of plans) {
      await (
        await savingCore.createPlan(
          plan.tenorDays,
          plan.aprBps,
          plan.minDeposit,
          plan.maxDeposit,
          plan.penaltyBps
        )
      ).wait();

      console.log(
        `Created plan: tenor=${plan.tenorDays} days, apr=${plan.aprBps} bps, min=${plan.minDeposit.toString()}, max=${plan.maxDeposit.toString()}, penalty=${plan.penaltyBps} bps`
      );
    }
  } else {
    console.log("Skipping plan creation because plans already exist.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
