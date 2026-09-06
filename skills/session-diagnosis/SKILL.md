# Skill: Session Diagnosis

Purpose: diagnose an IBSng E connectivity problem without changing account state.

Workflow:
1. Resolve the user with `ibsng_rpc_user_getUserInfo`.
2. Inspect online state using the documented report/session operations.
3. Inspect relevant RAS, IP pool and user attributes when the evidence requires it.
4. Compare observed session state with account expiration, balance and service attributes.
5. Report the most likely cause and cite the observed IBSng fields in the result.
6. Never disconnect, suspend, delete or update anything unless explicitly authorized.
