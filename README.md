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
- Vault withdrawals are limited to free liquidity above outstanding interest obligations

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

### 1. Install and test contracts

```bash
npm install
npm run compile
npm test
npm run coverage
```

### 2. Start local node and deploy demo data

```bash
npm run node
npm run deploy:local
```

`deploy:local` seeds demo data and automatically updates `frontend/src/config.js` with the
latest contract addresses plus demo accounts.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. MetaMask local network

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Add the local network manually in MetaMask
- Import accounts from the `npm run node` output
- Recommended demo wallets:
  - `Admin`: creates plans, funds vault, pauses the system
  - `Alice` / `Bob`: open deposits, withdraw, renew, auto-renew
- No real wallet funds are needed; use only Hardhat local accounts imported into MetaMask

## Frontend Demo

The React demo supports:

- MetaMask connection
- Viewing available saving plans
- Opening deposits
- Viewing deposit certificate NFTs for the connected wallet
- Mature withdrawal, early withdrawal, and manual renew
- Auto-renew after `maturity + 3 days`
- Admin plan creation, vault funding, and pause controls
- Demo account and local network hints directly in the UI

## Suggested Demo Script

Record a short 3-5 minute walkthrough in this order:

1. Connect MetaMask to `localhost:31337`
2. Show the seeded plans and current vault balance
3. Open a deposit as Alice or Bob
4. Show one withdrawal flow:
   - early withdraw, or
   - mature withdraw after time travel/local setup
5. Show one renew flow:
   - manual renew after maturity, or
   - auto-renew after `maturity + 3 days`
6. Switch to Admin and pause/unpause the system

## Assumptions

- Principal remains in `SavingCore`; interest remains in `VaultManager`
- APR and early-withdraw penalty are snapshotted when a deposit is opened
- Auto-renew preserves the original APR snapshot and is only available after `maturity + 3 days`
- While paused, user actions are blocked: open deposit, withdraw, and renew

## Notes

- Hardhat currently warns that Node `18.20.8` is unsupported. The project compiles and tests successfully in the current environment, but Node `20+` is the safer long-term target.
- The frontend uses static ABI strings in `frontend/src/abi.js`.
- Run `npm run coverage` before submission to generate a contract coverage report for mentor review.
