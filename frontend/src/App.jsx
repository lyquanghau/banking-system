import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import {
  AUTO_RENEW_GRACE_PERIOD_DAYS,
  CONTRACTS,
  DEMO_ACCOUNTS,
  LOCAL_NETWORK,
  USDC_DECIMALS
} from "./config";
import { coreAbi, tokenAbi, vaultAbi } from "./abi";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function formatAmount(value) {
  return Number(formatUnits(value || 0n, USDC_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function statusLabel(status) {
  if (status === 0n || status === 0) return "Active";
  if (status === 1n || status === 1) return "Withdrawn";
  if (status === 2n || status === 2) return "Manual Renewed";
  if (status === 3n || status === 3) return "Auto Renewed";
  return "Unknown";
}

function normalizeAddress(value) {
  return (value || "").toLowerCase();
}

function getAccountRole(account) {
  const normalized = normalizeAddress(account);
  if (!normalized) return "Guest";
  if (normalized === normalizeAddress(DEMO_ACCOUNTS.admin)) return "Operator";
  if (normalized === normalizeAddress(DEMO_ACCOUNTS.feeReceiver)) return "Treasury";
  return "Client";
}

function getActionHint({
  paused,
  isActive,
  isMatured,
  canAutoRenew,
  canUseContracts,
  account,
  planEnabled,
  hasMockUsdcBalance
}) {
  if (!canUseContracts || !account) return "Connect MetaMask first.";
  if (paused) return "System activity is paused by the operator.";
  if (planEnabled === false) return "Selected plan is disabled.";
  if (!hasMockUsdcBalance) return "This wallet has no available stablecoin balance for deposits.";
  if (!isActive) return "Deposit is already closed.";
  if (isMatured === false) return "This action requires maturity.";
  if (isMatured === true && canAutoRenew === false) return "Action available before grace window ends.";
  return "Ready";
}

function getNetworkLabel(chainId, network) {
  if (!chainId) return "Not connected";
  if (String(chainId) === String(LOCAL_NETWORK.chainId)) return "Supported Network";
  return network || `Chain ${chainId}`;
}

function formatWalletError(error) {
  if (error?.code === 4001) {
    return "MetaMask request was rejected. Open the extension and approve the connection request.";
  }
  if (error?.code === -32002) {
    return "A MetaMask connection request is already pending. Open the MetaMask extension and complete it first.";
  }
  if (error?.code === 4100) {
    return "This site is not authorized in MetaMask. Reconnect the wallet from the extension.";
  }
  if (error?.code === 4902) {
    return "The selected network is missing in MetaMask. Add the required network manually in wallet settings.";
  }
  return error?.shortMessage || error?.reason || error?.message || "MetaMask connection failed.";
}

function getProgressPercent(startAt, maturityAt, nowSeconds = Date.now() / 1000) {
  const total = Math.max(Number(maturityAt - startAt), 1);
  const elapsed = Math.min(Math.max(nowSeconds - Number(startAt), 0), total);
  return Math.round((elapsed / total) * 100);
}

function getTxTone(message) {
  const text = (message || "").toLowerCase();
  if (!text || text === "ready.") return "neutral";
  if (text.includes("succeeded") || text.includes("completed successfully")) return "success";
  if (text.includes("failed") || text.includes("rejected") || text.includes("locked")) return "danger";
  if (text.includes("pending") || text.includes("requesting") || text.includes("...")) return "pending";
  return "neutral";
}

function formatDateTime(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
}

function getActionTitle(action) {
  if (action === "settle") return "Confirm settlement";
  if (action === "earlyExit") return "Confirm early exit";
  if (action === "manualRenew") return "Confirm manual renew";
  if (action === "autoRenew") return "Confirm auto renew";
  return "Confirm action";
}

function getActionSummary(action, deposit, selectedPlanId) {
  if (action === "settle") {
    return `User will receive ${formatAmount(deposit.principal)} USDC principal from SavingCore and ${formatAmount(deposit.expectedInterest)} USDC interest from VaultManager.`;
  }

  if (action === "earlyExit") {
    const penalty = (deposit.principal * deposit.penaltyBpsAtOpen) / 10_000n;
    const returned = deposit.principal - penalty;
    return `User will receive ${formatAmount(returned)} USDC. Penalty: ${formatAmount(penalty)} USDC. Interest payout: 0 USDC.`;
  }

  if (action === "manualRenew") {
    const newPrincipal = deposit.principal + deposit.expectedInterest;
    return `This will close the current deposit and create a new one using plan #${selectedPlanId}. New principal: ${formatAmount(newPrincipal)} USDC.`;
  }

  if (action === "autoRenew") {
    const newPrincipal = deposit.principal + deposit.expectedInterest;
    return `This will auto-renew using the original APR snapshot and tenor. New principal: ${formatAmount(newPrincipal)} USDC.`;
  }

  return "";
}

function formatContractError(error, context = {}) {
  const rawMessage = [
    error?.shortMessage,
    error?.reason,
    error?.message,
    error?.info?.error?.message,
    error?.data?.message
  ]
    .filter(Boolean)
    .join(" ");

  if (rawMessage.includes("AmountBelowMinimum")) {
    const minDeposit = context.minDeposit ? `${formatAmount(context.minDeposit)} USDC` : "the minimum";
    return `Deposit amount is below the minimum required for this plan. Minimum deposit: ${minDeposit}.`;
  }

  if (rawMessage.includes("AmountAboveMaximum")) {
    const maxDeposit = context.maxDeposit ? `${formatAmount(context.maxDeposit)} USDC` : "the maximum";
    return `Deposit amount is above the maximum allowed for this plan. Maximum deposit: ${maxDeposit}.`;
  }

  if (rawMessage.includes("PlanDisabled")) {
    return "This saving plan is currently disabled.";
  }

  if (rawMessage.includes("VaultInsufficient")) {
    return "The vault does not have enough reserved liquidity to accept this deposit yet.";
  }

  if (rawMessage.includes("SystemPaused")) {
    return "The system is paused. Try again after the operator resumes service.";
  }

  if (error?.code === 4001) {
    return "The wallet request was rejected in MetaMask.";
  }

  return error?.shortMessage || error?.reason || error?.message || "The transaction failed.";
}

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("");
  const [chainId, setChainId] = useState("");
  const [paused, setPaused] = useState(false);
  const [vaultBalance, setVaultBalance] = useState("0");
  const [walletTokenBalance, setWalletTokenBalance] = useState("0");
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
  const [hasMetaMask, setHasMetaMask] = useState(Boolean(window.ethereum));
  const [adminOpen, setAdminOpen] = useState(false);
  const [popup, setPopup] = useState({ open: false, title: "", body: "" });
  const [chainNowMs, setChainNowMs] = useState(Date.now());
  const [confirmAction, setConfirmAction] = useState(null);

  const canUseContracts =
    account &&
    CONTRACTS.core !== ZERO_ADDRESS &&
    CONTRACTS.vault !== ZERO_ADDRESS &&
    CONTRACTS.token !== ZERO_ADDRESS;
  const currentRole = getAccountRole(account);
  const selectedPlan = plans.find((plan) => plan.planId.toString() === selectedPlanId);
  const onExpectedNetwork = chainId === String(LOCAL_NETWORK.chainId);
  const isAdmin = currentRole === "Operator";
  const hasMockUsdcBalance = Number(walletTokenBalance.replace(/,/g, "")) > 0;
  const activeDeposits = deposits.filter((deposit) => statusLabel(deposit.status) === "Active");
  const totalPrincipal = activeDeposits.reduce((sum, deposit) => sum + deposit.principal, 0n);
  const totalInterest = activeDeposits.reduce((sum, deposit) => sum + deposit.expectedInterest, 0n);
  const txTone = getTxTone(message);

  function resetWalletState() {
    setAccount("");
    setSigner(null);
    setProvider(null);
    setNetwork("");
    setChainId("");
    setWalletTokenBalance("0");
    setDeposits([]);
  }

  function showPopup(title, body) {
    setPopup({ open: true, title, body });
  }

  function closePopup() {
    setPopup({ open: false, title: "", body: "" });
  }

  function closeConfirmAction() {
    setConfirmAction(null);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setHasMetaMask(false);
      setMessage("MetaMask is not installed. Install the extension, then refresh this page.");
      return;
    }

    try {
      setHasMetaMask(true);

      if (window.ethereum.isMetaMask !== true) {
        setMessage("An injected wallet was found, but it does not identify itself as MetaMask.");
      }

      if (window.ethereum._metamask?.isUnlocked) {
        const unlocked = await window.ethereum._metamask.isUnlocked();
        if (!unlocked) {
          setMessage("MetaMask is locked. Unlock the extension, then try connecting again.");
          return;
        }
      }

      const existingAccounts = await window.ethereum.request({ method: "eth_accounts" });
      if (existingAccounts.length === 0) {
        setMessage("Awaiting wallet approval...");
      }

      const nextProvider = new BrowserProvider(window.ethereum);
      await nextProvider.send("eth_requestAccounts", []);
      const nextSigner = await nextProvider.getSigner();
      const nextNetwork = await nextProvider.getNetwork();
      const nextAccount = await nextSigner.getAddress();

      setProvider(nextProvider);
      setSigner(nextSigner);
      setAccount(nextAccount);
      setNetwork(`${nextNetwork.name} (${nextNetwork.chainId})`);
      setChainId(nextNetwork.chainId.toString());

      if (Number(nextNetwork.chainId) !== LOCAL_NETWORK.chainId) {
        setMessage(
          `Wallet connected, but the selected network is unsupported. Switch to chain ${LOCAL_NETWORK.chainId}.`
        );
        return;
      }

      setMessage("Wallet connected successfully.");
    } catch (error) {
      setMessage(formatWalletError(error));
    }
  }

  async function disconnectWallet() {
    resetWalletState();
    setMessage("Disconnect this site from MetaMask in the extension if you want a full disconnect.");
  }

  async function refreshData(activeSigner = signer, activeAccount = account) {
    if (
      !activeSigner ||
      !activeAccount ||
      CONTRACTS.core === ZERO_ADDRESS ||
      CONTRACTS.vault === ZERO_ADDRESS
    ) {
      return;
    }

    const core = new Contract(CONTRACTS.core, coreAbi, activeSigner);
    const vault = new Contract(CONTRACTS.vault, vaultAbi, activeSigner);
    const token = new Contract(CONTRACTS.token, tokenAbi, activeSigner);
    const latestBlock = await activeSigner.provider.getBlock("latest");

    const [nextPlanId, ids, rawPaused, rawVaultBalance, rawWalletTokenBalance] = await Promise.all([
      core.nextPlanId(),
      core.getDepositIdsByOwner(activeAccount),
      vault.paused(),
      vault.availableVaultBalance(),
      token.balanceOf(activeAccount)
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
    setWalletTokenBalance(formatAmount(rawWalletTokenBalance));
    if (latestBlock?.timestamp) {
      setChainNowMs(Number(latestBlock.timestamp) * 1000);
    }

    if (nextPlans.length && !nextPlans.find((plan) => plan.planId.toString() === selectedPlanId)) {
      setSelectedPlanId(nextPlans[0].planId.toString());
    }
  }

  async function runTx(label, fn, options = {}) {
    try {
      setMessage(`${label}...`);
      const tx = await fn();
      await tx.wait();
      setMessage(`${label} succeeded.`);
      await refreshData();
    } catch (error) {
      const nextMessage = formatContractError(error, options.errorContext);
      setMessage(nextMessage);
      showPopup(options.errorTitle || `${label} failed`, nextMessage);
    }
  }

  async function handleOpenDeposit() {
    const parsedAmount = Number(depositAmount || "0");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showPopup("Invalid deposit amount", "Enter a valid deposit amount greater than zero.");
      return;
    }

    if (selectedPlan) {
      if (selectedPlan.minDeposit > 0n) {
        const minDeposit = Number(formatUnits(selectedPlan.minDeposit, USDC_DECIMALS));
        if (parsedAmount < minDeposit) {
          const nextMessage = `Deposit amount is below the minimum required for this plan. Minimum deposit: ${formatAmount(selectedPlan.minDeposit)} USDC.`;
          setMessage(nextMessage);
          showPopup("Deposit below minimum", nextMessage);
          return;
        }
      }

      if (selectedPlan.maxDeposit > 0n) {
        const maxDeposit = Number(formatUnits(selectedPlan.maxDeposit, USDC_DECIMALS));
        if (parsedAmount > maxDeposit) {
          const nextMessage = `Deposit amount is above the maximum allowed for this plan. Maximum deposit: ${formatAmount(selectedPlan.maxDeposit)} USDC.`;
          setMessage(nextMessage);
          showPopup("Deposit above maximum", nextMessage);
          return;
        }
      }
    }

    const token = new Contract(CONTRACTS.token, tokenAbi, signer);
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    const amount = parseUnits(depositAmount || "0", USDC_DECIMALS);

    await runTx("Approve token", () => token.approve(CONTRACTS.core, amount));
    await runTx("Open deposit", () => core.openDeposit(BigInt(selectedPlanId), amount), {
      errorTitle: "Open deposit failed",
      errorContext: selectedPlan
        ? {
            minDeposit: selectedPlan.minDeposit,
            maxDeposit: selectedPlan.maxDeposit
          }
        : {}
    });
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

  async function handleAutoRenew(depositId) {
    const core = new Contract(CONTRACTS.core, coreAbi, signer);
    await runTx(`Auto renew deposit #${depositId}`, () => core.autoRenewDeposit(depositId));
  }

  function openConfirmAction(action, deposit) {
    setConfirmAction({
      action,
      deposit
    });
  }

  async function executeConfirmedAction() {
    if (!confirmAction) {
      return;
    }

    const { action, deposit } = confirmAction;
    closeConfirmAction();

    if (action === "settle") {
      await handleWithdrawAtMaturity(deposit.depositId);
      return;
    }

    if (action === "earlyExit") {
      await handleEarlyWithdraw(deposit.depositId);
      return;
    }

    if (action === "manualRenew") {
      await handleRenew(deposit.depositId, selectedPlanId);
      return;
    }

    if (action === "autoRenew") {
      await handleAutoRenew(deposit.depositId);
    }
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
    await runTx(nextPaused ? "Pause system" : "Resume system", () =>
      nextPaused ? vault.pause() : vault.unpause()
    );
  }

  useEffect(() => {
    if (signer && canUseContracts) {
      refreshData();
    }
  }, [signer, account, canUseContracts]);

  useEffect(() => {
    if (!signer || !canUseContracts) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshData();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [signer, account, canUseContracts]);

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    function handleAccountsChanged(nextAccounts) {
      if (!nextAccounts.length) {
        resetWalletState();
        setMessage("Wallet disconnected.");
        return;
      }
      connectWallet();
    }

    function handleChainChanged(nextChainId) {
      setChainId(parseInt(nextChainId, 16).toString());
      connectWallet();
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  return (
    <div className="app-shell">
      {confirmAction && (
        <div className="popup-backdrop" onClick={closeConfirmAction} role="presentation">
          <div
            className="popup-card"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
          >
            <div className="popup-head">
              <div>
                <p className="eyebrow">Deposit Review</p>
                <h2 id="confirm-action-title">{getActionTitle(confirmAction.action)}</h2>
              </div>
              <button type="button" onClick={closeConfirmAction}>
                Close
              </button>
            </div>
            <div className="confirm-grid">
              <div>
                <span>Certificate</span>
                <strong className="data-mono">#{confirmAction.deposit.depositId.toString()}</strong>
              </div>
              <div>
                <span>Plan</span>
                <strong className="data-mono">#{confirmAction.deposit.planId.toString()}</strong>
              </div>
              <div>
                <span>Principal</span>
                <strong className="data-mono">{formatAmount(confirmAction.deposit.principal)} USDC</strong>
              </div>
              <div>
                <span>Interest</span>
                <strong className="data-mono">{formatAmount(confirmAction.deposit.expectedInterest)} USDC</strong>
              </div>
              <div>
                <span>Maturity</span>
                <strong>{formatDateTime(confirmAction.deposit.maturityAt)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{statusLabel(confirmAction.deposit.status)}</strong>
              </div>
            </div>
            <p className="popup-copy">
              {getActionSummary(confirmAction.action, confirmAction.deposit, selectedPlanId)}
            </p>
            <div className="popup-actions">
              <button type="button" onClick={closeConfirmAction}>
                Cancel
              </button>
              <button className="primary" type="button" onClick={executeConfirmedAction}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {popup.open && (
        <div className="popup-backdrop" onClick={closePopup} role="presentation">
          <div
            className="popup-card"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="popup-title"
          >
            <div className="popup-head">
              <div>
                <p className="eyebrow">Transaction Notice</p>
                <h2 id="popup-title">{popup.title}</h2>
              </div>
              <button type="button" onClick={closePopup}>
                Close
              </button>
            </div>
            <p className="popup-copy">{popup.body}</p>
          </div>
        </div>
      )}

      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Neon Savings Console</p>
          <h1>
            Fixed-Term Deposits
            <span className="hero-title-accent"> Managed With On-Chain Settlement</span>
          </h1>
          <p className="lead">
            A high-clarity banking dashboard for opening fixed-term positions, tracking yield
            obligations, and settling vault-funded interest with certificate-based ownership.
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={connectWallet}>
            {account ? "Reconnect Wallet" : "Connect MetaMask"}
          </button>
          <button onClick={disconnectWallet} disabled={!account}>
            Clear Session
          </button>
        </div>
      </header>

      <section className="banner-grid">
        <article className={`banner-card banner-${txTone}`}>
          <span className="banner-label">Status</span>
          <strong>{message || "Ready."}</strong>
          <small>
            {onExpectedNetwork
              ? `${walletTokenBalance} USDC available`
              : `Switch to chain ${LOCAL_NETWORK.chainId}`}
          </small>
        </article>
      </section>

      <section className="overview-grid">
        <article className="metric-card spotlight">
          <span className="metric-label">Wallet</span>
          <strong className="data-mono">{shortAddress(account)}</strong>
          <small>{currentRole}</small>
          <small>{getNetworkLabel(chainId, network)}</small>
          <small>{hasMetaMask ? "MetaMask detected" : "MetaMask not detected"}</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Portfolio</span>
          <strong className="data-mono">{activeDeposits.length}</strong>
          <small>{formatAmount(totalPrincipal)} USDC principal</small>
          <small>{formatAmount(totalInterest)} USDC expected yield</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Vault</span>
          <strong className="data-mono">{vaultBalance} USDC</strong>
          <small>{paused ? "System paused" : "Interest reserve available"}</small>
        </article>
      </section>

      <section className="panel compact-panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">Savings Options</p>
            <h2>Open A New Position</h2>
          </div>
          <small>{plans.length} plan{plans.length === 1 ? "" : "s"}</small>
        </div>
        <div className="action-bar">
          <input
            aria-label="Selected plan"
            value={selectedPlanId}
            onChange={(event) => setSelectedPlanId(event.target.value)}
            placeholder="Plan ID"
          />
          <input
            aria-label="Deposit amount"
            value={depositAmount}
            onChange={(event) => setDepositAmount(event.target.value)}
            placeholder="Amount in USDC"
          />
          <button
            className="primary"
            disabled={
              !canUseContracts ||
              paused ||
              !onExpectedNetwork ||
              !selectedPlan?.enabled ||
              !hasMockUsdcBalance
            }
            onClick={handleOpenDeposit}
          >
            Open Deposit
          </button>
        </div>
        <small className="support-copy">
          {getActionHint({
            paused,
            isActive: true,
            isMatured: true,
            canAutoRenew: true,
            canUseContracts,
            account,
            planEnabled: selectedPlan?.enabled,
            hasMockUsdcBalance
          })}
        </small>
        <div className="plan-grid">
          {plans.length === 0 && <p className="empty-state">No plans are available yet.</p>}
          {plans.map((plan) => {
            const isSelected = plan.planId.toString() === selectedPlanId;
            return (
              <article
                key={plan.planId.toString()}
                className={`plan-card ${isSelected ? "plan-card-selected" : ""} ${
                  plan.enabled ? "" : "plan-card-disabled"
                }`}
              >
                <div className="plan-topline">
                  <span className="plan-id">Plan #{plan.planId.toString()}</span>
                  <span className={`status-pill ${plan.enabled ? "status-live" : "status-muted"}`}>
                    {plan.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <h3>{plan.tenorDays.toString()}-Day Fixed Term</h3>
                <p className="plan-summary">
                  Locked principal with fixed APR snapshot, explicit deposit bounds, and defined
                  early-withdraw penalty.
                </p>
                <div className="plan-metrics">
                  <div>
                    <span>APR</span>
                    <strong className="data-mono">{plan.aprBps.toString()} bps</strong>
                  </div>
                  <div>
                    <span>Range</span>
                    <strong className="data-mono">
                      {formatAmount(plan.minDeposit)} -{" "}
                      {plan.maxDeposit === 0n ? "No cap" : `${formatAmount(plan.maxDeposit)} USDC`}
                    </strong>
                  </div>
                  <div>
                    <span>Penalty</span>
                    <strong className="data-mono">{plan.earlyWithdrawPenaltyBps.toString()} bps</strong>
                  </div>
                </div>
                <button
                  className={isSelected ? "secondary-selected" : ""}
                  onClick={() => setSelectedPlanId(plan.planId.toString())}
                  disabled={!plan.enabled}
                >
                  {isSelected ? "Selected" : "Use This Plan"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {isAdmin && (
        <section className="panel admin-panel admin-accordion">
          <button className="accordion-trigger" onClick={() => setAdminOpen((value) => !value)}>
            <span>Operator Controls</span>
            <span>{adminOpen ? "Hide" : "Show"}</span>
          </button>
          {adminOpen && (
            <div className="admin-grid">
              <div className="admin-card">
                <h3>Create New Plan</h3>
                <label>Tenor days</label>
                <input
                  value={planForm.tenorDays}
                  onChange={(event) => setPlanForm({ ...planForm, tenorDays: event.target.value })}
                />
                <label>APR (bps)</label>
                <input
                  value={planForm.aprBps}
                  onChange={(event) => setPlanForm({ ...planForm, aprBps: event.target.value })}
                />
                <label>Min deposit (USDC)</label>
                <input
                  value={planForm.minDeposit}
                  onChange={(event) => setPlanForm({ ...planForm, minDeposit: event.target.value })}
                />
                <label>Max deposit (USDC, 0 = no cap)</label>
                <input
                  value={planForm.maxDeposit}
                  onChange={(event) => setPlanForm({ ...planForm, maxDeposit: event.target.value })}
                />
                <label>Penalty (bps)</label>
                <input
                  value={planForm.penaltyBps}
                  onChange={(event) => setPlanForm({ ...planForm, penaltyBps: event.target.value })}
                />
                <button onClick={handleCreatePlan} disabled={!canUseContracts || !onExpectedNetwork}>
                  Create Plan
                </button>
              </div>

              <div className="admin-card">
                <h3>Vault Operations</h3>
                <label>Vault funding (USDC)</label>
                <input value={vaultAmount} onChange={(event) => setVaultAmount(event.target.value)} />
                <button onClick={handleFundVault} disabled={!canUseContracts || !onExpectedNetwork}>
                  Fund Vault
                </button>
                <div className="admin-actions-inline">
                  <button
                    onClick={() => handlePause(true)}
                    disabled={!canUseContracts || !onExpectedNetwork || paused}
                  >
                    Pause System
                  </button>
                  <button
                    onClick={() => handlePause(false)}
                    disabled={!canUseContracts || !onExpectedNetwork || !paused}
                  >
                    Resume System
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">Certificate Portfolio</p>
            <h2>Your Deposit Positions</h2>
          </div>
          <small>{deposits.length} certificate{deposits.length === 1 ? "" : "s"}</small>
        </div>

        {deposits.length === 0 && <p className="empty-state">No deposits found for this wallet.</p>}

        <div className="deposit-grid">
          {deposits.map((deposit) => {
            const depositId = deposit.depositId.toString();
            const isActive = statusLabel(deposit.status) === "Active";
            const maturityTimeMs = Number(deposit.maturityAt) * 1000;
            const autoRenewTimeMs =
              maturityTimeMs + AUTO_RENEW_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
            const isMatured = maturityTimeMs <= chainNowMs;
            const canAutoRenew = autoRenewTimeMs <= chainNowMs;
            const progress = getProgressPercent(
              deposit.startAt,
              deposit.maturityAt,
              chainNowMs / 1000
            );
            const settleDisabled = !canUseContracts || !onExpectedNetwork || paused || !isActive || !isMatured;
            const earlyExitDisabled = !canUseContracts || !onExpectedNetwork || paused || !isActive || isMatured;
            const manualRenewDisabled =
              !canUseContracts || !onExpectedNetwork || paused || !isActive || !isMatured;
            const autoRenewDisabled =
              !canUseContracts || !onExpectedNetwork || paused || !isActive || !canAutoRenew;

            return (
              <article key={depositId} className="deposit-card">
                <div className="deposit-header">
                  <div>
                    <span className="deposit-token">Certificate #{depositId}</span>
                    <h3>Plan #{deposit.planId.toString()}</h3>
                  </div>
                  <span
                    className={`status-pill ${
                      isActive ? "status-live" : deposit.status === 1n ? "status-danger" : "status-muted"
                    }`}
                  >
                    {statusLabel(deposit.status)}
                  </span>
                </div>

                <div className="deposit-progress">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <small>{progress}% of term elapsed</small>
                </div>

                <div className="deposit-metrics">
                  <div>
                    <span>Principal</span>
                    <strong className="data-mono">{formatAmount(deposit.principal)} USDC</strong>
                  </div>
                  <div>
                    <span>Interest</span>
                    <strong className="data-mono">{formatAmount(deposit.expectedInterest)} USDC</strong>
                  </div>
                  <div>
                    <span>APR</span>
                    <strong className="data-mono">{deposit.aprBpsAtOpen.toString()} bps</strong>
                  </div>
                </div>

                <div className="deposit-timeline">
                  <small>Opened: {formatDateTime(deposit.startAt)}</small>
                  <small>Maturity: {formatDateTime(deposit.maturityAt)}</small>
                  <small>Auto renew: {new Date(autoRenewTimeMs).toLocaleString()}</small>
                </div>

                <div className="deposit-actions">
                  <button
                    onClick={() => openConfirmAction("settle", deposit)}
                    disabled={settleDisabled}
                  >
                    Settle
                  </button>
                  <button
                    onClick={() => openConfirmAction("earlyExit", deposit)}
                    disabled={earlyExitDisabled}
                  >
                    Early Exit
                  </button>
                  <button
                    onClick={() => openConfirmAction("manualRenew", deposit)}
                    disabled={manualRenewDisabled}
                  >
                    Manual Renew
                  </button>
                  <button
                    onClick={() => openConfirmAction("autoRenew", deposit)}
                    disabled={autoRenewDisabled}
                  >
                    Auto Renew
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
