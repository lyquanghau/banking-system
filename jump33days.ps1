$rpcUrl = "http://127.0.0.1:8545"

$increaseTimeBody = '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[2851200],"id":1}'
$mineBody = '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":2}'

Invoke-RestMethod -Uri $rpcUrl -Method Post -Body $increaseTimeBody | Out-Null
Invoke-RestMethod -Uri $rpcUrl -Method Post -Body $mineBody | Out-Null

Write-Host "Hardhat time jumped forward by 33 days and mined 1 block."
