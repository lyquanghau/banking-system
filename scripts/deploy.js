const hre = require("hardhat");

const USDC_DECIMALS = 6n;
const UNIT = 10n ** USDC_DECIMALS;

function usdc(amount) {
  return BigInt(amount) * UNIT;
}

async function main() {
  const [deployer, feeReceiver, alice, bob] = await hre.ethers.getSigners();

  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const token = await MockUSDC.deploy(deployer.address);
  await token.waitForDeployment();

  const VaultManager = await hre.ethers.getContractFactory("VaultManager");
  const vault = await VaultManager.deploy(
    deployer.address,
    await token.getAddress(),
    feeReceiver.address
  );
  await vault.waitForDeployment();

  const SavingCore = await hre.ethers.getContractFactory("SavingCore");
  const core = await SavingCore.deploy(
    deployer.address,
    await token.getAddress(),
    await vault.getAddress()
  );
  await core.waitForDeployment();

  await vault.setSavingCore(await core.getAddress());

  const adminMint = usdc(1_000_000);
  const userMint = usdc(50_000);
  const vaultFundAmount = usdc(20_000);

  await token.mint(deployer.address, adminMint);
  await token.mint(alice.address, userMint);
  await token.mint(bob.address, userMint);

  await token.approve(await vault.getAddress(), vaultFundAmount);
  await vault.fundVault(vaultFundAmount);

  await core.createPlan(30, 1200, usdc(100), usdc(5_000), 500);
  await core.createPlan(90, 1500, usdc(100), usdc(20_000), 250);

  console.log("MockUSDC:", await token.getAddress());
  console.log("VaultManager:", await vault.getAddress());
  console.log("SavingCore:", await core.getAddress());
  console.log("FeeReceiver:", feeReceiver.address);
  console.log("Demo User Alice:", alice.address);
  console.log("Demo User Bob:", bob.address);
  console.log("Vault funded:", vaultFundAmount.toString());
  console.log("Plan #1:", "30 days, 1200 bps, min 100, max 5000, penalty 500");
  console.log("Plan #2:", "90 days, 1500 bps, min 100, max 20000, penalty 250");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
