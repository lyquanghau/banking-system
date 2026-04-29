# Blockchain Savings

Hệ thống gửi tiết kiệm on-chain gồm 3 thành phần:

- `MockUSDC`: token test 6 decimals
- `VaultManager`: giữ quỹ trả lãi và điều khiển pause hệ thống
- `SavingCore`: giữ principal, mint NFT, xử lý deposit / withdraw / renew

## Logic tài chính

- Principal và interest được tách biệt
- Principal nằm trong `SavingCore`
- Interest nằm trong `VaultManager`
- Early withdraw chỉ trả `principal - penalty`
- Penalty đi về `feeReceiver`
- Interest chỉ được trả từ `VaultManager`
- Deposit mới chỉ được mở nếu vault đủ cover nghĩa vụ lãi mới

## Cài đặt

### Smart contracts

```bash
npm install
npm run compile
npm test
```

### Chạy local node và deploy

```bash
npm run node
npm run deploy:local
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Frontend flow

Frontend hỗ trợ:

- Kết nối MetaMask
- Xem địa chỉ contracts
- Deposit
- Withdraw
- Renew
- Xem danh sách deposits
- Admin tạo plan, nạp vault, pause/unpause

## Lưu ý

- Sau khi deploy local, cập nhật địa chỉ contract vào `frontend/src/config.js`
- Frontend đang dùng ABI tĩnh trong `frontend/src/abi.js`
