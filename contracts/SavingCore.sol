// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVaultManager {
    function feeReceiver() external view returns (address);
    function paused() external view returns (bool);
    function availableVaultBalance() external view returns (uint256);
    function payInterest(address to, uint256 amount) external;
}

contract SavingCore is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant DAYS_IN_YEAR = 365;
    uint256 private constant RENEWAL_GRACE_PERIOD = 3 days;

    enum DepositStatus {
        Active,
        Withdrawn,
        Renewed
    }

    struct Plan {
        uint256 planId;
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minAmount;
        uint256 penaltyBps;
        bool isActive;
    }

    struct Deposit {
        uint256 tokenId;
        address owner;
        uint256 planId;
        uint256 principal;
        uint256 expectedInterest;
        uint256 startAt;
        uint256 maturityAt;
        DepositStatus status;
        uint256 renewCount;
        uint256 closedAt;
    }

    IERC20 public immutable token;
    IVaultManager public immutable vaultManager;

    uint256 public nextPlanId = 1;
    uint256 public nextTokenId = 1;
    uint256 public totalPrincipalOutstanding;
    uint256 public totalInterestObligationOutstanding;

    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Deposit) public deposits;
    mapping(address => uint256[]) private ownerDepositIds;

    event PlanCreated(
        uint256 indexed planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minAmount,
        uint256 penaltyBps
    );
    event PlanStatusUpdated(uint256 indexed planId, bool isActive);
    event Deposited(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 expectedInterest,
        uint256 maturityAt
    );
    event Withdrawn(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 principal,
        uint256 interest
    );
    event EarlyWithdrawn(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 principalReturned,
        uint256 penalty
    );
    event Renewed(
        uint256 indexed oldTokenId,
        uint256 indexed newTokenId,
        address indexed owner,
        uint256 principal,
        uint256 oldInterest,
        uint256 newInterest
    );

    error PlanNotFound();
    error PlanInactive();
    error AmountBelowMinimum();
    error VaultInsufficient();
    error DepositNotFound();
    error NotDepositOwner();
    error DepositInactive();
    error DepositNotMatured();
    error RenewNotReady();
    error SystemPaused();
    error SoulboundToken();

    constructor(address initialOwner, address tokenAddress, address vaultManagerAddress)
        ERC721("Saving Deposit Certificate", "SDC")
    {
        token = IERC20(tokenAddress);
        vaultManager = IVaultManager(vaultManagerAddress);
        transferOwnership(initialOwner);
    }

    modifier whenSystemNotPaused() {
        if (vaultManager.paused()) revert SystemPaused();
        _;
    }

    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minAmount,
        uint256 penaltyBps
    ) external onlyOwner returns (uint256 planId) {
        planId = nextPlanId++;
        plans[planId] = Plan({
            planId: planId,
            tenorDays: tenorDays,
            aprBps: aprBps,
            minAmount: minAmount,
            penaltyBps: penaltyBps,
            isActive: true
        });

        emit PlanCreated(planId, tenorDays, aprBps, minAmount, penaltyBps);
    }

    function setPlanStatus(uint256 planId, bool isActive) external onlyOwner {
        Plan storage plan = plans[planId];
        if (plan.planId == 0) revert PlanNotFound();
        plan.isActive = isActive;
        emit PlanStatusUpdated(planId, isActive);
    }

    function previewInterest(uint256 planId, uint256 amount) public view returns (uint256) {
        Plan storage plan = plans[planId];
        if (plan.planId == 0) revert PlanNotFound();
        return (amount * plan.aprBps * plan.tenorDays) / DAYS_IN_YEAR / BPS_DENOMINATOR;
    }

    function getPlan(uint256 planId) external view returns (Plan memory) {
        return plans[planId];
    }

    function getDeposit(uint256 tokenId) external view returns (Deposit memory) {
        return deposits[tokenId];
    }

    function getDepositIdsByOwner(address account) external view returns (uint256[] memory) {
        return ownerDepositIds[account];
    }

    function deposit(uint256 planId, uint256 amount)
        external
        nonReentrant
        whenSystemNotPaused
        returns (uint256 tokenId)
    {
        Plan storage plan = plans[planId];
        if (plan.planId == 0) revert PlanNotFound();
        if (!plan.isActive) revert PlanInactive();
        if (amount < plan.minAmount) revert AmountBelowMinimum();

        uint256 expectedInterest = previewInterest(planId, amount);
        uint256 requiredVaultBalance = totalInterestObligationOutstanding + expectedInterest;
        if (vaultManager.availableVaultBalance() < requiredVaultBalance) revert VaultInsufficient();

        token.safeTransferFrom(msg.sender, address(this), amount);

        tokenId = nextTokenId++;
        uint256 startAt = block.timestamp;
        uint256 maturityAt = startAt + (plan.tenorDays * 1 days);

        deposits[tokenId] = Deposit({
            tokenId: tokenId,
            owner: msg.sender,
            planId: planId,
            principal: amount,
            expectedInterest: expectedInterest,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active,
            renewCount: 0,
            closedAt: 0
        });

        ownerDepositIds[msg.sender].push(tokenId);
        totalPrincipalOutstanding += amount;
        totalInterestObligationOutstanding += expectedInterest;

        _safeMint(msg.sender, tokenId);

        emit Deposited(tokenId, msg.sender, planId, amount, expectedInterest, maturityAt);
    }

    function withdraw(uint256 tokenId) external nonReentrant whenSystemNotPaused {
        Deposit storage userDeposit = deposits[tokenId];
        if (userDeposit.tokenId == 0) revert DepositNotFound();
        if (userDeposit.owner != msg.sender) revert NotDepositOwner();
        if (userDeposit.status != DepositStatus.Active) revert DepositInactive();

        userDeposit.status = DepositStatus.Withdrawn;
        userDeposit.closedAt = block.timestamp;

        totalPrincipalOutstanding -= userDeposit.principal;
        totalInterestObligationOutstanding -= userDeposit.expectedInterest;

        if (block.timestamp >= userDeposit.maturityAt) {
            uint256 principal = userDeposit.principal;
            uint256 interest = userDeposit.expectedInterest;

            token.safeTransfer(msg.sender, principal);
            vaultManager.payInterest(msg.sender, interest);

            emit Withdrawn(tokenId, msg.sender, principal, interest);
            return;
        }

        Plan storage plan = plans[userDeposit.planId];
        uint256 penalty = (userDeposit.principal * plan.penaltyBps) / BPS_DENOMINATOR;
        uint256 principalReturned = userDeposit.principal - penalty;

        token.safeTransfer(msg.sender, principalReturned);
        token.safeTransfer(vaultManager.feeReceiver(), penalty);

        emit EarlyWithdrawn(tokenId, msg.sender, principalReturned, penalty);
    }

    function renew(uint256 tokenId)
        external
        nonReentrant
        whenSystemNotPaused
        returns (uint256 newTokenId)
    {
        Deposit storage oldDeposit = deposits[tokenId];
        if (oldDeposit.tokenId == 0) revert DepositNotFound();
        if (oldDeposit.owner != msg.sender) revert NotDepositOwner();
        if (oldDeposit.status != DepositStatus.Active) revert DepositInactive();
        if (block.timestamp < oldDeposit.maturityAt + RENEWAL_GRACE_PERIOD) revert RenewNotReady();

        Plan storage plan = plans[oldDeposit.planId];
        if (!plan.isActive) revert PlanInactive();

        uint256 newExpectedInterest = previewInterest(oldDeposit.planId, oldDeposit.principal);
        uint256 requiredVaultBalance = totalInterestObligationOutstanding + newExpectedInterest;
        if (vaultManager.availableVaultBalance() < requiredVaultBalance) revert VaultInsufficient();

        oldDeposit.status = DepositStatus.Renewed;
        oldDeposit.closedAt = block.timestamp;

        totalPrincipalOutstanding -= oldDeposit.principal;
        totalInterestObligationOutstanding -= oldDeposit.expectedInterest;

        vaultManager.payInterest(msg.sender, oldDeposit.expectedInterest);

        newTokenId = nextTokenId++;
        uint256 startAt = block.timestamp;
        uint256 maturityAt = startAt + (plan.tenorDays * 1 days);

        deposits[newTokenId] = Deposit({
            tokenId: newTokenId,
            owner: msg.sender,
            planId: oldDeposit.planId,
            principal: oldDeposit.principal,
            expectedInterest: newExpectedInterest,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active,
            renewCount: oldDeposit.renewCount + 1,
            closedAt: 0
        });

        ownerDepositIds[msg.sender].push(newTokenId);
        totalPrincipalOutstanding += oldDeposit.principal;
        totalInterestObligationOutstanding += newExpectedInterest;

        _safeMint(msg.sender, newTokenId);

        emit Renewed(
            tokenId,
            newTokenId,
            msg.sender,
            oldDeposit.principal,
            oldDeposit.expectedInterest,
            newExpectedInterest
        );
    }

    function approve(address, uint256) public pure override {
        revert SoulboundToken();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundToken();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    function safeTransferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SoulboundToken();
    }
}
