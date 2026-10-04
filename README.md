# allwain · Audit source snapshot

This branch is a recoverable backup of the audited allwain candidate from 4–5 October 2026. It contains 648 declared source/build inputs: 303 reconciled shared-backend files and 345 frontend inputs. The source files retain their audited bytes. See `audit-provenance/complete-source-manifest.json` for the SHA-256 allowlist.

`backend-stripe-test` and `frontend-stripe-test` are snapshot directory names. They are not deployment paths. Do not replace the shared production backend or the public website with this tree. The candidate preserves the active MFA/dependencies in its reviewed source; shared-service coordination remains necessary.

This snapshot excludes environment/provider secrets, native Google service configuration, signing material, user data, databases, dependencies, compiled runtime and native binaries. It is not a complete production backup or a store-ready build. Required private configuration must remain outside the tree.

The prior 532-file audit history is inherited; 116 public assets/configuration inputs were added separately. Earlier `audit-provenance` files describe their historical snapshots. The complete source manifest is the authority for the 648 current inputs. A bounded strong-pattern scan of the inherited 4 commits found no matches; this does not guarantee absence of every possible secret.

This branch does not modify `main` or `dev` and must not be merged as a replacement for the other projects in this repository. Production remains on the previously published version. Old block 8 remains frozen.
