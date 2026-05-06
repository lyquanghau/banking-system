export const coreAbi = [
  "function owner() view returns (address)",
  "function nextPlanId() view returns (uint256)",
  "function createPlan(uint256 tenorDays,uint256 aprBps,uint256 minDeposit,uint256 maxDeposit,uint256 earlyWithdrawPenaltyBps)",
  "function updatePlan(uint256 planId,uint256 newAprBps)",
  "function enablePlan(uint256 planId)",
  "function disablePlan(uint256 planId)",
  "function getPlan(uint256 planId) view returns ((uint256 planId,uint256 tenorDays,uint256 aprBps,uint256 minDeposit,uint256 maxDeposit,uint256 earlyWithdrawPenaltyBps,bool enabled))",
  "function previewPlanInterest(uint256 planId,uint256 amount) view returns (uint256)",
  "function openDeposit(uint256 planId,uint256 amount) returns (uint256)",
  "function withdrawAtMaturity(uint256 depositId)",
  "function earlyWithdraw(uint256 depositId)",
  "function renewDeposit(uint256 depositId,uint256 newPlanId) returns (uint256)",
  "function autoRenewDeposit(uint256 depositId) returns (uint256)",
  "function getDeposit(uint256 depositId) view returns ((uint256 depositId,address owner,uint256 planId,uint256 principal,uint256 aprBpsAtOpen,uint256 penaltyBpsAtOpen,uint256 tenorDaysAtOpen,uint256 expectedInterest,uint256 startAt,uint256 maturityAt,uint8 status,uint256 renewCount,uint256 closedAt))",
  "function getDepositIdsByOwner(address account) view returns (uint256[])",
  "function totalPrincipalOutstanding() view returns (uint256)",
  "function totalInterestObligationOutstanding() view returns (uint256)"
];

export const vaultAbi = [
  "function owner() view returns (address)",
  "function fundVault(uint256 amount)",
  "function withdrawVault(uint256 amount)",
  "function setFeeReceiver(address receiver)",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function feeReceiver() view returns (address)",
  "function availableVaultBalance() view returns (uint256)"
];

export const tokenAbi = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function mint(address to,uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
