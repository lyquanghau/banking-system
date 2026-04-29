export const coreAbi = [
  "function createPlan(uint256 tenorDays,uint256 aprBps,uint256 minAmount,uint256 penaltyBps)",
  "function setPlanStatus(uint256 planId,bool isActive)",
  "function previewInterest(uint256 planId,uint256 amount) view returns (uint256)",
  "function deposit(uint256 planId,uint256 amount) returns (uint256)",
  "function withdraw(uint256 tokenId)",
  "function renew(uint256 tokenId) returns (uint256)",
  "function getDeposit(uint256 tokenId) view returns ((uint256 tokenId,address owner,uint256 planId,uint256 principal,uint256 expectedInterest,uint256 startAt,uint256 maturityAt,uint8 status,uint256 renewCount,uint256 closedAt))",
  "function getDepositIdsByOwner(address account) view returns (uint256[])",
  "function totalPrincipalOutstanding() view returns (uint256)",
  "function totalInterestObligationOutstanding() view returns (uint256)"
];

export const vaultAbi = [
  "function fundVault(uint256 amount)",
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
