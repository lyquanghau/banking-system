# Báo cáo Day 2 - Blockchain Savings Project

## Mục tiêu

Day 2 tập trung vào việc đưa code gần hơn với assignment chính thức, giảm lệch spec và chuẩn bị bộ demo local có thể dùng ngay.

## Những gì đã hoàn thành

- Chuẩn hóa interface contract theo đề bài:
  - `openDeposit`
  - `withdrawAtMaturity`
  - `earlyWithdraw`
  - `renewDeposit`
  - `autoRenewDeposit`
- Hoàn thiện snapshot APR, penalty và tenor tại lúc mở deposit.
- Bổ sung `maxDeposit`, `updatePlan`, `enablePlan`, `disablePlan`, `withdrawVault`.
- Manual renew đã compound interest vào principal mới.
- Auto renew đã giữ nguyên APR snapshot cũ và chỉ cho phép sau `maturity + 3 days`.
- Frontend đã đồng bộ với ABI và flow mới.
- Script `deploy:local` đã seed sẵn token, vault và 2 plan demo.

## Kiểm thử và xác minh

- Bộ test đã cover các flow chính:
  - create plan
  - open deposit
  - mature withdraw
  - early withdraw
  - manual renew
  - auto renew
  - pause
  - unauthorized vault payout
- Kết quả xác minh tại thời điểm chốt ngày:
  - `npm run compile`: pass
  - `npm test`: pass
  - frontend build: pass

## Ghi chú kỹ thuật

- Node hiện tại là `18.20.8`; Hardhat vẫn chạy được nhưng `20+` an toàn hơn về lâu dài.
- Dữ liệu local demo được seed sẵn để mentor có thể vào thẳng flow mà không phải setup tay nhiều bước.

## Trạng thái cuối ngày

- Backend đã bám assignment tốt hơn đáng kể.
- Frontend đã đủ để trình diễn các flow chính.
- Môi trường local demo đã gọn hơn và dễ lặp lại hơn.
