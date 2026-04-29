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
  if (status === 2n || status === 2) return "Renewed";
  return "Unknown";
}

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("");
  const [paused, setPaused] = useState(false);
  const [vaultBalance, setVaultBalance] = useState("0");
  const [depositIds, setDepositIds] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [depositAmount, setDepositAmount] = useState("1000");
  const [vaultAmount, setVaultAmount] = useState("5000");
  const [planForm, setPlanForm] = useState({
    tenorDays: "30",
    aprBps: "1200",
    minAmount: "100",
    penaltyBps: "500"
  });
  const [message, setMessage] = useState("");

  const canUseContracts = account && CONTRACTS.core !== "0x0000000000000000000000000000000000000000";

  async function connectWallet() {
    if (!window.ethereum) {
      setMessage("MetaMask chưa được cài.");
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

  async function refreshData(activeSigner = signer) {
    if (!activeSigner || !account || !canUseContracts) return;

    const core = new Contract(CONTRACTS.core, coreAbi, activeSigner);
    const vault = new Contract(CONTRACTS.vault, vaultAbi, activeSigner);

    const [ids, rawPaused, rawVaultBalance] = await Promise.all([
      core.getDepositIdsByOwner(account),
      vault.paused(),
      vault.availableVaultBalance()
    ]);

    const nextDeposits = await Promise.all(ids.map((id) => core.getDeposit(id)));

    setDepositIds(ids.map((id) => id.toString()));
    setDeposits(nextDeposits);
    setPaused(rawPaused);
    setVaultBalance(formatAmount(rawVaultBalance));
  }

  async function runTx(label, fn) {
    try {
      setMessage(`${label}...`);
      const tx = await fn();
      await tx.wait();
      setMessage(`${label} thành công.`);
      await refreshData();
    } catch (error) {
      setMessage(error?.shortMessage || error?.reason || error?.message || `${label} thất bại.`);
    }
  }

  async function handleDeposit() {
    const token = new Contract(CONTRACTS.token, tokenAbi, signer);
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    const amount = parseUnits(depositAmount || "0", USDC_DECIMALS);

    await runTx("Approve token", () => token.approve(CONTRACTS.core, amount));
    await runTx("Deposit", () => core.deposit(1, amount));
  }

  async function handleWithdraw(tokenId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Withdraw deposit #${tokenId}`, () => core.withdraw(tokenId));
  }

  async function handleRenew(tokenId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Renew deposit #${tokenId}`, () => core.renew(tokenId));
  }

  async function handleCreatePlan() {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    const minAmount = parseUnits(planForm.minAmount || "0", USDC_DECIMALS);
    await runTx("Create plan", () =>
      core.createPlan(
        BigInt(planForm.tenorDays),
        BigInt(planForm.aprBps),
        minAmount,
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
    await runTx(nextPaused ? "Pause system" : "Unpause system", () =>
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
            Principal ở `SavingCore`, interest ở `VaultManager`, penalty về `feeReceiver`.
          </p>
        </div>
        <button className="primary" onClick={connectWallet}>
          {account ? "Đã kết nối" : "Kết nối MetaMask"}
        </button>
      </header>

      <section className="status-grid">
        <div className="card">
          <h3>Wallet</h3>
          <p>{account || "Chưa kết nối"}</p>
          <small>{network || "Chưa có network"}</small>
        </div>
        <div className="card">
          <h3>Vault</h3>
          <p>{vaultBalance} USDC</p>
          <small>{paused ? "System paused" : "System active"}</small>
        </div>
        <div className="card">
          <h3>Contracts</h3>
          <small>Core: {CONTRACTS.core}</small>
          <small>Vault: {CONTRACTS.vault}</small>
          <small>Token: {CONTRACTS.token}</small>
        </div>
      </section>

      <section className="panel-grid">
        <div className="card">
          <h2>User Actions</h2>
          <label>Deposit amount (USDC)</label>
          <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          <button className="primary" disabled={!canUseContracts || paused} onClick={handleDeposit}>
            Deposit vào Plan #1
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
          <label>Min amount (USDC)</label>
          <input
            value={planForm.minAmount}
            onChange={(e) => setPlanForm({ ...planForm, minAmount: e.target.value })}
          />
          <label>Penalty (bps)</label>
          <input
            value={planForm.penaltyBps}
            onChange={(e) => setPlanForm({ ...planForm, penaltyBps: e.target.value })}
          />
          <button onClick={handleCreatePlan} disabled={!canUseContracts}>Create Plan</button>
          <label>Vault funding (USDC)</label>
          <input value={vaultAmount} onChange={(e) => setVaultAmount(e.target.value)} />
          <button onClick={handleFundVault} disabled={!canUseContracts}>Fund Vault</button>
          <button onClick={() => handlePause(true)} disabled={!canUseContracts || paused}>Pause</button>
          <button onClick={() => handlePause(false)} disabled={!canUseContracts || !paused}>Unpause</button>
        </div>
      </section>

      <section className="card">
        <h2>Deposits của user</h2>
        {!depositIds.length && <p>Chưa có deposit nào.</p>}
        <div className="deposit-list">
          {deposits.map((deposit) => (
            <article key={deposit.tokenId.toString()} className="deposit-item">
              <div>
                <strong>Deposit #{deposit.tokenId.toString()}</strong>
                <p>Plan: {deposit.planId.toString()}</p>
                <p>Principal: {formatAmount(deposit.principal)} USDC</p>
                <p>Expected interest: {formatAmount(deposit.expectedInterest)} USDC</p>
                <p>Maturity: {new Date(Number(deposit.maturityAt) * 1000).toLocaleString()}</p>
                <p>Status: {statusLabel(deposit.status)}</p>
              </div>
              <div className="actions">
                <button
                  onClick={() => handleWithdraw(deposit.tokenId)}
                  disabled={!canUseContracts || paused || statusLabel(deposit.status) !== "Active"}
                >
                  Withdraw
                </button>
                <button
                  onClick={() => handleRenew(deposit.tokenId)}
                  disabled={!canUseContracts || paused || statusLabel(deposit.status) !== "Active"}
                >
                  Renew
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="message-bar">{message || "Sẵn sàng."}</footer>
    </div>
  );
}
