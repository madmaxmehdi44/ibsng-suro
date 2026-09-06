# Skill: Customer Diagnosis

Purpose: investigate an IBSng E customer without mutating the account unless the operator explicitly authorizes a mutation.

Workflow:
1. Resolve the customer with `ibsng_get_customer` using UID or customer ID.
2. Resolve associated user information with `ibsng_get_user` when a user identifier is available.
3. Inspect relevant balance state with `ibsng_get_balance` or `ibsng_list_balances`.
4. Inspect online state with `ibsng_get_online_users` when connection state is part of the question.
5. Summarize the evidence and clearly distinguish observed IBSng data from inference.
6. Do not call update/delete tools unless the requested operation is explicit.
