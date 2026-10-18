# Security model — ענפים 2.0

## Status and intended guarantee

This release implements client-side envelope encryption and private cloud access controls. It has automated tests, **not an independent cryptographic/security audit**. No live operator-owned Supabase project, Google OAuth client, production origin or physical passkey provider was available for integration testing.

The intended confidentiality guarantee is that reading the application database, Storage bucket, service-role API or backups does not reveal family content without a user's client-side unlocking secret. It is **not** a guarantee that a malicious operator who modifies the delivered JavaScript cannot steal future plaintext or keys. A web application must also trust its delivery/build chain and the code running on its origin. Stronger protection against a hostile client distributor requires independently controlled/reviewed client delivery, not a different database policy.

## Keys and encrypted content

- Google `sub`, Supabase user UUID, email and record identifiers are public identity/context, never encryption passwords.
- A 256-bit random AES-GCM data-encryption key (DEK) is generated in the browser through Web Crypto.
- A credential-scoped WebAuthn PRF result is input to HKDF-SHA-256 with a fresh salt and purpose-bound context. The resulting AES-GCM key-encryption key wraps the DEK.
- A second DEK wrap uses an independently random 256-bit recovery secret and HKDF. The user receives a checksummed recovery code. Neither the recovery code, PRF output nor raw DEK is uploaded.
- The DEK is an extractable CryptoKey while unlocked because new independent wraps must be supported. It remains in browser memory only; it is not serialized into localStorage, IndexedDB or Supabase. Lock removes application references. JavaScript/OS memory erasure cannot be guaranteed.
- The PRF output/recovery temporary byte arrays are overwritten after wrapping/unwrapping where practical. This does not eliminate all possible engine copies.
- Data snapshots contain the raw GEDCOM, filename, original-decoding label, optional selected person and save time. They are optionally compressed and then encrypted with AES-256-GCM, fresh 96-bit random IVs and a 128-bit authentication tag.
- AAD binds schema/version, owner UUID, vault UUID, random revision UUID and payload encoding. Key-wrap AAD additionally binds wrap identity, method, credential ID and RP domain.
- Metadata is structurally validated, authenticated decryption must succeed, decompression is bounded and GEDCOM parsing succeeds before replacing an existing local view.

## Clear metadata and identity data

Supabase/Google and the operator can see authentication identity/profile metadata (such as account email), user/vault/revision UUIDs, generation counters, update times, encrypted sizes, PRF/HKDF salts, credential IDs/RP domains, IVs and encrypted key wraps. Traffic timing and compressed lengths are not hidden. The operator does not obtain a secret decryption key from these fields.

Do not represent this as anonymous storage, or as hiding the user's Google identity from the operator. No family names, filenames or search index are intentionally sent outside encrypted snapshots. No analytics, external portraits or remote family-data services are included.

## Authentication and access control

- Supabase Auth handles Google OAuth with PKCE. Its validated authenticated JWT is the source of `auth.uid()` on the server.
- WebAuthn is used **only to unlock encryption locally**. Its client-generated challenge/assertion is not accepted as backend authentication; if passkey server login is added later it must add proper server challenge and signature verification.
- The browser accepts only a publishable/anon project key. Service-role/private keys and Google Client Secrets never belong in browser config. Build-time and runtime guards reject server keys in the public key field.
- Table reads are per-user RLS; ordinary clients have no direct mutation grants. Only narrowly scoped, fixed-search-path RPCs can commit or delete a head/history.
- Storage is private and owner-path restricted. Additional restrictive ownership/shape/immutability policies defend against unrelated permissive policies in an existing project. A service-role administrator can still bypass RLS, but receives ciphertext rather than plaintext.
- Tokens are persisted by the Auth SDK for session continuity. They can authorize ciphertext access and destructive operations, not decrypt a vault without its unlocking secret. A compromised authenticated account can damage/replace its own ciphertext; encryption is not a backup against malicious authorized deletion.

## Synchronization and recovery

- Each upload is an immutable ciphertext object with a random revision identifier. An advisory-lock-serialized database RPC checks the expected prior revision and object size before atomically publishing the new head and history record.
- Conflicting devices do not silently overwrite. The user explicitly chooses an encrypted remote snapshot or saves their current local dataset against the latest revision.
- Automatic download is paused when local state is dirty or an application dialog is open. A final pre-apply guard prevents a late asynchronous parse from overwriting a newly imported dataset or reopening plaintext after logout.
- Ambiguous network failure does not delete an upload that might already be committed. Unreferenced ciphertext may require operator cleanup; check version references first.
- Realtime is supplemented with polling and online/focus checks. Unsaved local data is retried when the remote revision is unchanged; conflicting changes require a choice.
- Existing encrypted versions remain readable by an unlocked DEK. Adding a Passkey does not revoke old credentials, recovery secrets or already copied ciphertext. Credential revocation/DEK rotation is not implemented and must not be claimed.
- Recovery confirmation is required before publishing a new vault. No email reset or Google user ID can recover a lost DEK when all unlocking secrets are lost. Restoring/adding credentials on a new RP domain requires a recovery secret or another appropriate unlocking method.
- Cloud history is not automatically pruned. The UI lists the most recent ten versions; retention/cost controls are the operator's responsibility.

## Local mode and limitations

- Without cloud configuration no cloud client is initialized and no genealogy data is uploaded. The demo is never uploaded as a family snapshot.
- The old optional local GEDCOM cache remains a **plaintext** localStorage copy and is now explicitly labeled. It is off by default; vault lock/logout clears that cache and closes the currently open family.
- Browser extensions, compromised devices, XSS, same-origin third-party scripts, malicious app updates, memory dumps and screen/clipboard capture are outside the passive-server confidentiality guarantee.
- WebAuthn PRF availability is checked on a real ceremony, not inferred from basic WebAuthn availability. An unsupported authenticator fails without uploading data or deriving keys from Google IDs.
- Static production CSP/permission headers are supplied for compatible hosts. Configure equivalents on your real host; dev preview is not an audited production deployment. A standalone file and a sandboxed viewer do not provide production OAuth/WebAuthn hosting.
- Deletion is a multi-service operation. Partial failures and provider backups require operational follow-up. Deleting a cloud vault does not delete account identity or copies already downloaded by another party.
- A fresh device cannot independently prove that an operator has not replayed an older otherwise valid encrypted snapshot. This release is not a signed transparency log/anti-rollback system.

## Test evidence

- Web Crypto round trips, wrong recovery/PRF secrets, owner/revision substitution, corrupted ciphertext, fresh nonces and multiple wrappers.
- PostgreSQL (PGlite) executes the migration, RLS, restricted grants, intentionally overbroad legacy Storage policy, private ownership, immutable objects, anonymous denial, history and CAS conflicts.
- Chromium virtual authenticator performs actual PRF create/get. UI tests verify recovery acknowledgment, lock/clear, a second device recovering, ciphertext-only network payloads, offline retry, automatic synchronization and dirty-local conflicts.
- OAuth tests verify the SDK's Google/PKCE redirect contract against a local simulated service. These tests do **not** prove that a real Google OAuth configuration or a hardware/OS password manager will work.

Before production: independently review the cryptography/protocol, run real Google and Supabase integration tests, test the target physical devices and recovery UX, audit deployment origins/CSP, set quotas/retention/rate limits and document identity/account deletion obligations.
