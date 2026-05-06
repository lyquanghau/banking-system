# Báo cáo Day 1 - Blockchain Savings Project

## Mục tiêu

Day 1 dùng để hiểu đúng đề bài, chốt kiến trúc và khóa các business rule quan trọng trước khi đi sâu vào implementation.

## Những gì đã chốt

- Hệ thống có 3 contract chính:
  - `MockUSDC`: token test ERC20, `6 decimals`
  - `VaultManager`: giữ quỹ trả lãi và quyền admin
  - `SavingCore`: quản lý plan, deposit, NFT certificate, withdraw và renew
- Principal và interest là hai dòng tiền tách biệt:
  - principal nằm ở `SavingCore`
  - interest reserve nằm ở `VaultManager`
- APR và penalty phải được snapshot tại thời điểm mở deposit.
- Early withdraw không trả lãi; penalty phải chuyển về `feeReceiver`.
- Mọi nghĩa vụ trả lãi mới phải được kiểm tra khả năng cover từ vault trước khi chấp nhận.

## Data model và flow

- `Plan` gồm: tenor, APR, min/max deposit, early-withdraw penalty, trạng thái enable.
- `Deposit` gồm: owner, principal, plan, APR snapshot, penalty snapshot, tenor snapshot, maturity, status.
- Trạng thái deposit dùng các mốc rõ ràng: `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed`.
- Renew được hiểu là đóng chu kỳ cũ và mở chu kỳ mới, không tái sử dụng record cũ.

## Invariant đã xác định

- `SavingCore.balance >= totalPrincipalOutstanding`
- `VaultManager.balance >= totalInterestObligationOutstanding`
- Tổng tài sản hệ thống phải lớn hơn hoặc bằng tổng nghĩa vụ principal + interest

## Trạng thái cuối ngày

- Đã hiểu và chốt được logic tài chính cốt lõi của bài.
- Đã có khung kiến trúc đủ rõ để chuyển sang implementation.
- Đã có danh sách test case cần cover cho deposit, withdraw, renew, pause và solvency.
