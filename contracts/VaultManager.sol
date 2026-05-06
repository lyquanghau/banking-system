// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISavingCoreAccounting {
    function totalInterestObligationOutstanding() external view returns (uint256);
}

contract VaultManager is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public savingCore;
    address public feeReceiver;

    event SavingCoreSet(address indexed savingCore);
    event FeeReceiverSet(address indexed feeReceiver);
    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event InterestPaid(address indexed to, uint256 amount);

    error InsufficientFreeLiquidity();
    error UnauthorizedCore();
    error ZeroAddress();

    modifier onlySavingCore() {
        if (msg.sender != savingCore) revert UnauthorizedCore();
        _;
    }

    constructor(address initialOwner, address tokenAddress, address initialFeeReceiver)
    {
        if (tokenAddress == address(0) || initialFeeReceiver == address(0)) revert ZeroAddress();
        token = IERC20(tokenAddress);
        feeReceiver = initialFeeReceiver;
        transferOwnership(initialOwner);
    }

    function setSavingCore(address core) external onlyOwner {
        if (core == address(0)) revert ZeroAddress();
        savingCore = core;
        emit SavingCoreSet(core);
    }

    function setFeeReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        feeReceiver = receiver;
        emit FeeReceiverSet(receiver);
    }

    function fundVault(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    function withdrawVault(uint256 amount) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        uint256 reserved = savingCore == address(0)
            ? 0
            : ISavingCoreAccounting(savingCore).totalInterestObligationOutstanding();
        uint256 freeLiquidity = balance > reserved ? balance - reserved : 0;

        if (amount > freeLiquidity) revert InsufficientFreeLiquidity();
        token.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    function payInterest(address to, uint256 amount) external onlySavingCore whenNotPaused {
        token.safeTransfer(to, amount);
        emit InterestPaid(to, amount);
    }

    function availableVaultBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
