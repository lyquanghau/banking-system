# Kế hoạch triển khai dự án Blockchain Savings trong 6 ngày

> Tài liệu này dùng để intern bám theo từng ngày, và để mentor review tiến độ, logic tài chính, phạm vi kỹ thuật, test và frontend.

---

## 1. Tóm tắt đề bài

Mục tiêu của dự án là xây dựng một hệ thống gửi tiết kiệm trên blockchain, hoạt động tương tự một sản phẩm tiết kiệm có kỳ hạn của ngân hàng. Người dùng gửi token vào hệ thống trong một khoảng thời gian cố định, nhận NFT đại diện cho khoản gửi, sau đó có thể rút tiền khi đến hạn hoặc gia hạn khoản gửi theo quy tắc của hệ thống.

Hệ thống có 3 thành phần chính:

- `SavingCore`: contract lõi, xử lý tạo khoản gửi, mint NFT, withdraw, renew
- `VaultManager`: contract quản lý quỹ trả lãi, quản lý `feeReceiver`, quản lý trạng thái pause
- `MockUSDC`: token ERC20 dùng để test, có `6 decimals`

Đây không phải một bài staking demo đơn giản. Hệ thống phải được thiết kế như một sản phẩm tài chính có kiểm soát dòng tiền và kiểm soát khả năng thanh toán.

---

## 2. Mục tiêu dự án

Đến cuối 6 ngày, intern phải hoàn thành được một phiên bản local chạy được đầy đủ các chức năng sau:

- Admin tạo saving plan
- Admin nạp tiền vào vault để trả lãi
- User deposit token vào hệ thống
- User nhận NFT đại diện cho khoản gửi
- User withdraw đúng hạn để nhận principal và interest
- User early withdraw để nhận `principal - penalty`, không nhận interest
- User renew khoản gửi đúng thời điểm cho phép
- Admin có thể pause hệ thống
- Frontend React có thể kết nối MetaMask và thực hiện các thao tác chính

Ngoài việc chạy được chức năng, hệ thống còn phải đúng về logic tài chính:

- Principal không được trộn với quỹ interest
- Interest chỉ được trả từ vault
- Penalty chỉ được chuyển đến `feeReceiver`
- Không được dùng tiền người gửi sau để trả lãi cho người gửi trước
- Hệ thống phải luôn duy trì solvency

---

## 3. Những nguyên tắc tài chính bắt buộc phải hiểu trước khi làm

Intern phải nắm rất chắc các nguyên tắc dưới đây trước khi bắt đầu code:

### 3.1. Principal và interest là hai dòng tiền khác nhau

Tiền gốc của người dùng là nghĩa vụ phải hoàn trả cho chính người dùng đó. Quỹ lãi là nguồn tiền riêng do admin cấp vào để chi trả lợi nhuận đã cam kết. Hai phần này không được trộn trong tư duy kế toán lẫn trong luồng xử lý contract.

Diễn giải theo thiết kế:

- `SavingCore` giữ principal
- `VaultManager` giữ interest reserve

### 3.2. Interest chỉ được trả từ vault

Khi user withdraw đúng hạn hoặc renew theo rule có phát sinh trả lãi, phần interest chỉ được đi ra từ `VaultManager`. Không được lấy từ principal pool trong `SavingCore`.

### 3.3. Early withdrawal không được trả lãi

Nếu user rút trước hạn:

- user chỉ nhận `principal - penalty`
- user không nhận interest
- `penalty` chuyển về `feeReceiver`
- obligation trả lãi của khoản gửi đó phải bị xóa khỏi sổ kế toán

### 3.4. Hệ thống phải luôn đủ khả năng thanh toán

Trước khi nhận một deposit mới, hệ thống phải kiểm tra xem vault có đủ khả năng chi trả lãi cho khoản gửi mới hay không. Nếu không đủ, deposit phải bị từ chối.

Tương tự, bất kỳ thao tác nào tạo nghĩa vụ mới hoặc phát sinh payout đều phải đảm bảo không làm hệ thống mất solvency.

> Nguyên tắc cốt lõi cần nhớ: không được trộn tiền gốc của user với quỹ lãi. Đây là ranh giới quan trọng nhất của toàn bộ bài toán.

---

## 4. Kiến trúc đề xuất

### 4.1. `MockUSDC`

Contract token test dùng chuẩn ERC20 với `6 decimals`.

Vai trò:

- cấp token cho admin để nạp vault
- cấp token cho user để deposit và test các flow

### 4.2. `VaultManager`

Đây là contract giữ quỹ trả lãi.

Trách nhiệm chính:

- nhận tiền từ admin để nạp vault
- giữ riêng quỹ interest
- chỉ cho phép `SavingCore` gọi payout interest
- quản lý `feeReceiver`
- hỗ trợ pause/unpause

Điểm cần hiểu:

- `VaultManager` không phải nơi giữ principal
- `VaultManager` chỉ nên xử lý interest payout và các quyền quản trị liên quan đến vault

### 4.3. `SavingCore`

Đây là contract chính của hệ thống.

Trách nhiệm chính:

- tạo saving plan
- nhận principal khi user deposit
- mint NFT đại diện khoản gửi
- lưu dữ liệu khoản gửi
- xử lý withdraw đúng hạn
- xử lý early withdraw
- xử lý renew
- duy trì sổ kế toán principal và interest obligation

---

## 5. Cấu trúc dữ liệu cần có

### 5.1. Saving Plan

Mỗi plan là một sản phẩm tiết kiệm do admin tạo ra, ví dụ:

- kỳ hạn 30 ngày
- lãi suất 500 bps
- mức gửi tối thiểu 100 USDC
- penalty 200 bps nếu rút sớm

Các field nên có:

- `planId`
- `tenorDays`
- `aprBps`
- `minAmount`
- `penaltyBps`
- `isActive`

Nếu muốn mở rộng thêm:

- `allowRenew`
- `maxCapacity`

### 5.2. Deposit

Mỗi khoản gửi cần được lưu riêng để hệ thống có thể xác định:

- ai là chủ sở hữu
- gửi theo plan nào
- principal là bao nhiêu
- lãi cam kết là bao nhiêu
- khi nào đáo hạn
- trạng thái hiện tại là gì

Các field nên có:

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

### 5.3. NFT chứng chỉ khoản gửi

Mỗi deposit được đại diện bằng một NFT ERC721.

Vai trò của NFT:

- là chứng chỉ sở hữu khoản gửi
- giúp frontend hiển thị danh sách khoản gửi
- là khóa xác thực quyền withdraw hoặc renew

Khuyến nghị cho intern:

- giai đoạn đầu nên hạn chế hoặc tắt transfer NFT để tránh phức tạp hóa quyền sở hữu

---

## 6. Luồng tiền trong hệ thống

Đây là phần quan trọng nhất. Nếu hiểu sai luồng tiền, toàn bộ hệ thống sẽ sai.

### 6.1. Khi deposit

Quy trình đúng:

1. User approve `MockUSDC` cho `SavingCore`
2. User gọi `deposit(planId, amount)`
3. `SavingCore` tính `expectedInterest`
4. `SavingCore` kiểm tra vault còn đủ khả năng cover thêm nghĩa vụ lãi mới không
5. Nếu đủ, `SavingCore` nhận principal từ user
6. Principal được giữ trong `SavingCore`
7. Hệ thống mint NFT cho user
8. Accounting tăng:
   - `totalPrincipalOutstanding`
   - `totalInterestObligationOutstanding`

### 6.2. Khi withdraw đúng hạn

Quy trình đúng:

1. User gọi `withdraw(tokenId)`
2. `SavingCore` kiểm tra deposit còn active và đã đến hạn
3. `SavingCore` trả principal từ balance principal của chính nó
4. `SavingCore` gọi `VaultManager` để trả interest cho user
5. Deposit được đóng
6. Accounting giảm:
   - `totalPrincipalOutstanding`
   - `totalInterestObligationOutstanding`

### 6.3. Khi early withdraw

Quy trình đúng:

1. User gọi `withdraw(tokenId)` trước `maturityAt`
2. `SavingCore` tính penalty
3. User nhận `principal - penalty`
4. `penalty` được chuyển về `feeReceiver`
5. User không nhận interest
6. Deposit được đóng
7. Nghĩa vụ interest của deposit đó bị xóa khỏi accounting

### 6.4. Khi renew

Renew không phải là “sửa lại thời gian đáo hạn cho xong”. Renew là đóng một chu kỳ cũ và mở một chu kỳ mới.

Khuyến nghị an toàn cho intern:

- deposit cũ được đóng thành `Renewed`
- interest kỳ cũ được xử lý dứt điểm trước
- principal được giữ lại để mở deposit mới
- hệ thống tạo deposit mới và mint NFT mới

Lợi ích của cách này:

- dễ theo dõi lịch sử
- accounting rõ ràng
- ít bug hơn so với việc tái sử dụng cùng một record deposit

---

## 7. Trạng thái của deposit

Nên dùng enum rõ ràng:

- `Active`
- `Withdrawn`
- `Renewed`

Ý nghĩa:

- `Active`: khoản gửi đang còn hiệu lực
- `Withdrawn`: khoản gửi đã được rút và không thể thao tác lại
- `Renewed`: khoản gửi cũ đã được dùng để mở chu kỳ mới và không thể thao tác lại

Một deposit đã vào trạng thái `Withdrawn` hoặc `Renewed` thì không được withdraw hoặc renew lần nữa.

---

## 8. Invariant và kiểm tra kế toán bắt buộc

Intern không được chỉ test happy path. Phải kiểm tra cả accounting invariants.

### 8.1. Principal solvency

`SavingCore.balance >= totalPrincipalOutstanding`

Ý nghĩa:

- principal contract luôn phải giữ đủ tiền gốc để trả cho tất cả khoản gửi đang active

### 8.2. Interest solvency

`VaultManager.balance >= totalInterestObligationOutstanding`

Ý nghĩa:

- vault luôn phải đủ tiền để trả toàn bộ lãi đã cam kết cho các khoản gửi đang active

### 8.3. Tổng solvency hệ thống

`SavingCore.balance + VaultManager.balance >= totalPrincipalOutstanding + totalInterestObligationOutstanding`

Invariant này giúp kiểm tra tổng quát toàn hệ thống.

### 8.4. Trạng thái đóng không được xử lý lại

Nếu deposit đã là `Withdrawn` hoặc `Renewed` thì:

- không được withdraw lại
- không được renew lại

---

## 9. Edge cases bắt buộc

Intern phải test đầy đủ ít nhất các case này:

### 9.1. Early withdraw

Phải xác nhận:

- không có interest
- có penalty
- penalty về đúng `feeReceiver`
- obligation interest được xóa

### 9.2. Vault không đủ tiền

Phải xác nhận:

- deposit mới bị chặn nếu tạo thêm obligation vượt khả năng trả lãi
- withdraw đúng hạn phải revert nếu vault thiếu tiền
- renew phải revert nếu vault không đủ cover chu kỳ mới

### 9.3. Withdraw hai lần

Phải xác nhận:

- lần gọi thứ hai luôn revert

### 9.4. Auto renew hoặc renew sai thời điểm

Phải xác nhận:

- trước `maturityAt + 3 days` thì không được renew
- sau khi renew xong thì deposit cũ không thể renew lại

### 9.5. Pause system

Phải xác nhận:

- khi pause, user không thể deposit
- khi pause, user không thể withdraw
- khi pause, user không thể renew

---

# 10. Kế hoạch chi tiết theo từng ngày

---

# Day 1: Chốt đặc tả, luồng tiền và mô hình dữ liệu

> Mục tiêu cuối ngày: intern phải hiểu bài toán, chốt được data model, flow tiền và test plan trước khi viết contract.

### Mục tiêu học

Intern phải hiểu:

- sản phẩm đang xây là gì
- tại sao đây là mô hình gần ngân hàng hơn là staking pool
- principal và interest khác nhau như thế nào
- vì sao phải kiểm tra solvency trước khi nhận deposit

### Công việc kỹ thuật

- [ ] Đọc lại đề bài và tự viết ra đặc tả ngắn của hệ thống bằng ngôn ngữ của mình.
- [ ] Vẽ sơ đồ 3 contract:
   - `MockUSDC`
   - `SavingCore`
   - `VaultManager`
- [ ] Vẽ sơ đồ luồng tiền:
   - principal đi đâu
   - interest đi đâu
   - penalty đi đâu
- [ ] Chốt data model của `Plan`.
- [ ] Chốt data model của `Deposit`.
- [ ] Chốt enum trạng thái deposit.
- [ ] Liệt kê toàn bộ function sẽ cần viết trong 2 contract chính.
- [ ] Chốt công thức tính interest.
- [ ] Chốt rule renew:
   - chỉ cho phép khi `now >= maturityAt + 3 days`
- [ ] Chốt chiến lược renew:
   - đóng deposit cũ
   - tạo deposit mới
   - mint NFT mới

### Công việc test

Trong ngày đầu chưa cần code test đầy đủ, nhưng phải viết test plan bằng chữ cho các case:

- [ ] deposit thành công
- [ ] deposit fail khi vault thiếu
- [ ] withdraw đúng hạn
- [ ] early withdraw
- [ ] withdraw 2 lần
- [ ] renew đúng thời điểm
- [ ] renew sai thời điểm
- [ ] pause system

### Kết quả cuối ngày

Cuối Day 1 intern phải có:

- [ ] bản mô tả ngắn kiến trúc
- [ ] danh sách struct
- [ ] danh sách function
- [ ] danh sách test case

---

# Day 2: Xây dựng MockUSDC và VaultManager

> Mục tiêu cuối ngày: có token test hoạt động, có vault độc lập, có quyền quản trị rõ ràng, có khả năng trả lãi có kiểm soát.

### Mục tiêu học

Intern cần hiểu:

- vai trò của ERC20 test token
- vai trò riêng của vault
- vì sao payout interest phải có kiểm soát quyền gọi

### Công việc kỹ thuật

- [ ] Tạo `MockUSDC` chuẩn ERC20.
- [ ] Cấu hình token dùng `6 decimals`.
- [ ] Thêm khả năng mint để phục vụ local testing.
- [ ] Tạo contract `VaultManager`.
- [ ] Khai báo các biến chính:
   - token address
   - savingCore address
   - feeReceiver
- [ ] Viết hàm admin nạp vault.
- [ ] Viết hàm trả interest cho user, nhưng chỉ cho `SavingCore` gọi.
- [ ] Viết hàm set `savingCore`.
- [ ] Viết hàm set `feeReceiver`.
- [ ] Thêm `pause/unpause`.
- [ ] Thêm view function đọc số dư vault khả dụng.

### Công việc test

Phải test:

- [ ] `MockUSDC` trả về đúng `6 decimals`
- [ ] admin mint được token
- [ ] admin fund vault thành công
- [ ] user thường không gọi được hàm payout interest
- [ ] payout fail khi vault không đủ tiền
- [ ] đổi `feeReceiver` thành công
- [ ] pause hoạt động đúng theo thiết kế

### Kết quả cuối ngày

Cuối Day 2 intern phải có:

- [ ] token test dùng được
- [ ] vault dùng được
- [ ] vault chỉ trả interest khi được gọi đúng quyền

---

# Day 3: Xây dựng SavingCore phần plan, deposit và NFT

> Mục tiêu cuối ngày: user có thể deposit thành công, hệ thống mint NFT và accounting tăng đúng ngay tại thời điểm mở khoản gửi.

### Mục tiêu học

Intern cần hiểu:

- NFT trong bài này là chứng chỉ khoản gửi
- mỗi deposit là một bản ghi tài chính độc lập
- accounting phải được cập nhật đồng bộ ngay khi deposit thành công

### Công việc kỹ thuật

- [ ] Tạo contract `SavingCore`.
- [ ] Kế thừa ERC721, `Ownable`, `Pausable`.
- [ ] Tạo storage cho saving plans.
- [ ] Tạo storage cho deposits.
- [ ] Tạo các biến đếm:
   - `nextPlanId`
   - `nextTokenId`
- [ ] Tạo biến accounting:
   - `totalPrincipalOutstanding`
   - `totalInterestObligationOutstanding`
- [ ] Viết hàm admin tạo plan.
- [ ] Viết hàm bật/tắt plan.
- [ ] Viết hàm `previewInterest`.
- [ ] Viết hàm đọc thông tin plan và deposit.
- [ ] Viết hàm `deposit(planId, amount)` với đầy đủ các bước:
   - check plan active
   - check min amount
   - tính `expectedInterest`
   - check vault đủ cover obligation mới
   - transfer principal từ user vào `SavingCore`
   - cập nhật accounting
   - mint NFT cho user

### Công việc test

Phải test:

- [ ] tạo plan thành công
- [ ] plan không active thì deposit fail
- [ ] amount nhỏ hơn minAmount thì fail
- [ ] vault không đủ cover interest thì fail
- [ ] deposit thành công thì:
  - principal vào `SavingCore`
  - NFT được mint
  - `totalPrincipalOutstanding` tăng đúng
  - `totalInterestObligationOutstanding` tăng đúng

### Kết quả cuối ngày

Cuối Day 3 intern phải có:

- [ ] tạo plan được
- [ ] deposit được
- [ ] NFT được mint đúng
- [ ] accounting cơ bản hoạt động đúng

---

# Day 4: Xử lý withdraw đúng hạn và early withdraw

> Mục tiêu cuối ngày: hoàn thiện toàn bộ logic đóng khoản gửi, bao gồm cả rút đúng hạn lẫn rút trước hạn, mà không phá vỡ accounting.

### Mục tiêu học

Intern cần hiểu:

- withdraw đúng hạn và early withdraw là hai flow khác nhau
- early withdraw không có interest
- mọi thao tác payout phải atomic

### Công việc kỹ thuật

- [ ] Viết hàm `withdraw(tokenId)`.
- [ ] Trong hàm withdraw, tách rõ 2 nhánh:
   - withdraw đúng hạn
   - early withdraw
- [ ] Với withdraw đúng hạn:
   - check owner
   - check status còn active
   - check đã đến hạn
   - trả principal từ `SavingCore`
   - gọi `VaultManager` trả interest
   - cập nhật accounting
   - set status `Withdrawn`
- [ ] Với early withdraw:
   - check owner
   - check status còn active
   - check chưa đến hạn
   - tính penalty
   - trả `principal - penalty` cho user
   - chuyển penalty sang `feeReceiver`
   - không trả interest
   - cập nhật accounting
   - set status `Withdrawn`
- [ ] Thêm các guard:
   - không cho withdraw 2 lần
   - không cho non-owner withdraw
   - không cho withdraw khi pause
- [ ] Đảm bảo transaction atomic:
   - nếu phần payout interest fail thì toàn bộ withdraw phải revert

### Công việc test

Phải test:

- [ ] withdraw đúng hạn thành công
- [ ] user nhận đúng principal + interest
- [ ] early withdraw thành công
- [ ] user nhận đúng `principal - penalty`
- [ ] `feeReceiver` nhận đúng penalty
- [ ] early withdraw không nhận interest
- [ ] withdraw 2 lần bị revert
- [ ] non-owner withdraw bị revert
- [ ] withdraw khi pause bị revert
- [ ] vault thiếu tiền khi mature withdraw thì revert toàn bộ

### Kết quả cuối ngày

Cuối Day 4 intern phải có:

- [ ] flow withdraw hoàn chỉnh
- [ ] early withdraw đúng logic tài chính
- [ ] không có double-withdraw bug

---

# Day 5: Xây dựng renew, kiểm tra invariant và edge cases

> Mục tiêu cuối ngày: renew chạy đúng logic, accounting sạch, và hệ thống chứng minh được khả năng thanh toán qua invariant tests.

### Mục tiêu học

Intern cần hiểu:

- renew là mở một chu kỳ tài chính mới
- renew không được làm rối accounting
- invariant test giúp phát hiện bug hệ thống tốt hơn happy-path test

### Công việc kỹ thuật

- [ ] Viết hàm `renew(tokenId)`.
- [ ] Check owner và check deposit còn active.
- [ ] Check đúng rule thời gian:
   - `now >= maturityAt + 3 days`
- [ ] Đóng deposit cũ:
   - set status `Renewed`
   - cập nhật `closedAt`
- [ ] Xử lý interest kỳ cũ theo design đã chốt:
   - trả interest kỳ cũ từ `VaultManager`
   - xóa obligation cũ
- [ ] Giữ principal lại trong `SavingCore`.
- [ ] Tạo deposit mới với chu kỳ mới.
- [ ] Tính `expectedInterest` mới.
- [ ] Kiểm tra vault đủ cover obligation mới trước khi hoàn tất renew.
- [ ] Mint NFT mới cho deposit mới.
- [ ] Cập nhật accounting đầy đủ.

### Công việc test

Phải test:

- [ ] renew đúng thời điểm thành công
- [ ] renew quá sớm bị revert
- [ ] renew khi deposit đã withdrawn bị revert
- [ ] renew khi vault không đủ tiền bị revert
- [ ] renew xong thì:
  - deposit cũ là `Renewed`
  - deposit mới là `Active`
  - principal không bị mất
  - obligation cũ được xóa
  - obligation mới được tạo đúng

### Invariant test bắt buộc

Sau mỗi chuỗi hành động phức hợp, phải kiểm tra:

- `SavingCore.balance >= totalPrincipalOutstanding`
- `VaultManager.balance >= totalInterestObligationOutstanding`
- `SavingCore.balance + VaultManager.balance >= totalPrincipalOutstanding + totalInterestObligationOutstanding`

Nên chạy các chuỗi test như:

- [ ] 3 user cùng deposit
- [ ] 1 user early withdraw
- [ ] 1 user mature withdraw
- [ ] 1 user renew
- [ ] admin pause rồi unpause

### Kết quả cuối ngày

Cuối Day 5 intern phải có:

- [ ] renew hoạt động đúng
- [ ] edge cases chính được cover
- [ ] accounting invariants pass

---

# Day 6: Frontend React + ethers.js + demo hoàn chỉnh

> Mục tiêu cuối ngày: có giao diện đủ dùng để demo toàn bộ flow chính từ ví MetaMask, không chỉ chạy contract ở mức test.

### Mục tiêu học

Intern cần hiểu:

- frontend là lớp hiển thị và gọi contract, không được tự “sáng tạo” lại business logic
- UI phải phản ánh đúng trạng thái on-chain

### Công việc kỹ thuật

- [ ] Tạo frontend bằng React.
- [ ] Tích hợp `ethers.js`.
- [ ] Kết nối MetaMask.
- [ ] Hiển thị network và địa chỉ ví đang dùng.
- [ ] Tạo màn hình danh sách saving plans.
- [ ] Tạo form deposit:
   - nhập amount
   - approve token
   - gọi deposit
- [ ] Tạo danh sách deposits của user.
- [ ] Với mỗi deposit, hiển thị:
   - `tokenId`
   - `planId`
   - `principal`
   - `expectedInterest`
   - `startAt`
   - `maturityAt`
   - `status`
- [ ] Thêm nút withdraw.
- [ ] Thêm nút renew.
- [ ] Chỉ enable action phù hợp theo trạng thái và thời gian.
- [ ] Tạo admin view tối thiểu:
   - tạo plan
   - fund vault
   - pause/unpause
- [ ] Hiển thị thông báo lỗi rõ ràng:
   - vault thiếu tiền
   - sai thời điểm renew
   - system đang pause
   - user không có quyền

### Công việc test

Phải manual test trên local:

- [ ] connect MetaMask thành công
- [ ] deposit thành công
- [ ] danh sách deposit cập nhật đúng
- [ ] early withdraw thành công
- [ ] mature withdraw thành công
- [ ] renew đúng thời điểm thành công
- [ ] pause system chặn các action người dùng

### Kết quả cuối ngày

Cuối Day 6 intern phải có:

- [ ] frontend chạy được local
- [ ] demo được end-to-end flow
- [ ] có thể quay video demo ngắn 3-5 phút

---

## 11. Checklist hoàn thành cuối dự án

Đến cuối dự án, intern phải tự xác nhận lại các điểm sau:

- [ ] Principal và interest được tách riêng cả trong tư duy lẫn trong code.
- [ ] Mọi khoản interest đều được trả từ `VaultManager`.
- [ ] Early withdrawal không bao giờ phát sinh interest.
- [ ] Penalty luôn được chuyển đúng về `feeReceiver`.
- [ ] Không thể withdraw hai lần cùng một deposit.
- [ ] Renew không thể gọi sai thời điểm.
- [ ] Pause system chặn đúng các user actions.
- [ ] Frontend có thể thao tác deposit, withdraw, renew, hiển thị danh sách deposit.
- [ ] Accounting invariants luôn đúng sau các flow quan trọng.

---

## 12. Gợi ý mở rộng để gần với DeFi thực tế hơn

Nếu còn thời gian sau khi hoàn tất bản cơ bản, có thể cân nhắc các hướng nâng cấp sau:

- tách `reservedInterest` và `freeVaultBalance` rõ hơn trong accounting
- giới hạn capacity theo từng plan
- thêm role riêng cho operator thay vì chỉ dùng owner
- hỗ trợ nhiều loại token stablecoin
- dùng event indexing hoặc subgraph để frontend load lịch sử deposit tốt hơn
- thêm emergency mode và cơ chế bắt buộc top-up vault trước khi mở thêm plan
- thiết kế principal pool sinh lợi kiểu DeFi, nhưng vẫn phải duy trì liquidity và risk control giống các giao thức như Aave
