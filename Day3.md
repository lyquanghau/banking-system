# Báo cáo Day 3 - Blockchain Savings Project

## Mục tiêu

Day 3 đẩy dự án từ mức “chạy được” lên mức “demo được”, nghĩa là không chỉ đúng logic mà còn đủ rõ ràng để mentor quan sát và đặt câu hỏi.

## Những gì đã hoàn thành

- Siết lại pause rule để chặn toàn bộ user actions quan trọng:
  - `openDeposit`
  - `withdrawAtMaturity`
  - `earlyWithdraw`
  - `renewDeposit`
  - `autoRenewDeposit`
- Giữ test suite xanh sau khi khóa lại behavior trên.
- Tự động cập nhật `frontend/src/config.js` sau mỗi lần `deploy:local`.
- Xác minh lại flow local end-to-end:
  - chạy `hardhat node`
  - deploy và seed dữ liệu
  - frontend đọc đúng địa chỉ contract
- Làm UI rõ hơn cho demo:
  - wallet state
  - network state
  - plans
  - deposits
  - operator controls

## Kết quả xác minh

- `npm run compile`: pass
- `npm test`: pass
- `npm run deploy:local`: pass
- frontend build: pass

## Điểm mạnh hiện tại

- Logic backend đã khá sát đề bài.
- Frontend đủ để mentor xem end-to-end flow với MetaMask local.
- Dữ liệu demo seed sẵn giúp quá trình review nhanh hơn.

## Việc cần tiếp tục sau Day 3

- Siết thêm safety cho vault withdrawal để admin không rút vào phần reserve của user.
- Tạo coverage report rõ ràng trước khi nộp hoặc demo.
- Giữ tài liệu repo sạch, dễ đọc và không lỗi encoding.
