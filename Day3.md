# Báo cáo Day 3 - Blockchain Savings Project

## 1. Mục tiêu của Day 3

Mục tiêu của Day 3 là đưa project từ trạng thái "đã chạy được" sang trạng thái "demo được, nộp được, và nhìn gần với một sản phẩm thật hơn", nhưng vẫn giữ nguyên mục tiêu gốc của đề tài:

- hệ thống savings / term deposit on-chain
- kết nối MetaMask
- user có thể chọn plan, mở deposit, theo dõi deposit, withdraw, renew
- admin có thể vận hành plan, vault, pause system

Trọng tâm của Day 3:

- khóa các điểm lệch spec còn lại trong contract
- hoàn thiện test và flow local demo
- tự động hóa deploy để frontend luôn dùng đúng địa chỉ contract
- làm frontend rõ ràng hơn, gọn hơn, và có cảm giác productized hơn

## 2. Những việc đã hoàn thành

### 2.1. Đã khóa lại rule pause theo đúng business rule chặt hơn

Khi hệ thống pause thì toàn bộ các thao tác user quan trọng đều bị chặn:

- `openDeposit`
- `withdrawAtMaturity`
- `earlyWithdraw`
- `renewDeposit`
- `autoRenewDeposit`

Điều này giúp logic nhất quán hơn và sát với kỳ vọng của một hệ thống tài chính có nút dừng khẩn cấp.

### 2.2. Đã cập nhật test suite để khóa behavior mới

Test đã được cập nhật để xác nhận rõ:

- khi pause thì user không thể mở deposit mới
- các flow withdraw / renew tiếp tục bị chặn đúng như thiết kế

Kết quả backend tại thời điểm chốt Day 3:

- `npm run compile`: pass
- `npm test`: pass (`16/16`)

### 2.3. Đã tự động hóa cập nhật config frontend sau deploy local

Script deploy đã được nâng cấp để sau khi deploy local xong, frontend tự nhận cấu hình mới mà không cần copy tay địa chỉ contract.

Hiện tại `scripts/deploy.js` sẽ tự ghi lại:

- địa chỉ `MockUSDC`
- địa chỉ `VaultManager`
- địa chỉ `SavingCore`
- thông tin account demo local
- network local
- một số hằng số cần cho frontend

File được cập nhật tự động:

- `frontend/src/config.js`

### 2.4. Đã xác minh deploy local chạy hoàn chỉnh

Đã chạy thử end-to-end local flow:

- mở `hardhat node`
- chạy `deploy:local`
- seed dữ liệu demo
- đồng bộ config cho frontend

Kết quả:

- deploy local pass
- frontend nhận đúng contract addresses
- dữ liệu seed sẵn dùng được cho demo

### 2.5. Đã làm rõ hơn flow MetaMask và wallet state

Frontend hiện đã xử lý tốt hơn các trạng thái:

- connect wallet
- sai network
- wallet không có token
- pending / rejected request
- role hiển thị theo account

Điều này giúp demo local ít nhầm hơn và phản ánh đúng trạng thái ví đang dùng.

### 2.6. Đã làm lại frontend theo hướng dashboard product hơn

Cấu trúc UI hiện tại được giữ ở mức đơn giản, bám trực tiếp vào business flow:

- hero
- status banner
- 3 stat cards
- plan list
- your deposits
- admin accordion

Mục tiêu là giữ đúng flow chính của savings product, không biến app thành landing page marketing.

### 2.7. Đã cập nhật copy và thông tin hiển thị trên frontend

Trong vòng chỉnh sau, frontend được cập nhật thêm:

- copy mới trên hero và khu tổng quan để app nhìn giống savings dashboard hơn
- hiển thị network hiện tại trong wallet card
- hiển thị `expected yield` trong portfolio card
- hiển thị `Opened` time cho mỗi deposit certificate

Toàn bộ thay đổi này chỉ nằm ở lớp hiển thị, không đổi contract calls hay business logic.

### 2.8. Đã đổi visual direction sang theme tối theo yêu cầu review

Theme hiện tại của frontend:

- nền đen / charcoal
- xanh lá là màu primary
- hồng là màu highlight cho selected / accent states
- typography vẫn tách rõ heading, body, mono data

Mục tiêu là giữ cảm giác blockchain / fintech nhưng đỡ "school project" hơn.

### 2.9. Đã chuẩn hóa card / background / border / shadow

Một vòng polish riêng đã được làm cho `surface system` để giao diện đồng bộ hơn:

- `hero`, `panel`, `metric card`, `banner`, `plan card`, `deposit card`, `admin card` dùng cùng logic surface
- border mảnh và readable hơn trên nền tối
- shadow được chia lại thành lớp chiều sâu + inner highlight nhẹ
- hover / selected state có glow và contrast rõ hơn
- background tổng thể có thêm gradient và grid nhẹ để đỡ phẳng

Điểm này quan trọng vì trước đó UI mới dừng ở mức đổi màu và sắp layout; sau vòng này thì giao diện nhìn nhất quán hơn nhiều.

## 3. Kết quả thực tế sau Day 3

Sau khi kết thúc Day 3, project hiện có:

- contract logic ổn định hơn về mặt spec
- pause rule nhất quán hơn
- test suite backend vẫn xanh toàn bộ
- deploy local gọn hơn nhờ tự cập nhật config frontend
- frontend có thể kết nối MetaMask và thao tác đúng các flow chính
- giao diện đã gần với sản phẩm thật hơn, đồng thời gọn hơn bản cũ
- UI đã có theme tối rõ ràng, token màu nhất quán hơn, và surface system sạch hơn ở mức card/background/border/shadow

Kết quả xác minh hiện tại:

- `npm run compile`: pass
- `npm test`: pass (`16/16`)
- `frontend npm run build`: pass
- `npm run deploy:local`: pass

## 4. Các file chính đã cập nhật trong Day 3

- [contracts/SavingCore.sol](D:\Blockchain\final\BankingSystem\contracts\SavingCore.sol)
- [test/SavingSystem.test.js](D:\Blockchain\final\BankingSystem\test\SavingSystem.test.js)
- [scripts/deploy.js](D:\Blockchain\final\BankingSystem\scripts\deploy.js)
- [frontend/src/config.js](D:\Blockchain\final\BankingSystem\frontend\src\config.js)
- [frontend/src/App.jsx](D:\Blockchain\final\BankingSystem\frontend\src\App.jsx)
- [frontend/src/styles.css](D:\Blockchain\final\BankingSystem\frontend\src\styles.css)
- [README.md](D:\Blockchain\final\BankingSystem\README.md)

## 5. Lưu ý kỹ thuật hiện tại

### 5.1. Dự án vẫn đang dùng `MockUSDC`

Toàn bộ flow local hiện tại vẫn dùng token test:

- `MockUSDC`
- `6 decimals`

Đây là lựa chọn đúng cho môi trường development và demo local.

### 5.2. MetaMask có thể không bật popup mỗi lần connect

Nếu site đã được MetaMask cấp quyền từ trước thì các lần connect sau có thể trả về account ngay mà không bật popup lại.

Vì vậy:

- connect thành công không đồng nghĩa popup phải luôn hiện
- đây là hành vi chuẩn của MetaMask

### 5.3. Node version vẫn là điểm nên nâng sau

Môi trường local hiện tại đang chạy:

- Node.js `18.20.8`

Hardhat vẫn có cảnh báo phiên bản này không phải mức khuyến nghị. Hiện compile / test / deploy vẫn chạy được, nhưng về lâu dài nên nâng lên Node `20+`.

## 6. Trạng thái hiện tại để tiếp tục sau khi nghỉ

Khi quay lại, project đang ở trạng thái:

- backend đủ tốt cho assignment/demo local
- frontend đã được redesign và polish thêm một vòng
- cấu trúc sản phẩm trên UI đã chốt ở mức đơn giản:
  - hero
  - status banner
  - 3 stat cards
  - plan list
  - your deposits
  - admin accordion

Nếu làm tiếp, các hướng hợp lý nhất là:

- polish spacing / typography / microcopy thêm một vòng
- tách `App.jsx` thành component nhỏ hơn để code sạch hơn
- rà soát lần cuối xem còn chi tiết nào trên UI chưa đủ "product" hay không

## 7. Tóm tắt ngắn để báo cáo hoặc tự nối việc

Trong Day 3, em đã khóa lại rule pause trên contract, cập nhật test suite để bảo vệ behavior mới, tự động hóa cập nhật config frontend sau deploy local, xác minh lại toàn bộ compile/test/build/deploy, và nâng cấp frontend theo hướng product hơn. Ngoài vòng redesign ban đầu, em cũng đã cập nhật lại copy hiển thị, bổ sung network / expected yield / opened time, đổi visual sang theme tối với xanh lá là primary và hồng là highlight, đồng thời chuẩn hóa lại card/background/border/shadow để giao diện nhìn nhất quán và "productized" hơn.
