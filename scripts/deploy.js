const hre = require("hardhat");

async function main() {
  const [deployer, feeReceiver] = await hre.ethers.getSigners();

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

  console.log("MockUSDC:", await token.getAddress());
  console.log("VaultManager:", await vault.getAddress());
  console.log("SavingCore:", await core.getAddress());
  console.log("FeeReceiver:", feeReceiver.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
