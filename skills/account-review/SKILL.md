# Skill: Account Review

Purpose: inspect an IBSng E account using evidence from customer, user, balance, billing and session data.

Workflow:
1. Resolve the customer with the generated `ibsng_rpc_customer_getCustomer` tool or search operation.
2. Resolve associated user records using the generated `ibsng_rpc_user_getUserInfo` tool.
3. Inspect relevant balances and expiration information.
4. Inspect current online/session state when connectivity is relevant.
5. Check billing/invoice evidence when payment or debt is part of the request.
6. Separate directly observed IBSng values from inference.
7. Do not mutate data unless the operator explicitly authorizes the mutation.
