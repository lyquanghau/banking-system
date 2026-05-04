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
    uint256 private constant SECONDS_PER_DAY = 1 days;
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant AUTO_RENEW_GRACE_PERIOD = 3 days;

    enum DepositStatus {
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    struct Plan {
        uint256 planId;
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit;
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    struct Deposit {
        uint256 depositId;
        address owner;
        uint256 planId;
        uint256 principal;
        uint256 aprBpsAtOpen;
        uint256 penaltyBpsAtOpen;
        uint256 tenorDaysAtOpen;
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
    uint256 public nextDepositId = 1;
    uint256 public totalPrincipalOutstanding;
    uint256 public totalInterestObligationOutstanding;

    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Deposit) public deposits;
    mapping(address => uint256[]) private ownerDepositIds;
    mapping(uint256 => uint256) private ownerDepositIndex;

    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event PlanStatusUpdated(uint256 indexed planId, bool enabled);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 newPlanId
    );

    error AmountAboveMaximum();
    error AmountBelowMinimum();
    error DepositInactive();
    error DepositNotFound();
    error DepositNotMatured();
    error GracePeriodNotElapsed();
    error InvalidApr();
    error InvalidPenalty();
    error InvalidPlanConfig();
    error InvalidTenor();
    error NotDepositOwner();
    error PlanDisabled();
    error PlanNotFound();
    error SystemPaused();
    error VaultInsufficient();

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
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner returns (uint256 planId) {
        _validatePlanConfig(tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps);

        planId = nextPlanId++;
        plans[planId] = Plan({
            planId: planId,
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        emit PlanCreated(planId, tenorDays, aprBps);
    }

    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        if (newAprBps > BPS_DENOMINATOR) revert InvalidApr();

        Plan storage plan = _getExistingPlan(planId);
        plan.aprBps = newAprBps;

        emit PlanUpdated(planId, newAprBps);
    }

    function enablePlan(uint256 planId) external onlyOwner {
        Plan storage plan = _getExistingPlan(planId);
        plan.enabled = true;
        emit PlanStatusUpdated(planId, true);
    }

    function disablePlan(uint256 planId) external onlyOwner {
        Plan storage plan = _getExistingPlan(planId);
        plan.enabled = false;
        emit PlanStatusUpdated(planId, false);
    }

    function previewPlanInterest(uint256 planId, uint256 amount) external view returns (uint256) {
        Plan storage plan = _getExistingPlan(planId);
        _validateDepositAmount(plan, amount);
        return _calculateInterest(amount, plan.aprBps, plan.tenorDays);
    }

    function getPlan(uint256 planId) external view returns (Plan memory) {
        return _getExistingPlan(planId);
    }

    function getDeposit(uint256 depositId) external view returns (Deposit memory) {
        Deposit memory userDeposit = deposits[depositId];
        if (userDeposit.depositId == 0) revert DepositNotFound();
        return userDeposit;
    }

    function getDepositIdsByOwner(address account) external view returns (uint256[] memory) {
        return ownerDepositIds[account];
    }

    function openDeposit(uint256 planId, uint256 amount)
        external
        nonReentrant
        whenSystemNotPaused
        returns (uint256 depositId)
    {
        Plan storage plan = _getEnabledPlan(planId);
        _validateDepositAmount(plan, amount);

        uint256 expectedInterest = _calculateInterest(amount, plan.aprBps, plan.tenorDays);
        _ensureVaultCanCoverAdditionalObligation(expectedInterest);

        token.safeTransferFrom(msg.sender, address(this), amount);

        depositId = _createDeposit(
            msg.sender,
            planId,
            amount,
            plan.aprBps,
            plan.earlyWithdrawPenaltyBps,
            plan.tenorDays,
            0
        );
    }

    function withdrawAtMaturity(uint256 depositId)
        external
        nonReentrant
        whenSystemNotPaused
    {
        Deposit storage userDeposit = _getActiveDepositOwnedBySender(depositId);
        if (block.timestamp < userDeposit.maturityAt) revert DepositNotMatured();

        uint256 principal = userDeposit.principal;
        uint256 interest = userDeposit.expectedInterest;

        _closeDeposit(userDeposit, DepositStatus.Withdrawn);

        token.safeTransfer(msg.sender, principal);
        vaultManager.payInterest(msg.sender, interest);

        emit Withdrawn(depositId, msg.sender, principal, interest, false);
    }

    function earlyWithdraw(uint256 depositId)
        external
        nonReentrant
        whenSystemNotPaused
    {
        Deposit storage userDeposit = _getActiveDepositOwnedBySender(depositId);
        if (block.timestamp >= userDeposit.maturityAt) revert DepositNotMatured();

        uint256 penalty = (userDeposit.principal * userDeposit.penaltyBpsAtOpen) / BPS_DENOMINATOR;
        uint256 principalReturned = userDeposit.principal - penalty;

        _closeDeposit(userDeposit, DepositStatus.Withdrawn);

        token.safeTransfer(msg.sender, principalReturned);
        if (penalty > 0) {
            token.safeTransfer(vaultManager.feeReceiver(), penalty);
        }

        emit Withdrawn(depositId, msg.sender, principalReturned, 0, true);
    }

    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        nonReentrant
        whenSystemNotPaused
        returns (uint256 newDepositId)
    {
        Deposit storage oldDeposit = _getActiveDepositOwnedBySender(depositId);
        if (block.timestamp < oldDeposit.maturityAt) revert DepositNotMatured();

        Plan storage newPlan = _getEnabledPlan(newPlanId);

        uint256 newPrincipal = oldDeposit.principal + oldDeposit.expectedInterest;
        _validateDepositAmount(newPlan, newPrincipal);

        uint256 newExpectedInterest =
            _calculateInterest(newPrincipal, newPlan.aprBps, newPlan.tenorDays);
        _ensureVaultCanCoverAdditionalObligation(newExpectedInterest);

        uint256 renewCount = oldDeposit.renewCount + 1;
        uint256 oldInterest = oldDeposit.expectedInterest;
        address depositOwner = ownerOf(depositId);

        _closeDeposit(oldDeposit, DepositStatus.ManualRenewed);
        vaultManager.payInterest(address(this), oldInterest);

        newDepositId = _createDeposit(
            depositOwner,
            newPlanId,
            newPrincipal,
            newPlan.aprBps,
            newPlan.earlyWithdrawPenaltyBps,
            newPlan.tenorDays,
            renewCount
        );

        emit Renewed(depositId, newDepositId, newPrincipal, newPlanId);
    }

    function autoRenewDeposit(uint256 depositId)
        external
        nonReentrant
        whenSystemNotPaused
        returns (uint256 newDepositId)
    {
        Deposit storage oldDeposit = deposits[depositId];
        if (oldDeposit.depositId == 0) revert DepositNotFound();
        if (oldDeposit.status != DepositStatus.Active) revert DepositInactive();
        if (block.timestamp < oldDeposit.maturityAt + AUTO_RENEW_GRACE_PERIOD) {
            revert GracePeriodNotElapsed();
        }

        uint256 newPrincipal = oldDeposit.principal + oldDeposit.expectedInterest;
        uint256 newExpectedInterest = _calculateInterest(
            newPrincipal, oldDeposit.aprBpsAtOpen, oldDeposit.tenorDaysAtOpen
        );
        _ensureVaultCanCoverAdditionalObligation(newExpectedInterest);

        uint256 renewCount = oldDeposit.renewCount + 1;
        uint256 oldInterest = oldDeposit.expectedInterest;
        address depositOwner = ownerOf(depositId);
        uint256 planId = oldDeposit.planId;

        _closeDeposit(oldDeposit, DepositStatus.AutoRenewed);
        vaultManager.payInterest(address(this), oldInterest);

        newDepositId = _createDeposit(
            depositOwner,
            planId,
            newPrincipal,
            oldDeposit.aprBpsAtOpen,
            oldDeposit.penaltyBpsAtOpen,
            oldDeposit.tenorDaysAtOpen,
            renewCount
        );

        emit Renewed(depositId, newDepositId, newPrincipal, planId);
    }

    function _createDeposit(
        address owner,
        uint256 planId,
        uint256 principal,
        uint256 aprBpsAtOpen,
        uint256 penaltyBpsAtOpen,
        uint256 tenorDaysAtOpen,
        uint256 renewCount
    ) internal returns (uint256 depositId) {
        depositId = nextDepositId++;

        uint256 startAt = block.timestamp;
        uint256 maturityAt = startAt + (tenorDaysAtOpen * SECONDS_PER_DAY);
        uint256 expectedInterest =
            _calculateInterest(principal, aprBpsAtOpen, tenorDaysAtOpen);

        deposits[depositId] = Deposit({
            depositId: depositId,
            owner: owner,
            planId: planId,
            principal: principal,
            aprBpsAtOpen: aprBpsAtOpen,
            penaltyBpsAtOpen: penaltyBpsAtOpen,
            tenorDaysAtOpen: tenorDaysAtOpen,
            expectedInterest: expectedInterest,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active,
            renewCount: renewCount,
            closedAt: 0
        });

        totalPrincipalOutstanding += principal;
        totalInterestObligationOutstanding += expectedInterest;

        _safeMint(owner, depositId);

        emit DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen);
    }

    function _closeDeposit(Deposit storage userDeposit, DepositStatus nextStatus) internal {
        userDeposit.status = nextStatus;
        userDeposit.closedAt = block.timestamp;

        totalPrincipalOutstanding -= userDeposit.principal;
        totalInterestObligationOutstanding -= userDeposit.expectedInterest;
    }

    function _calculateInterest(uint256 principal, uint256 aprBps, uint256 tenorDays)
        internal
        pure
        returns (uint256)
    {
        uint256 tenorSeconds = tenorDays * SECONDS_PER_DAY;
        return (principal * aprBps * tenorSeconds) / (SECONDS_PER_YEAR * BPS_DENOMINATOR);
    }

    function _ensureVaultCanCoverAdditionalObligation(uint256 newExpectedInterest) internal view {
        uint256 requiredVaultBalance = totalInterestObligationOutstanding + newExpectedInterest;
        if (vaultManager.availableVaultBalance() < requiredVaultBalance) revert VaultInsufficient();
    }

    function _validatePlanConfig(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) internal pure {
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps > BPS_DENOMINATOR) revert InvalidApr();
        if (earlyWithdrawPenaltyBps > BPS_DENOMINATOR) revert InvalidPenalty();
        if (maxDeposit != 0 && maxDeposit < minDeposit) revert InvalidPlanConfig();
    }

    function _validateDepositAmount(Plan storage plan, uint256 amount) internal view {
        if (amount < plan.minDeposit) revert AmountBelowMinimum();
        if (plan.maxDeposit != 0 && amount > plan.maxDeposit) revert AmountAboveMaximum();
    }

    function _getExistingPlan(uint256 planId) internal view returns (Plan storage plan) {
        plan = plans[planId];
        if (plan.planId == 0) revert PlanNotFound();
    }

    function _getEnabledPlan(uint256 planId) internal view returns (Plan storage plan) {
        plan = _getExistingPlan(planId);
        if (!plan.enabled) revert PlanDisabled();
    }

    function _getActiveDepositOwnedBySender(uint256 depositId)
        internal
        view
        returns (Deposit storage userDeposit)
    {
        userDeposit = deposits[depositId];
        if (userDeposit.depositId == 0) revert DepositNotFound();
        if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();
        if (userDeposit.status != DepositStatus.Active) revert DepositInactive();
    }

    function _addDepositToOwner(address owner, uint256 depositId) internal {
        ownerDepositIndex[depositId] = ownerDepositIds[owner].length;
        ownerDepositIds[owner].push(depositId);
    }

    function _removeDepositFromOwner(address owner, uint256 depositId) internal {
        uint256[] storage depositIds = ownerDepositIds[owner];
        uint256 index = ownerDepositIndex[depositId];
        uint256 lastIndex = depositIds.length - 1;

        if (index != lastIndex) {
            uint256 lastDepositId = depositIds[lastIndex];
            depositIds[index] = lastDepositId;
            ownerDepositIndex[lastDepositId] = index;
        }

        depositIds.pop();
        delete ownerDepositIndex[depositId];
    }

    function _afterTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal
        override
    {
        super._afterTokenTransfer(from, to, firstTokenId, batchSize);

        if (batchSize != 1) {
            return;
        }

        if (from != address(0)) {
            _removeDepositFromOwner(from, firstTokenId);
        }

        if (to != address(0)) {
            _addDepositToOwner(to, firstTokenId);
            deposits[firstTokenId].owner = to;
        }
    }
}
