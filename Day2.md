# Báo cáo Day 2 - Blockchain Savings Project

## 1. Mục tiêu của Day 2

Mục tiêu của Day 2 là dùng phần backend đã có từ Day 1 để hardening theo đúng đề chính thức, làm sạch những chỗ lệch spec, và chuẩn bị môi trường demo local dùng được cho mentor review.

Trọng tâm của ngày 2:

- khóa lại interface contract theo assignment
- sửa logic renew và bổ sung auto-renew
- chuẩn hóa test theo business rules thật
- đồng bộ frontend với contract mới
- deploy local có seed dữ liệu demo

## 2. Những việc đã hoàn thành

### 2.1. Đã review lại mismatch giữa code cũ và đề chính thức

Đã xác nhận và xử lý các điểm lệch quan trọng:

- code cũ dùng `deposit`, `withdraw`, `renew` thay vì API rõ nghĩa theo assignment
- renew cũ trả interest về ví user thay vì cộng vào principal mới
- chưa có `autoRenewDeposit`
- plan cũ chưa có `maxDeposit`
- chưa có `updatePlan`, `enablePlan`, `disablePlan`, `withdrawVault`
- event và status chưa bám sát yêu cầu của đề
- NFT cũ là soulbound, nay đã cho transfer như certificate ERC721

### 2.2. Đã chuẩn hóa lại `SavingCore`

Đã cập nhật `SavingCore` để hỗ trợ đúng các flow:

- `openDeposit(planId, amount)`
- `withdrawAtMaturity(depositId)`
- `earlyWithdraw(depositId)`
- `renewDeposit(depositId, newPlanId)`
- `autoRenewDeposit(depositId)`

Đồng thời đã bổ sung:

- snapshot `aprBpsAtOpen`
- snapshot `penaltyBpsAtOpen`
- snapshot `tenorDaysAtOpen`
- trạng thái `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed`
- support transfer NFT và cập nhật owner deposit theo NFT owner mới

### 2.3. Đã sửa logic renew theo đúng business rule

Manual renew hiện hoạt động đúng:

- chỉ cho phép sau khi deposit mature
- tính interest của chu kỳ cũ
- trả interest từ `VaultManager` vào `SavingCore`
- cộng interest vào principal mới
- mở deposit mới theo `newPlanId`
- đóng deposit cũ với status `ManualRenewed`

Auto renew hiện hoạt động đúng:

- chỉ cho phép sau `maturityAt + 3 days`
- ai cũng có thể trigger như bot off-chain
- giữ nguyên APR snapshot cũ
- giữ nguyên penalty snapshot cũ
- mở chu kỳ mới với principal đã cộng interest
- đóng deposit cũ với status `AutoRenewed`

### 2.4. Đã mở rộng `VaultManager`

`VaultManager` hiện đã có đủ các phần cần cho spec local demo:

- fund vault
- interest payout chỉ cho `SavingCore`
- set `savingCore`
- set `feeReceiver`
- pause/unpause
- `withdrawVault(amount)`

### 2.5. Đã viết lại test suite theo business rules

Test hiện không còn chỉ kiểm tra API chạy được, mà đã kiểm tra đúng logic tài chính:

- token 6 decimals
- chỉ owner mint được
- createPlan hợp lệ, reject APR sai
- snapshot APR/penalty bất biến theo deposit
- reject deposit dưới min, trên max, plan disabled
- reject deposit khi vault thiếu cover interest obligation mới
- mature withdrawal trả principal từ core và interest từ vault
- mature withdrawal fail khi vault bị rút xuống dưới mức cần thiết
- early withdraw có penalty, không có interest
- không thể double withdraw / renew lại deposit đã đóng
- manual renew compound đúng principal mới
- auto renew đúng grace period và APR lock
- vault withdraw và unauthorized payout hoạt động đúng
- pause chặn withdraw/renew
- invariant accounting giữ đúng sau nhiều flow trộn nhau

Kết quả hiện tại:

- `16/16` test pass

### 2.6. Đã đồng bộ frontend với contract mới

Frontend hiện đã cập nhật theo interface mới:

- hiển thị available plans
- mở deposit theo plan được chọn
- hiển thị certificate/deposit chi tiết
- mature withdraw
- early withdraw
- manual renew theo selected plan
- admin tạo plan
- admin fund vault
- admin pause/resume withdrawals

### 2.7. Đã chuẩn hóa deploy local để demo nhanh

Script `deploy:local` hiện không chỉ deploy mà còn seed luôn dữ liệu demo:

- mint USDC cho admin
- mint USDC cho 2 user demo
- fund vault sẵn
- tạo sẵn 2 saving plan

Điều này giúp mở frontend lên là có thể thao tác ngay thay vì setup tay từng bước.

## 3. Kết quả thực tế sau Day 2

Sau khi kết thúc Day 2, project hiện đã có:

- smart contract bám sát assignment hơn nhiều so với bản Day 1
- test suite backend xanh toàn bộ
- frontend đã nối đúng ABI mới
- deploy local có dữ liệu seed sẵn để demo
- tài liệu README đã được cập nhật lại

Kết quả xác minh:

- `npm run compile`: pass
- `npm test`: pass
- `frontend/npm run build`: pass

## 4. Địa chỉ local demo gần nhất

Lần deploy local gần nhất đã tạo:

- `MockUSDC`: xem trong `frontend/src/config.js`
- `VaultManager`: xem trong `frontend/src/config.js`
- `SavingCore`: xem trong `frontend/src/config.js`
- `FeeReceiver`: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- `Demo User Alice`: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- `Demo User Bob`: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

Ghi chú:

- nếu restart `hardhat node`, cần deploy lại
- sau mỗi lần deploy lại, cần đảm bảo `frontend/src/config.js` khớp địa chỉ mới

## 5. Dữ liệu seed local demo

Sau khi chạy `npm run deploy:local`, môi trường local hiện được seed sẵn:

- vault đã được fund `20,000 USDC`
- đã có `Plan #1`: `30 ngày`, `1200 bps`, `min 100`, `max 5000`, `penalty 500`
- đã có `Plan #2`: `90 ngày`, `1500 bps`, `min 100`, `max 20000`, `penalty 250`
- admin đã được mint USDC để fund vault và thao tác admin flow
- Alice và Bob đã được mint USDC để test user flow trên frontend

## 6. Cách chạy demo local

Các bước chạy demo:

- mở terminal 1 tại `D:\Blockchain\final\BankingSystem`
- chạy `npm run node`
- mở terminal 2 tại `D:\Blockchain\final\BankingSystem`
- chạy `npm run deploy:local`
- mở terminal 3 tại `D:\Blockchain\final\BankingSystem\frontend`
- chạy `npm run dev`

Lưu ý:

- phải giữ `hardhat node` chạy trong suốt quá trình demo
- nếu deploy lại thì cần kiểm tra `frontend/src/config.js` đã khớp địa chỉ mới hay chưa

## 7. Cấu hình MetaMask local

Thông tin mạng local:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`

Các account tiện dùng để demo:

- Admin: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Alice: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Bob: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

Ghi chú:

- private key của các account local có thể lấy trực tiếp từ output của `npm run node`
- không lưu private key vào tài liệu repo để tránh bị secret scanner flag nhầm

## 8. Lưu ý kỹ thuật

### 8.1. Warning Node version vẫn còn

Môi trường hiện tại vẫn dùng:

- Node.js `18.20.8`

Hardhat vẫn cảnh báo phiên bản này không phải bản được khuyến nghị. Hiện tại compile/test/deploy vẫn chạy được, nhưng về lâu dài nên nâng lên Node `20+`.

### 8.2. Frontend mới chỉ cover manual renew

Frontend đã có đủ các thao tác chính để demo ngày 2, nhưng hiện chưa có nút riêng cho `autoRenewDeposit`. Flow auto-renew đã có ở contract và test, có thể thêm UI ở ngày sau nếu cần demo bot flow trực tiếp.

## 9. Kế hoạch đề xuất cho Day 3

Ngày tiếp theo nên tập trung vào hoàn thiện trải nghiệm demo và khả năng review:

- thêm flow mint token cho wallet đang connect ngay trên frontend hoặc script riêng
- thêm hiển thị vai trò admin/user rõ hơn trên UI
- cân nhắc thêm nút auto-renew cho demo
- cải thiện phần hướng dẫn import account vào MetaMask
- chuẩn bị script/demo note để quay video submission

## 10. Các file chính đã cập nhật trong Day 2

- [contracts/SavingCore.sol](D:\Blockchain\final\BankingSystem\contracts\SavingCore.sol)
- [contracts/VaultManager.sol](D:\Blockchain\final\BankingSystem\contracts\VaultManager.sol)
- [test/SavingSystem.test.js](D:\Blockchain\final\BankingSystem\test\SavingSystem.test.js)
- [frontend/src/App.jsx](D:\Blockchain\final\BankingSystem\frontend\src\App.jsx)
- [frontend/src/abi.js](D:\Blockchain\final\BankingSystem\frontend\src\abi.js)
- [frontend/src/config.js](D:\Blockchain\final\BankingSystem\frontend\src\config.js)
- [scripts/deploy.js](D:\Blockchain\final\BankingSystem\scripts\deploy.js)
- [README.md](D:\Blockchain\final\BankingSystem\README.md)
