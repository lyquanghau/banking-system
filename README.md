# Blockchain Savings System

This project implements an on-chain term deposit system that behaves like a simplified blockchain savings product. Users deposit a test stablecoin into a smart contract for a fixed term, earn simple interest at maturity, can exit early with a penalty, and can renew or auto-renew deposits under predefined business rules.

The system is built around three contracts plus a React frontend:

- `MockUSDC` provides a 6-decimal ERC20 token for testing.
- `SavingCore` manages saving plans, deposit certificates, principal accounting, withdrawals, and renewals.
- `VaultManager` holds the separate interest reserve, fee receiver configuration, and pause controls.
- The frontend connects through MetaMask, reads on-chain state, and submits user/admin transactions.

## Architecture Overview

### `MockUSDC`

- Mintable ERC20 token used only for testing and local demos
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
├─ contracts/
│  ├─ MockUSDC.sol          # Test ERC20 token with 6 decimals
│  ├─ SavingCore.sol        # Savings logic, principal accounting, ERC721 certificates
│  └─ VaultManager.sol      # Interest vault, fee receiver, pause controls
├─ test/
│  └─ SavingSystem.test.js  # Hardhat test suite for contract flows and invariants
├─ scripts/
│  └─ deploy.js             # Local deployment and frontend config bootstrap
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx            # Main React dashboard for user and admin flows
│  │  ├─ abi.js             # Frontend ABI definitions
│  │  ├─ config.js          # Contract addresses and chain config
│  │  └─ styles.css         # Frontend styling
│  ├─ package.json          # Frontend scripts and dependencies
│  └─ vite.config.js        # Vite configuration
├─ coverage.json            # Existing coverage artifact
├─ hardhat.config.js        # Hardhat compiler and project configuration
├─ package.json             # Contract-side scripts and dependencies
├─ Project-Explanation-Notes.md  # Project explanation notes for demo preparation
├─ jump31days.ps1           # Helper script for maturity testing on local Hardhat
└─ jump33days.ps1           # Helper script for auto-renew testing on local Hardhat
```

## Prerequisites

- Node.js `20+` recommended
- `npm`
- MetaMask browser extension
- A local Hardhat node for the current demo workflow

Note: the current repo is configured primarily for local development on chain `31337`.

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

Leave this running in its own terminal.

### 5. Deploy local demo data

Open a second terminal in the same folder:

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

Admin visibility is based on on-chain ownership of `SavingCore` or `VaultManager`, not only on hardcoded local demo addresses.

## Suggested Demo Flow

Use this sequence for a short mentor demo:

1. Connect MetaMask to `localhost:31337`.
2. Show the available plans and current vault balance.
3. Open a deposit as `Alice` or `Bob`.
4. Show one user action:
   - early withdrawal, or
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

- The project is ready for local demo on Hardhat chain `31337`.
- Local deployment is available through `npm run deploy:local`.
- Testnet deployment scripts are also included for Sepolia and Amoy:
  - `deploy:testnet:mockusdc`
  - `deploy:testnet:vaultmanager`
  - `deploy:testnet:savingcore`
  - `deploy:testnet:init`
  - `deploy:testnet:sync-frontend`
  - `deploy:testnet:all`
  - `deploy:testnet:mint-users`
- Frontend contract addresses are populated automatically for local runs.
- `hardhat.config.js` includes `localhost`, `sepolia`, and `amoy` network configuration.
- Testnet deployment still depends on valid RPC URLs, deployer private key, and optional explorer API keys in environment variables.

## Known Limitations

- `MockUSDC` is for testing only and is not a real stablecoin integration.
- Auto-renew is automatic from the user perspective, but still requires an external caller or bot to send the transaction.
- Testnet deployment support is present, but operational readiness depends on correct `.env` secrets and funded deployer wallets.
- `coverage.json` exists in the repo, but coverage tooling may still depend on local environment behavior when rerun.

## Notes

- The frontend uses ABI strings from `frontend/src/abi.js`.
- Local contract addresses are stored in `frontend/src/config.js`.
- This project focuses on correct business-rule separation between user principal and system interest reserve.
