# Báo cáo Day 1 - Blockchain Savings Project

## 1. Mục tiêu của Day 1

Mục tiêu của Day 1 là hiểu đúng đề bài, chốt logic tài chính, xác định kiến trúc hệ thống và chuẩn bị nền tảng kỹ thuật để có thể bắt đầu implement an toàn từ các ngày tiếp theo.

Theo kế hoạch ban đầu, Day 1 tập trung vào:

- phân tích đề bài
- chốt kiến trúc contract
- chốt luồng tiền
- chốt cấu trúc dữ liệu
- chốt trạng thái deposit
- chốt các invariant kế toán
- xác định edge cases cần test

## 2. Những việc đã hoàn thành trong hôm nay

### 2.1. Đã phân tích và chốt lại đề bài

Đã rà soát đầy đủ yêu cầu của bài toán term deposit trên blockchain, gồm 3 thành phần chính:

- `SavingCore`
- `VaultManager`
- `MockUSDC`

Đã xác định đây là một hệ thống tài chính theo mô hình gần ngân hàng, không phải staking demo đơn giản.

### 2.2. Đã chốt nguyên tắc tài chính cốt lõi

Các nguyên tắc quan trọng đã được khóa:

- principal và interest phải tách biệt hoàn toàn
- principal được giữ trong `SavingCore`
- interest chỉ được giữ và trả từ `VaultManager`
- early withdraw không có interest
- penalty từ early withdraw phải chuyển về `feeReceiver`
- hệ thống không được tạo nghĩa vụ lãi mới nếu vault không đủ khả năng thanh toán

### 2.3. Đã chốt kiến trúc hệ thống

Kiến trúc hiện tại đã được xác định như sau:

- `MockUSDC`: token test chuẩn ERC20 với `6 decimals`
- `VaultManager`: quản lý quỹ trả lãi, `feeReceiver`, trạng thái pause
- `SavingCore`: quản lý saving plan, deposit, NFT, withdraw, renew

Ngoài ra đã chốt thêm một quyết định kỹ thuật cho phiên bản đầu:

- NFT deposit là dạng soulbound, không cho transfer để tránh phức tạp hóa quyền sở hữu

### 2.4. Đã chốt cấu trúc dữ liệu chính

Đã xác định các dữ liệu cốt lõi cần có:

`Plan`
- `planId`
- `tenorDays`
- `aprBps`
- `minAmount`
- `penaltyBps`
- `isActive`

`Deposit`
- `tokenId`
- `owner`
- `planId`
- `principal`
- `expectedInterest`
- `startAt`
- `maturityAt`
- `status`
- `renewCount`
- `closedAt`

`DepositStatus`
- `Active`
- `Withdrawn`
- `Renewed`

### 2.5. Đã chốt luồng tiền

Đã mô tả và áp dụng rõ 3 flow tài chính quan trọng:

`Deposit`
- user approve token cho `SavingCore`
- `SavingCore` tính `expectedInterest`
- kiểm tra vault đủ cover obligation mới
- nhận principal từ user
- mint NFT cho user

`Withdraw đúng hạn`
- principal trả từ `SavingCore`
- interest trả từ `VaultManager`

`Early withdraw`
- user nhận `principal - penalty`
- `penalty` chuyển về `feeReceiver`
- không trả interest

### 2.6. Đã chốt rule renew

Rule renew hiện tại đã được cố định:

- chỉ cho renew khi `block.timestamp >= maturityAt + 3 days`
- renew không tái sử dụng deposit cũ
- deposit cũ được đóng với trạng thái `Renewed`
- deposit mới được tạo riêng
- principal được giữ lại để mở chu kỳ mới
- interest kỳ cũ được xử lý riêng từ vault

### 2.7. Đã chốt invariant kế toán

Đã xác định các invariant bắt buộc:

- `SavingCore.balance >= totalPrincipalOutstanding`
- `VaultManager.balance >= totalInterestObligationOutstanding`
- `SavingCore.balance + VaultManager.balance >= totalPrincipalOutstanding + totalInterestObligationOutstanding`

Đây là các điều kiện dùng để kiểm tra khả năng thanh toán của hệ thống sau mỗi flow quan trọng.

### 2.8. Đã chuẩn bị tài liệu kế hoạch tổng thể

Đã tạo tài liệu kế hoạch tổng quát tại:

- [Plan.md](D:\Blockchain\final\Plan.md)

Tài liệu này đã bao gồm:

- tóm tắt đề bài
- mục tiêu dự án
- nguyên tắc tài chính
- kiến trúc contract
- cấu trúc dữ liệu
- luồng tiền
- edge cases
- kế hoạch Day 1 đến Day 6

### 2.9. Đã triển khai vượt tiến độ so với Day 1

Ngoài các phần phân tích và thiết kế, hôm nay đã thực hiện luôn phần scaffold và backend cơ bản:

- tạo project Hardhat
- tạo project frontend React + Vite
- implement `MockUSDC`
- implement `VaultManager`
- implement `SavingCore`
- implement test suite cho các flow quan trọng
- build frontend thành công

### 2.10. Đã xác minh code chạy được

Đã xác nhận:

- smart contract compile thành công
- test pass
- frontend build thành công

Các nhóm test đã pass gồm:

- deposit thành công
- reject deposit khi vault không đủ
- mature withdraw
- early withdraw
- chống double withdraw
- renew đúng thời điểm
- chặn renew quá sớm
- chặn user actions khi pause
- kiểm tra invariant accounting sau chuỗi hành động

## 3. Kết quả thực tế sau Day 1

Sau khi kết thúc hôm nay, dự án không chỉ dừng ở mức phân tích mà đã có:

- kiến trúc đã chốt
- logic tài chính đã chốt
- code backend bản đầu đã hoàn thành
- test backend đã chạy pass
- frontend scaffold đã sẵn sàng

Nói cách khác:

- Day 1 theo plan: đã hoàn thành
- một phần lớn của Day 2 đến Day 6 cũng đã được làm trước

## 4. Các file chính đã tạo hoặc hoàn thiện

Các file chính hiện có trong project:

- [contracts/MockUSDC.sol](D:\Blockchain\final\BankingSystem\contracts\MockUSDC.sol)
- [contracts/VaultManager.sol](D:\Blockchain\final\BankingSystem\contracts\VaultManager.sol)
- [contracts/SavingCore.sol](D:\Blockchain\final\BankingSystem\contracts\SavingCore.sol)
- [test/SavingSystem.test.js](D:\Blockchain\final\BankingSystem\test\SavingSystem.test.js)
- [frontend/src/App.jsx](D:\Blockchain\final\BankingSystem\frontend\src\App.jsx)
- [README.md](D:\Blockchain\final\BankingSystem\README.md)

## 5. Khó khăn hoặc lưu ý kỹ thuật

### 5.1. Cảnh báo Node version

Môi trường hiện tại đang dùng:

- Node.js `18.20.8`

Hardhat có cảnh báo phiên bản này không phải phiên bản được khuyến nghị, nhưng hiện tại:

- compile vẫn chạy được
- test vẫn pass

Nếu muốn môi trường ổn định hơn về lâu dài, nên nâng lên Node `20+`.

### 5.2. Cấu trúc project đã được sắp xếp lại

Toàn bộ source hiện đang nằm trong:

- `D:\Blockchain\final\BankingSystem`

Thư mục `node_modules` ngoài root đã được dọn, để tránh trùng dependency và gây nhầm lẫn.

## 6. Kế hoạch thực hiện cho Day 2

Mặc dù backend cốt lõi đã được dựng sớm, Day 2 vẫn nên được dùng như một ngày review và hardening thay vì nhảy tiếp quá nhanh.

### 6.1. Mục tiêu của Day 2

Mục tiêu chính của Day 2 là:

- review lại kỹ `MockUSDC` và `VaultManager`
- xác nhận `SavingCore` đang bám đúng logic tài chính
- làm sạch môi trường local
- kiểm tra kỹ contract events, admin flow và README

### 6.2. Công việc cụ thể cho Day 2

#### A. Review lại logic contract

- đọc lại `MockUSDC`, `VaultManager`, `SavingCore`
- kiểm tra từng function có khớp với đặc tả tài chính hay không
- xác nhận không có chỗ nào vô tình trộn principal với interest

#### B. Review event và admin flow

- kiểm tra event emit cho deposit, withdraw, early withdraw, renew
- kiểm tra luồng admin:
  - tạo plan
  - fund vault
  - set `feeReceiver`
  - pause/unpause

#### C. Kiểm tra lại test coverage

- review lại toàn bộ test đang có
- xác nhận từng test map đúng với 1 business rule
- bổ sung nếu mentor muốn cover thêm case nhỏ hơn

#### D. Chuẩn hóa tài liệu chạy local

- rà lại `README.md`
- đảm bảo hướng dẫn:
  - `npm install`
  - `npm run compile`
  - `npm test`
  - `npm run node`
  - `npm run deploy:local`
  là rõ ràng và chạy được

#### E. Chuẩn bị demo local cho mentor

- chạy lại compile
- chạy lại test
- nếu cần, chạy local node và deploy thử
- chụp lại hoặc note các địa chỉ contract sau deploy để phục vụ frontend

### 6.3. Kết quả mong đợi cuối Day 2

Cuối Day 2 cần đạt:

- contract logic được review lại lần 1
- admin flow được xác nhận rõ
- test suite ổn định
- tài liệu README rõ ràng hơn
- sẵn sàng cho việc kết nối frontend với địa chỉ contract local

## 7. Tóm tắt ngắn để báo cáo mentor

Trong Day 1, em đã hoàn thành phần phân tích đề bài, chốt logic tài chính, kiến trúc hệ thống, cấu trúc dữ liệu, luồng tiền, invariant kế toán và edge cases. Ngoài phạm vi Day 1, em đã scaffold luôn project Hardhat + React, implement 3 contract chính, viết test cho các flow quan trọng và xác minh backend/frontend chạy được ở local.

Kế hoạch Day 2 là dùng để review lại logic contract theo đúng đặc tả tài chính, kiểm tra admin flow, rà lại test coverage, chuẩn hóa README và chuẩn bị môi trường demo local để mentor có thể review thuận lợi.

