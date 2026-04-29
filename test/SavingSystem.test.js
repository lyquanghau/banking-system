const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Blockchain Savings System", function () {
  const DECIMALS = 1_000_000n;
  const DAY = 24 * 60 * 60;

  async function deployFixture() {
    const [owner, alice, bob, feeReceiver] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const token = await MockUSDC.deploy(owner.address);
    await token.waitForDeployment();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    const vault = await VaultManager.deploy(owner.address, await token.getAddress(), feeReceiver.address);
    await vault.waitForDeployment();

    const SavingCore = await ethers.getContractFactory("SavingCore");
    const core = await SavingCore.deploy(owner.address, await token.getAddress(), await vault.getAddress());
    await core.waitForDeployment();

    await vault.setSavingCore(await core.getAddress());

    const ownerMint = 1_000_000n * DECIMALS;
    const userMint = 100_000n * DECIMALS;
    await token.mint(owner.address, ownerMint);
    await token.mint(alice.address, userMint);
    await token.mint(bob.address, userMint);

    return { owner, alice, bob, feeReceiver, token, vault, core };
  }

  async function createPlanAndFund({ owner, token, vault, core }) {
    const fundAmount = 10_000n * DECIMALS;
    await token.connect(owner).approve(await vault.getAddress(), fundAmount);
    await vault.connect(owner).fundVault(fundAmount);

    await core.connect(owner).createPlan(30, 1200, 100n * DECIMALS, 500);
  }

  it("mints a deposit NFT and updates accounting on deposit", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await expect(core.connect(alice).deposit(1, amount)).to.emit(core, "Deposited");

    const deposit = await core.getDeposit(1);
    expect(deposit.owner).to.equal(alice.address);
    expect(deposit.principal).to.equal(amount);
    expect(await core.ownerOf(1)).to.equal(alice.address);
    expect(await core.totalPrincipalOutstanding()).to.equal(amount);
    expect(await token.balanceOf(await core.getAddress())).to.equal(amount);
  });

  it("rejects deposit when vault cannot cover new interest obligation", async function () {
    const { owner, alice, token, vault, core } = await deployFixture();
    await core.connect(owner).createPlan(365, 5000, 100n * DECIMALS, 500);

    const tinyFund = 10n * DECIMALS;
    await token.connect(owner).approve(await vault.getAddress(), tinyFund);
    await vault.connect(owner).fundVault(tinyFund);

    const amount = 10_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await expect(core.connect(alice).deposit(1, amount)).to.be.revertedWithCustomError(core, "VaultInsufficient");
  });

  it("supports mature withdraw with principal from core and interest from vault", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);
    const deposit = await core.getDeposit(1);
    const expectedInterest = deposit.expectedInterest;

    const aliceBefore = await token.balanceOf(alice.address);
    const vaultBefore = await token.balanceOf(await vault.getAddress());

    await time.increase(31 * DAY);
    await expect(core.connect(alice).withdraw(1)).to.emit(core, "Withdrawn");

    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore + amount + expectedInterest);
    expect(await token.balanceOf(await vault.getAddress())).to.equal(vaultBefore - expectedInterest);
    expect(await core.totalPrincipalOutstanding()).to.equal(0);
    expect(await core.totalInterestObligationOutstanding()).to.equal(0);
  });

  it("supports early withdraw with penalty and zero interest", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, feeReceiver, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);

    const penalty = (amount * 500n) / 10_000n;
    const returnedPrincipal = amount - penalty;
    const aliceBefore = await token.balanceOf(alice.address);
    const feeBefore = await token.balanceOf(feeReceiver.address);

    await expect(core.connect(alice).withdraw(1)).to.emit(core, "EarlyWithdrawn");

    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore + returnedPrincipal);
    expect(await token.balanceOf(feeReceiver.address)).to.equal(feeBefore + penalty);
    expect(await core.totalPrincipalOutstanding()).to.equal(0);
    expect(await core.totalInterestObligationOutstanding()).to.equal(0);
  });

  it("prevents double withdraw", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);
    await core.connect(alice).withdraw(1);

    await expect(core.connect(alice).withdraw(1)).to.be.revertedWithCustomError(core, "DepositInactive");
  });

  it("blocks renew before maturity plus grace period", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);

    await time.increase(31 * DAY);
    await expect(core.connect(alice).renew(1)).to.be.revertedWithCustomError(core, "RenewNotReady");
  });

  it("renews after maturity plus 3 days and creates a new deposit", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);
    const oldDeposit = await core.getDeposit(1);

    await time.increase(34 * DAY);
    await expect(core.connect(alice).renew(1)).to.emit(core, "Renewed");

    const closedDeposit = await core.getDeposit(1);
    const newDeposit = await core.getDeposit(2);
    expect(closedDeposit.status).to.equal(2);
    expect(newDeposit.status).to.equal(0);
    expect(newDeposit.principal).to.equal(amount);
    expect(newDeposit.renewCount).to.equal(1);
    expect(await core.totalPrincipalOutstanding()).to.equal(amount);
    expect(await core.totalInterestObligationOutstanding()).to.equal(newDeposit.expectedInterest);
    expect(oldDeposit.expectedInterest).to.be.gt(0);
  });

  it("blocks user actions while system is paused", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { owner, alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await vault.connect(owner).pause();

    await expect(core.connect(alice).deposit(1, amount)).to.be.revertedWithCustomError(core, "SystemPaused");
  });

  it("blocks withdraw and renew while system is paused", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { owner, alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await core.connect(alice).deposit(1, amount);

    await vault.connect(owner).pause();
    await expect(core.connect(alice).withdraw(1)).to.be.revertedWithCustomError(core, "SystemPaused");
    await expect(core.connect(alice).renew(1)).to.be.revertedWithCustomError(core, "SystemPaused");
  });

  it("preserves accounting invariants across mixed user flows", async function () {
    const fixture = await deployFixture();
    await createPlanAndFund(fixture);

    const { alice, bob, token, vault, core } = fixture;
    const amountAlice = 1_000n * DECIMALS;
    const amountBob = 2_000n * DECIMALS;

    await token.connect(alice).approve(await core.getAddress(), amountAlice);
    await token.connect(bob).approve(await core.getAddress(), amountBob);
    await core.connect(alice).deposit(1, amountAlice);
    await core.connect(bob).deposit(1, amountBob);

    await core.connect(alice).withdraw(1);
    await time.increase(34 * DAY);
    await core.connect(bob).renew(2);

    const coreBalance = await token.balanceOf(await core.getAddress());
    const vaultBalance = await token.balanceOf(await vault.getAddress());
    const totalPrincipalOutstanding = await core.totalPrincipalOutstanding();
    const totalInterestObligationOutstanding = await core.totalInterestObligationOutstanding();

    expect(coreBalance).to.be.gte(totalPrincipalOutstanding);
    expect(vaultBalance).to.be.gte(totalInterestObligationOutstanding);
    expect(coreBalance + vaultBalance).to.be.gte(
      totalPrincipalOutstanding + totalInterestObligationOutstanding
    );
  });
});
