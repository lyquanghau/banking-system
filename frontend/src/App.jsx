import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { CONTRACTS, USDC_DECIMALS } from "./config";
import { coreAbi, tokenAbi, vaultAbi } from "./abi";

function formatAmount(value) {
  return Number(formatUnits(value || 0n, USDC_DECIMALS)).toLocaleString();
}

function statusLabel(status) {
  if (status === 0n || status === 0) return "Active";
  if (status === 1n || status === 1) return "Withdrawn";
  if (status === 2n || status === 2) return "Manual Renewed";
  if (status === 3n || status === 3) return "Auto Renewed";
  return "Unknown";
}

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("");
  const [paused, setPaused] = useState(false);
  const [vaultBalance, setVaultBalance] = useState("0");
  const [plans, setPlans] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState("1");
  const [depositAmount, setDepositAmount] = useState("1000");
  const [vaultAmount, setVaultAmount] = useState("5000");
  const [planForm, setPlanForm] = useState({
    tenorDays: "30",
    aprBps: "1200",
    minDeposit: "100",
    maxDeposit: "5000",
    penaltyBps: "500"
  });
  const [message, setMessage] = useState("");

  const canUseContracts =
    account && CONTRACTS.core !== "0x0000000000000000000000000000000000000000";

  async function connectWallet() {
    if (!window.ethereum) {
      setMessage("MetaMask is not installed.");
      return;
    }

    const nextProvider = new BrowserProvider(window.ethereum);
    await nextProvider.send("eth_requestAccounts", []);
    const nextSigner = await nextProvider.getSigner();
    const nextNetwork = await nextProvider.getNetwork();

    setProvider(nextProvider);
    setSigner(nextSigner);
    setAccount(await nextSigner.getAddress());
    setNetwork(`${nextNetwork.name} (${nextNetwork.chainId})`);
  }

  async function refreshData(activeSigner = signer, activeAccount = account) {
    if (!activeSigner || !activeAccount || !canUseContracts) return;

    const core = new Contract(CONTRACTS.core, coreAbi, activeSigner);
    const vault = new Contract(CONTRACTS.vault, vaultAbi, activeSigner);

    const [nextPlanId, ids, rawPaused, rawVaultBalance] = await Promise.all([
      core.nextPlanId(),
      core.getDepositIdsByOwner(activeAccount),
      vault.paused(),
      vault.availableVaultBalance()
    ]);

    const planPromises = [];
    for (let planId = 1n; planId < nextPlanId; planId += 1n) {
      planPromises.push(core.getPlan(planId));
    }

    const [nextPlans, nextDeposits] = await Promise.all([
      Promise.all(planPromises),
      Promise.all(ids.map((id) => core.getDeposit(id)))
    ]);

    setPlans(nextPlans);
    setDeposits(nextDeposits);
    setPaused(rawPaused);
    setVaultBalance(formatAmount(rawVaultBalance));
    if (nextPlans.length && !nextPlans.find((plan) => plan.planId.toString() === selectedPlanId)) {
      setSelectedPlanId(nextPlans[0].planId.toString());
    }
  }

  async function runTx(label, fn) {
    try {
      setMessage(`${label}...`);
      const tx = await fn();
      await tx.wait();
      setMessage(`${label} succeeded.`);
      await refreshData();
    } catch (error) {
      setMessage(error?.shortMessage || error?.reason || error?.message || `${label} failed.`);
    }
  }

  async function handleOpenDeposit() {
    const token = new Contract(CONTRACTS.token, tokenAbi, signer);
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    const amount = parseUnits(depositAmount || "0", USDC_DECIMALS);

    await runTx("Approve token", () => token.approve(CONTRACTS.core, amount));
    await runTx("Open deposit", () => core.openDeposit(BigInt(selectedPlanId), amount));
  }

  async function handleWithdrawAtMaturity(depositId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Withdraw deposit #${depositId} at maturity`, () =>
      core.withdrawAtMaturity(depositId)
    );
  }

  async function handleEarlyWithdraw(depositId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Early withdraw deposit #${depositId}`, () => core.earlyWithdraw(depositId));
  }

  async function handleRenew(depositId, newPlanId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Renew deposit #${depositId}`, () =>
      core.renewDeposit(depositId, BigInt(newPlanId))
    );
  }

  async function handleCreatePlan() {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx("Create plan", () =>
      core.createPlan(
        BigInt(planForm.tenorDays),
        BigInt(planForm.aprBps),
        parseUnits(planForm.minDeposit || "0", USDC_DECIMALS),
        parseUnits(planForm.maxDeposit || "0", USDC_DECIMALS),
        BigInt(planForm.penaltyBps)
      )
    );
  }

  async function handleFundVault() {
    const token = new Contract(CONTRACTS.token, tokenAbi, signer);
    const vault = new Contract(CONTRACTS.vault, vaultAbi, signer);
    const amount = parseUnits(vaultAmount || "0", USDC_DECIMALS);

    await runTx("Approve vault funding", () => token.approve(CONTRACTS.vault, amount));
    await runTx("Fund vault", () => vault.fundVault(amount));
  }

  async function handlePause(nextPaused) {
    const vault = new Contract(CONTRACTS.vault, vaultAbi, signer);
    await runTx(nextPaused ? "Pause withdrawals" : "Resume withdrawals", () =>
      nextPaused ? vault.pause() : vault.unpause()
    );
  }

  useEffect(() => {
    if (signer && canUseContracts) {
      refreshData();
    }
  }, [signer, account, canUseContracts]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Blockchain Savings</p>
          <h1>Term Deposit Console</h1>
          <p className="lead">
            Principal stays in SavingCore. Interest stays in VaultManager until it is paid out.
          </p>
        </div>
        <button className="primary" onClick={connectWallet}>
          {account ? "Wallet Connected" : "Connect MetaMask"}
        </button>
      </header>

      <section className="status-grid">
        <div className="card">
          <h3>Wallet</h3>
          <p>{account || "Not connected"}</p>
          <small>{network || "No network"}</small>
        </div>
        <div className="card">
          <h3>Vault</h3>
          <p>{vaultBalance} USDC</p>
          <small>{paused ? "Withdrawals paused" : "Withdrawals active"}</small>
        </div>
        <div className="card">
          <h3>Contracts</h3>
          <small>Core: {CONTRACTS.core}</small>
          <small>Vault: {CONTRACTS.vault}</small>
          <small>Token: {CONTRACTS.token}</small>
        </div>
      </section>

      <section className="card">
        <h2>Available Plans</h2>
        {!plans.length && <p>No plans created yet.</p>}
        <div className="deposit-list">
          {plans.map((plan) => (
            <article key={plan.planId.toString()} className="deposit-item">
              <div>
                <strong>Plan #{plan.planId.toString()}</strong>
                <p>Tenor: {plan.tenorDays.toString()} days</p>
                <p>APR: {plan.aprBps.toString()} bps</p>
                <p>Min deposit: {formatAmount(plan.minDeposit)} USDC</p>
                <p>
                  Max deposit:{" "}
                  {plan.maxDeposit === 0n ? "No cap" : `${formatAmount(plan.maxDeposit)} USDC`}
                </p>
                <p>Penalty: {plan.earlyWithdrawPenaltyBps.toString()} bps</p>
                <p>Status: {plan.enabled ? "Enabled" : "Disabled"}</p>
              </div>
              <div className="actions">
                <button
                  onClick={() => setSelectedPlanId(plan.planId.toString())}
                  disabled={!plan.enabled}
                >
                  Use This Plan
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-grid">
        <div className="card">
          <h2>User Actions</h2>
          <label>Selected plan</label>
          <input value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} />
          <label>Deposit amount (USDC)</label>
          <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          <button className="primary" disabled={!canUseContracts} onClick={handleOpenDeposit}>
            Open Deposit
          </button>
        </div>

        <div className="card">
          <h2>Admin Actions</h2>
          <label>Tenor days</label>
          <input
            value={planForm.tenorDays}
            onChange={(e) => setPlanForm({ ...planForm, tenorDays: e.target.value })}
          />
          <label>APR (bps)</label>
          <input
            value={planForm.aprBps}
            onChange={(e) => setPlanForm({ ...planForm, aprBps: e.target.value })}
          />
          <label>Min deposit (USDC)</label>
          <input
            value={planForm.minDeposit}
            onChange={(e) => setPlanForm({ ...planForm, minDeposit: e.target.value })}
          />
          <label>Max deposit (USDC, 0 = no cap)</label>
          <input
            value={planForm.maxDeposit}
            onChange={(e) => setPlanForm({ ...planForm, maxDeposit: e.target.value })}
          />
          <label>Penalty (bps)</label>
          <input
            value={planForm.penaltyBps}
            onChange={(e) => setPlanForm({ ...planForm, penaltyBps: e.target.value })}
          />
          <button onClick={handleCreatePlan} disabled={!canUseContracts}>
            Create Plan
          </button>
          <label>Vault funding (USDC)</label>
          <input value={vaultAmount} onChange={(e) => setVaultAmount(e.target.value)} />
          <button onClick={handleFundVault} disabled={!canUseContracts}>
            Fund Vault
          </button>
          <button onClick={() => handlePause(true)} disabled={!canUseContracts || paused}>
            Pause Withdrawals
          </button>
          <button onClick={() => handlePause(false)} disabled={!canUseContracts || !paused}>
            Resume Withdrawals
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Your Deposit Certificates</h2>
        {!deposits.length && <p>No deposits found for this wallet.</p>}
        <div className="deposit-list">
          {deposits.map((deposit) => {
            const depositId = deposit.depositId.toString();
            const isActive = statusLabel(deposit.status) === "Active";
            const isMatured = Number(deposit.maturityAt) * 1000 <= Date.now();

            return (
              <article key={depositId} className="deposit-item">
                <div>
                  <strong>Deposit #{depositId}</strong>
                  <p>Plan: {deposit.planId.toString()}</p>
                  <p>Principal: {formatAmount(deposit.principal)} USDC</p>
                  <p>Expected interest: {formatAmount(deposit.expectedInterest)} USDC</p>
                  <p>APR at open: {deposit.aprBpsAtOpen.toString()} bps</p>
                  <p>Penalty at open: {deposit.penaltyBpsAtOpen.toString()} bps</p>
                  <p>Tenor at open: {deposit.tenorDaysAtOpen.toString()} days</p>
                  <p>Maturity: {new Date(Number(deposit.maturityAt) * 1000).toLocaleString()}</p>
                  <p>Status: {statusLabel(deposit.status)}</p>
                </div>
                <div className="actions">
                  <button
                    onClick={() => handleWithdrawAtMaturity(deposit.depositId)}
                    disabled={!canUseContracts || paused || !isActive || !isMatured}
                  >
                    Withdraw At Maturity
                  </button>
                  <button
                    onClick={() => handleEarlyWithdraw(deposit.depositId)}
                    disabled={!canUseContracts || paused || !isActive || isMatured}
                  >
                    Early Withdraw
                  </button>
                  <button
                    onClick={() => handleRenew(deposit.depositId, selectedPlanId)}
                    disabled={!canUseContracts || paused || !isActive || !isMatured}
                  >
                    Renew Into Selected Plan
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="message-bar">{message || "Ready."}</footer>
    </div>
  );
}
