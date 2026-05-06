const { JsonRpcProvider, Wallet, Contract } = require("ethers");
const { loadEnv } = require("./loadEnv");

loadEnv();

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_SAVING_CORE = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const ACTIVE_STATUS = 0n;

const SAVING_CORE_ABI = [
  "function nextDepositId() view returns (uint256)",
  "function getDeposit(uint256 depositId) view returns ((uint256 depositId,address owner,uint256 planId,uint256 principal,uint256 aprBpsAtOpen,uint256 penaltyBpsAtOpen,uint256 tenorDaysAtOpen,uint256 expectedInterest,uint256 startAt,uint256 maturityAt,uint8 status,uint256 renewCount,uint256 closedAt))",
  "function autoRenewDeposit(uint256 depositId) returns (uint256)",
  "function AUTO_RENEW_GRACE_PERIOD() view returns (uint256)"
];

function getEnvNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatNow() {
  return new Date().toISOString().slice(11, 19);
}

async function main() {
  const rpcUrl = process.env.RPC_URL || DEFAULT_RPC_URL;
  const pollIntervalMs = getEnvNumber(process.env.POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  const savingCoreAddress = process.env.SAVING_CORE_ADDRESS || DEFAULT_SAVING_CORE;
  const privateKey = process.env.BOT_PRIVATE_KEY;

  if (!privateKey) {
    console.error("BOT_PRIVATE_KEY is not set in .env");
    process.exit(1);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const savingCore = new Contract(savingCoreAddress, SAVING_CORE_ABI, wallet);
  const gracePeriod = Number(await savingCore.AUTO_RENEW_GRACE_PERIOD());

  console.log("Auto-renew bot started");
  console.log(`Wallet: ${wallet.address}`);
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`SavingCore: ${savingCoreAddress}`);
  console.log(`Poll interval: ${pollIntervalMs / 1000}s`);
  console.log(`Grace period: ${gracePeriod}s\n`);

  let isPolling = false;

  const poll = async () => {
    if (isPolling) {
      return;
    }

    isPolling = true;

    try {
      const latestBlock = await provider.getBlock("latest");
      const now = Number(latestBlock?.timestamp || 0);
      const nextDepositId = Number(await savingCore.nextDepositId());
      let renewed = 0;

      for (let depositId = 1; depositId < nextDepositId; depositId += 1) {
        try {
          const deposit = await savingCore.getDeposit(depositId);

          if (BigInt(deposit.status) !== ACTIVE_STATUS) {
            continue;
          }

          const maturityAt = Number(deposit.maturityAt);
          if (now < maturityAt + gracePeriod) {
            continue;
          }

          console.log(
            `[${formatNow()}] Auto-renewing deposit #${depositId} for ${deposit.owner}`
          );
          const tx = await savingCore.autoRenewDeposit(depositId);
          await tx.wait();
          console.log(
            `[${formatNow()}] Renewed deposit #${depositId} (tx: ${tx.hash.slice(0, 10)}...)`
          );
          renewed += 1;
        } catch (error) {
          const message = error?.shortMessage || error?.reason || error?.message || "Unknown error";
          console.warn(`[${formatNow()}] Skipped deposit #${depositId}: ${message}`);
        }
      }

      if (renewed === 0) {
        console.log(`[${formatNow()}] No deposits eligible for auto-renew.`);
      }
    } catch (error) {
      const message = error?.shortMessage || error?.reason || error?.message || "Unknown error";
      console.error(`[${formatNow()}] Poll error: ${message}`);
    } finally {
      isPolling = false;
    }
  };

  await poll();
  setInterval(poll, pollIntervalMs);
}

main().catch((error) => {
  const message = error?.shortMessage || error?.reason || error?.message || "Unknown fatal error";
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
