# Blockchain Savings System

This project implements an on-chain term deposit system that behaves like a simplified blockchain savings product. Users deposit a test stablecoin into a smart contract for a fixed term, earn simple interest at maturity, can exit early with a penalty, and can renew or auto-renew deposits under predefined business rules.

The system is built around three contracts plus a React frontend:

- `MockUSDC` provides a 6-decimal ERC20 token for testing.
- `SavingCore` manages saving plans, deposit certificates, principal accounting, withdrawals, and renewals.
- `VaultManager` holds the separate interest reserve, fee receiver configuration, and pause controls.
- The frontend connects through MetaMask, reads on-chain state, and submits user/admin transactions.

## Architecture Overview

### `MockUSDC`

- Mintable ERC20 token used only for testing and demos
- Uses 6 decimals to resemble USDC-style token units

### `SavingCore`

- Stores saving plans created by the admin
- Accepts user principal deposits
- Mints one ERC721 certificate per deposit
- Snapshots APR and penalty at deposit-open time
- Handles mature withdrawal, early withdrawal, manual renew, and auto-renew
- Tracks principal outstanding and interest obligations

### `VaultManager`

- Holds the isolated reserve used to pay interest
- Stores `feeReceiver` for early-withdraw penalties
- Lets admin fund the vault and withdraw only free liquidity
- Provides pause/unpause emergency controls

### Frontend

- Connects MetaMask and reads plan/deposit data from chain
- Supports both user flows and admin operations
- Shows confirmation popups before eligible deposit actions
- Uses addresses from `frontend/src/config.js`

## Core Business Rules

- User principal stays in `SavingCore`.
- Interest reserve stays in `VaultManager` until payout.
- APR and early-withdraw penalty are snapshotted when a deposit is opened.
- Existing deposits are not affected by later plan APR updates.
- Early withdrawal pays `principal - penalty` and zero interest.
- Penalties are sent to `feeReceiver`.
- New deposits are rejected if the vault cannot cover the additional interest obligation.
- Vault withdrawals are limited to liquidity above outstanding reserved interest obligations.
- Manual renew compounds earned interest into the next principal.
- Auto-renew becomes available after `maturity + 3 days` and preserves the original APR snapshot.
- When paused, user-sensitive actions such as open deposit, withdraw, and renew are blocked.

## Project Structure

```text
BankingSystem/
|-- contracts/
|   |-- MockUSDC.sol
|   |-- SavingCore.sol
|   `-- VaultManager.sol
|-- test/
|   `-- SavingSystem.test.js
|-- scripts/
|   |-- deploy.js
|   |-- autoRenewBot.js
|   `-- loadEnv.js
|-- deploy/
|   |-- 1-deploy-mockusdc.ts
|   |-- 2-deploy-vaultmanager.ts
|   |-- 3-deploy-savingcore.ts
|   |-- 4-init-testnet.ts
|   |-- 5-sync-frontend-config.ts
|   |-- 6-deploy-testnet-all.ts
|   `-- 7-mint-test-users.ts
|-- deployments/
|   `-- sepolia.json
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- abi.js
|   |   |-- config.js
|   |   `-- styles.css
|   |-- package.json
|   `-- vite.config.js
|-- hardhat.config.js
|-- package.json
|-- jump31days.ps1
`-- jump33days.ps1
```

## Prerequisites

- Node.js `20+` recommended
- `npm`
- MetaMask browser extension

Note: the repo supports both local Hardhat demos on chain `31337` and Sepolia testnet deployment flows.

## Local Development

### 1. Install contract dependencies

```bash
npm install
```

### 2. Compile contracts

```bash
npm run compile
```

### 3. Run tests

```bash
npm test
```

Current contract suite covers the main flows:

- plan creation and validation
- deposit open constraints
- mature withdrawal
- early withdrawal
- manual renew
- auto-renew
- vault reserve safety
- pause behavior

### 4. Start a local Hardhat node

```bash
npm run node
```

### 5. Deploy local demo data

In a second terminal:

```bash
npm run deploy:local
```

This script:

- deploys `MockUSDC`, `VaultManager`, and `SavingCore`
- mints demo balances
- funds the interest vault
- creates sample plans
- updates `frontend/src/config.js` with fresh local addresses

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 7. Configure MetaMask for local chain

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Import test accounts from the `npm run node` output

Recommended local demo wallets:

- `Admin`: create plans, manage vault, pause/unpause
- `Alice` / `Bob`: open deposits, withdraw, renew, auto-renew

## Testnet Deployment

The repo includes a Sepolia-ready deployment flow.

### Full testnet deploy

In Windows CMD:

```cmd
cd /d D:\Blockchain\final\BankingSystem && set "DEPLOY_TARGET_NETWORK=sepolia" && npm run deploy:testnet:all
```

This flow:

- deploys `MockUSDC`
- deploys `VaultManager`
- deploys `SavingCore`
- initializes testnet balances, vault funding, and sample plans
- syncs `frontend/src/config.js` to the deployed network

### Sync frontend only

```cmd
cd /d D:\Blockchain\final\BankingSystem && set "DEPLOY_TARGET_NETWORK=sepolia" && npm run deploy:testnet:sync-frontend
```

### Mint test users

```cmd
cd /d D:\Blockchain\final\BankingSystem && set "DEPLOY_TARGET_NETWORK=sepolia" && npm run deploy:testnet:mint-users
```

Testnet deployment depends on valid `.env` secrets such as:

- `SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `FEE_RECEIVER_ADDRESS`
- optional explorer API keys

## Frontend Capabilities

### User Features

- Connect MetaMask
- View available saving plans
- Open a deposit
- View deposit certificate positions
- Settle at maturity
- Exit early with penalty
- Manually renew into another plan
- Trigger auto-renew after grace period
- Review confirmation popups before eligible deposit actions

### Admin Features

- Create new saving plans
- Update plan APR
- Enable or disable plans
- Fund the interest vault
- Withdraw free liquidity from the vault
- Update `feeReceiver`
- Pause or resume the system

Admin visibility is based on on-chain ownership of `SavingCore` or `VaultManager`, not only on hardcoded demo addresses.

## Suggested Demo Flow

Use this sequence for a short mentor demo:

1. Connect MetaMask on Sepolia or local Hardhat, depending on the flow you want to show.
2. Show available plans and current vault balance.
3. Open a deposit as a user.
4. Show one user action:
   - early withdrawal on Sepolia, or
   - mature withdrawal after local time travel
5. Show one renew action:
   - manual renew after maturity, or
   - auto-renew after `maturity + 3 days`
6. Switch to the admin wallet.
7. Show plan management, vault funding, and pause/unpause.

Helpful local test scripts:

- `.\jump31days.ps1` moves the local Hardhat clock forward by 31 days and mines one block.
- `.\jump33days.ps1` moves the local Hardhat clock forward by 33 days and mines one block.

## Current Deployment Status

- The project is ready for local demo on Hardhat chain `31337` and testnet demo on Sepolia.
- Local deployment is available through `npm run deploy:local`.
- Testnet deployment scripts are included for Sepolia and Amoy:
  - `deploy:testnet:mockusdc`
  - `deploy:testnet:vaultmanager`
  - `deploy:testnet:savingcore`
  - `deploy:testnet:init`
  - `deploy:testnet:sync-frontend`
  - `deploy:testnet:all`
  - `deploy:testnet:mint-users`
- Frontend contract addresses are populated automatically by the local deploy script and can be synced to supported testnets.
- `hardhat.config.js` includes `localhost`, `sepolia`, and `amoy` network configuration.

## Known Limitations

- `MockUSDC` is for testing only and is not a real stablecoin integration.
- Auto-renew is automatic from the user perspective, but still requires an external caller or bot to send the transaction.
- Testnet deployment support is present, but operational readiness depends on correct `.env` secrets and funded deployer wallets.
- Maturity and auto-renew timing are expressed in whole days on-chain, so very short testnet tenors are not supported without contract changes.

## Notes

- The frontend uses ABI strings from `frontend/src/abi.js`.
- Active contract addresses and supported chain configuration are stored in `frontend/src/config.js`.
- This project focuses on correct business-rule separation between user principal and system interest reserve.
