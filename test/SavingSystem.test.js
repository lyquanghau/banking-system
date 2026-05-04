const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Blockchain Savings System", function () {
  const DECIMALS = 1_000_000n;
  const DAY = 24 * 60 * 60;

  async function deployFixture() {
    const [owner, alice, bob, feeReceiver, bot] = await ethers.getSigners();

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

    await token.mint(owner.address, 1_000_000n * DECIMALS);
    await token.mint(alice.address, 100_000n * DECIMALS);
    await token.mint(bob.address, 100_000n * DECIMALS);

    return { owner, alice, bob, feeReceiver, bot, token, vault, core };
  }

  async function createPlanAndFund(fixture, overrides = {}) {
    const { owner, token, vault, core } = fixture;

    const fundAmount = overrides.fundAmount ?? 20_000n * DECIMALS;
    await token.connect(owner).approve(await vault.getAddress(), fundAmount);
    await vault.connect(owner).fundVault(fundAmount);

    const tenorDays = overrides.tenorDays ?? 30;
    const aprBps = overrides.aprBps ?? 1200;
    const minDeposit = overrides.minDeposit ?? 100n * DECIMALS;
    const maxDeposit = overrides.maxDeposit ?? 5_000n * DECIMALS;
    const penaltyBps = overrides.penaltyBps ?? 500;

    await core
      .connect(owner)
      .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps);
  }

  async function openDepositAs(core, token, user, planId, amount) {
    await token.connect(user).approve(await core.getAddress(), amount);
    await core.connect(user).openDeposit(planId, amount);
  }

  it("uses 6 decimals and only owner can mint MockUSDC", async function () {
    const { alice, token } = await loadFixture(deployFixture);

    expect(await token.decimals()).to.equal(6);
    await expect(token.connect(alice).mint(alice.address, 1n)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("creates valid plans and rejects invalid APR", async function () {
    const { owner, core } = await loadFixture(deployFixture);

    await expect(core.connect(owner).createPlan(30, 1200, 100n, 1_000n, 500))
      .to.emit(core, "PlanCreated")
      .withArgs(1, 30, 1200);

    await expect(core.connect(owner).createPlan(30, 10_001, 100n, 1_000n, 500))
      .to.be.revertedWithCustomError(core, "InvalidApr");
  });

  it("opens a deposit with APR and penalty snapshotted at creation", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;

    await openDepositAs(core, token, alice, 1, amount);
    await core.connect(owner).updatePlan(1, 300);

    const deposit = await core.getDeposit(1);
    expect(deposit.owner).to.equal(alice.address);
    expect(deposit.aprBpsAtOpen).to.equal(1200);
    expect(deposit.penaltyBpsAtOpen).to.equal(500);
    expect(deposit.principal).to.equal(amount);
    expect(await core.ownerOf(1)).to.equal(alice.address);
  });

  it("rejects deposits below min, above max, or on disabled plans", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, token, core } = fixture;
    await token.connect(alice).approve(await core.getAddress(), 10_000n * DECIMALS);

    await expect(core.connect(alice).openDeposit(1, 50n * DECIMALS)).to.be.revertedWithCustomError(
      core,
      "AmountBelowMinimum"
    );
    await expect(
      core.connect(alice).openDeposit(1, 5_001n * DECIMALS)
    ).to.be.revertedWithCustomError(core, "AmountAboveMaximum");

    await core.connect(owner).disablePlan(1);
    await expect(
      core.connect(alice).openDeposit(1, 1_000n * DECIMALS)
    ).to.be.revertedWithCustomError(core, "PlanDisabled");
  });

  it("rejects deposits when the vault cannot cover new interest obligations", async function () {
    const fixture = await loadFixture(deployFixture);
    const { owner, alice, token, vault, core } = fixture;

    await core.connect(owner).createPlan(365, 5000, 100n * DECIMALS, 50_000n * DECIMALS, 500);

    const tinyFund = 10n * DECIMALS;
    await token.connect(owner).approve(await vault.getAddress(), tinyFund);
    await vault.connect(owner).fundVault(tinyFund);

    const amount = 10_000n * DECIMALS;
    await token.connect(alice).approve(await core.getAddress(), amount);
    await expect(core.connect(alice).openDeposit(1, amount)).to.be.revertedWithCustomError(
      core,
      "VaultInsufficient"
    );
  });

  it("lets the NFT transfer and gives the new owner control over the deposit", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { alice, bob, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    await core.connect(alice).transferFrom(alice.address, bob.address, 1);

    const deposit = await core.getDeposit(1);
    expect(deposit.owner).to.equal(bob.address);
    expect(await core.ownerOf(1)).to.equal(bob.address);
    expect(await core.getDepositIdsByOwner(alice.address)).to.deep.equal([]);
    expect(await core.getDepositIdsByOwner(bob.address)).to.deep.equal([1n]);
  });

  it("withdraws at maturity with principal from core and interest from vault", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    const deposit = await core.getDeposit(1);
    const expectedInterest = deposit.expectedInterest;
    const aliceBefore = await token.balanceOf(alice.address);
    const vaultBefore = await token.balanceOf(await vault.getAddress());

    await time.increase(31 * DAY);
    await expect(core.connect(alice).withdrawAtMaturity(1))
      .to.emit(core, "Withdrawn")
      .withArgs(1, alice.address, amount, expectedInterest, false);

    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore + amount + expectedInterest);
    expect(await token.balanceOf(await vault.getAddress())).to.equal(vaultBefore - expectedInterest);
    expect(await core.totalPrincipalOutstanding()).to.equal(0);
    expect(await core.totalInterestObligationOutstanding()).to.equal(0);
  });

  it("reverts maturity withdrawal when the vault has been drained below required interest", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture, { fundAmount: 500n * DECIMALS });

    const { owner, alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    const deposit = await core.getDeposit(1);
    const vaultBalance = await token.balanceOf(await vault.getAddress());
    const remainingBalance = deposit.expectedInterest - 1n;
    await vault.connect(owner).withdrawVault(vaultBalance - remainingBalance);

    await time.increase(31 * DAY);
    await expect(core.connect(alice).withdrawAtMaturity(1)).to.be.reverted;
  });

  it("supports early withdrawal with penalty sent to feeReceiver and zero interest", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { alice, feeReceiver, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    const penalty = (amount * 500n) / 10_000n;
    const principalReturned = amount - penalty;
    const aliceBefore = await token.balanceOf(alice.address);
    const feeBefore = await token.balanceOf(feeReceiver.address);

    await expect(core.connect(alice).earlyWithdraw(1))
      .to.emit(core, "Withdrawn")
      .withArgs(1, alice.address, principalReturned, 0, true);

    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore + principalReturned);
    expect(await token.balanceOf(feeReceiver.address)).to.equal(feeBefore + penalty);
    expect(await core.totalPrincipalOutstanding()).to.equal(0);
    expect(await core.totalInterestObligationOutstanding()).to.equal(0);
  });

  it("prevents double withdrawal and renew on inactive deposits", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    await core.connect(alice).earlyWithdraw(1);

    await expect(core.connect(alice).earlyWithdraw(1)).to.be.revertedWithCustomError(
      core,
      "DepositInactive"
    );
    await expect(core.connect(alice).withdrawAtMaturity(1)).to.be.revertedWithCustomError(
      core,
      "DepositInactive"
    );
    await expect(core.connect(alice).renewDeposit(1, 1)).to.be.revertedWithCustomError(
      core,
      "DepositInactive"
    );
  });

  it("renews manually at maturity by compounding interest into a new deposit", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    await core.connect(owner).createPlan(90, 1500, 100n * DECIMALS, 10_000n * DECIMALS, 250);

    const oldDeposit = await core.getDeposit(1);
    const expectedNewPrincipal = oldDeposit.principal + oldDeposit.expectedInterest;

    await time.increase(31 * DAY);
    await expect(core.connect(alice).renewDeposit(1, 2))
      .to.emit(core, "Renewed")
      .withArgs(1, 2, expectedNewPrincipal, 2);

    const closedDeposit = await core.getDeposit(1);
    const renewedDeposit = await core.getDeposit(2);

    expect(closedDeposit.status).to.equal(2);
    expect(renewedDeposit.principal).to.equal(expectedNewPrincipal);
    expect(renewedDeposit.aprBpsAtOpen).to.equal(1500);
    expect(renewedDeposit.penaltyBpsAtOpen).to.equal(250);
    expect(renewedDeposit.planId).to.equal(2);
    expect(renewedDeposit.renewCount).to.equal(1);
    expect(await token.balanceOf(await core.getAddress())).to.equal(expectedNewPrincipal);
  });

  it("blocks manual renew before maturity", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { alice, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    await expect(core.connect(alice).renewDeposit(1, 1)).to.be.revertedWithCustomError(
      core,
      "DepositNotMatured"
    );
  });

  it("auto-renews only after the grace period and keeps the original APR locked", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, bot, token, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    const originalDeposit = await core.getDeposit(1);
    await core.connect(owner).updatePlan(1, 100);

    await time.increase(31 * DAY);
    await expect(core.connect(bot).autoRenewDeposit(1)).to.be.revertedWithCustomError(
      core,
      "GracePeriodNotElapsed"
    );

    await time.increase(3 * DAY);
    await expect(core.connect(bot).autoRenewDeposit(1)).to.emit(core, "Renewed");

    const closedDeposit = await core.getDeposit(1);
    const newDeposit = await core.getDeposit(2);
    expect(closedDeposit.status).to.equal(3);
    expect(newDeposit.aprBpsAtOpen).to.equal(originalDeposit.aprBpsAtOpen);
    expect(newDeposit.penaltyBpsAtOpen).to.equal(originalDeposit.penaltyBpsAtOpen);
    expect(newDeposit.tenorDaysAtOpen).to.equal(originalDeposit.tenorDaysAtOpen);
    expect(newDeposit.principal).to.equal(
      originalDeposit.principal + originalDeposit.expectedInterest
    );
    expect(newDeposit.owner).to.equal(alice.address);
  });

  it("allows funding and withdrawing the vault, and prevents non-core interest payouts", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture, { fundAmount: 2_000n * DECIMALS });

    const { owner, alice, bob, vault, token } = fixture;
    const vaultBefore = await token.balanceOf(await vault.getAddress());

    await expect(vault.connect(alice).payInterest(bob.address, 1n)).to.be.revertedWithCustomError(
      vault,
      "UnauthorizedCore"
    );

    await expect(vault.connect(owner).withdrawVault(500n * DECIMALS))
      .to.emit(vault, "VaultWithdrawn")
      .withArgs(owner.address, 500n * DECIMALS);

    expect(await token.balanceOf(await vault.getAddress())).to.equal(vaultBefore - 500n * DECIMALS);
  });

  it("blocks user actions while paused, including opening new deposits", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, token, vault, core } = fixture;
    const amount = 1_000n * DECIMALS;
    await openDepositAs(core, token, alice, 1, amount);

    await vault.connect(owner).pause();

    await expect(core.connect(alice).withdrawAtMaturity(1)).to.be.revertedWithCustomError(
      core,
      "SystemPaused"
    );
    await expect(core.connect(alice).earlyWithdraw(1)).to.be.revertedWithCustomError(
      core,
      "SystemPaused"
    );
    await expect(core.connect(alice).renewDeposit(1, 1)).to.be.revertedWithCustomError(
      core,
      "SystemPaused"
    );

    await token.connect(alice).approve(await core.getAddress(), amount);
    await expect(core.connect(alice).openDeposit(1, amount)).to.be.revertedWithCustomError(
      core,
      "SystemPaused"
    );
  });

  it("preserves accounting invariants across transfer, renew, and early withdrawal flows", async function () {
    const fixture = await loadFixture(deployFixture);
    await createPlanAndFund(fixture);

    const { owner, alice, bob, token, vault, core } = fixture;
    const aliceAmount = 1_000n * DECIMALS;
    const bobAmount = 1_500n * DECIMALS;

    await openDepositAs(core, token, alice, 1, aliceAmount);
    await openDepositAs(core, token, bob, 1, bobAmount);
    await core.connect(alice).transferFrom(alice.address, bob.address, 1);
    await core.connect(bob).earlyWithdraw(1);

    await core.connect(owner).createPlan(60, 1300, 100n * DECIMALS, 20_000n * DECIMALS, 300);
    await time.increase(31 * DAY);
    await core.connect(bob).renewDeposit(2, 2);

    const coreBalance = await token.balanceOf(await core.getAddress());
    const vaultBalance = await token.balanceOf(await vault.getAddress());
    const totalPrincipalOutstanding = await core.totalPrincipalOutstanding();
    const totalInterestOutstanding = await core.totalInterestObligationOutstanding();

    expect(coreBalance).to.be.gte(totalPrincipalOutstanding);
    expect(vaultBalance).to.be.gte(totalInterestOutstanding);
    expect(coreBalance + vaultBalance).to.be.gte(totalPrincipalOutstanding + totalInterestOutstanding);
  });
});
