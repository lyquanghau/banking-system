# Blockchain Savings

This project implements an on-chain term deposit system with three contracts:

- `MockUSDC`: a 6-decimal ERC20 token for local testing
- `VaultManager`: the isolated interest vault plus admin pause controls
- `SavingCore`: saving plans, deposit certificate NFTs, withdrawals, and renewals

## Business Rules

- Principal stays in `SavingCore`
- Interest stays in `VaultManager` until payout
- Early withdrawal pays `principal - penalty` and zero interest
- Penalties are sent to `feeReceiver`
- APR and penalty are snapshotted when a deposit is opened
- Manual renew compounds old interest into the next principal
- Auto-renew is available after `maturity + 3 days` and preserves the original APR
- New deposits are rejected if the vault cannot cover the new interest obligation

## Core User Flows

- `openDeposit(planId, amount)`
- `withdrawAtMaturity(depositId)`
- `earlyWithdraw(depositId)`
- `renewDeposit(depositId, newPlanId)`
- `autoRenewDeposit(depositId)`

## Admin Flows

- `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps)`
- `updatePlan(planId, newAprBps)`
- `enablePlan(planId)` / `disablePlan(planId)`
- `fundVault(amount)` / `withdrawVault(amount)`
- `setFeeReceiver(address)`
- `pause()` / `unpause()`

## Local Development

### Contracts

```bash
npm install
npm run compile
npm test
```

### Local Node and Deployment

```bash
npm run node
npm run deploy:local
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

After deploying locally, update `frontend/src/config.js` with the deployed contract addresses.

## Frontend Demo

The React demo supports:

- MetaMask connection
- Viewing available saving plans
- Opening deposits
- Viewing deposit certificate NFTs for the connected wallet
- Mature withdrawal, early withdrawal, and manual renew
- Admin plan creation, vault funding, and pause controls

## Notes

- Hardhat currently warns that Node `18.20.8` is unsupported. The project compiles and tests successfully in the current environment, but Node `20+` is the safer long-term target.
- The frontend uses static ABI strings in `frontend/src/abi.js`.
