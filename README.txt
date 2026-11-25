GLORIFIER fixed authorization repair — signed publication candidate

Pinned main: bb2f97356ac1f7aa37679d17834c0872eacb8785
Only two fixed files may be modified. The patch and original blobs are pinned by digest.
Keep this package private pending security review. No secrets are included.

Requirements: trusted owner-controlled Node.js 24+ runner with Git installed, network access to GitHub, and existing Digital Me App private key injected by a secure secret manager. Review the script and patch first. Do not copy the private key into chat or into this package.

Offline checks:
  node --test publish-owner-repair.test.mjs
  node publish-owner-repair.mjs --dry-run

On the trusted runner only, with the App key already securely injected into DIGITAL_ME_APP_PRIVATE_KEY, explicitly authorize the one fixed publication:
  DIGITAL_ME_CONFIRM_PUBLICATION=true node publish-owner-repair.mjs --publish

The publisher validates exact signed main, exact source bytes, patch digest, restricted installation token, expected-head commit, signature and signer, and exact file readback. It creates a draft only. It fails closed on changes and never merges or deploys. A failed operation after branch creation can leave a branch; inspect it manually before retrying. Review security disclosure risk before publishing to the public repository.

Local results: six publisher guard tests and offline dry-run passed. No real API writes or successful live publication path were tested. Full repository CI and independent security review are required. A direct git network probe from ChatGPT failed DNS resolution; no full repository clone/test was performed.
