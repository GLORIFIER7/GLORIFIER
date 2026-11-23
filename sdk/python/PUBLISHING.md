# GLORIFIER Python SDK publishing

Status: **PREPARED, NOT PUBLISHED**. The PyPI user profile
https://pypi.org/user/GLORIFIER/ showed no published projects on 2026-11-23.

The release candidate is the standalone standard-library HTTP client in
`sdk/python/glorifier_neural_client.py`, not the Python/FastAPI
`services/neural` server, deployment config, model weights, or credentials.

## Verify before any first release

1. Review the SDK public API and tests in `sdk/python`, including the fixed
   HTTPS routes and credential-handling safeguards. Contract tests use mocks
   and do not verify a live GLORIFIER service.
2. Merge the packaging change only after all required checks, code-owner
   reviews, and **verified signed-commit** requirements have been satisfied.
3. On GitHub, configure the `pypi` environment with trusted required
   reviewers and restrict deployment branches to the protected `main`
   branch. Keep the repository's existing branch rules in force.
4. In the PyPI account that will own the package, configure a **pending
   Trusted Publisher** for the new project, subject to verifying that the
   distribution name is available:
   - PyPI project: `glorifier-neural-client`
   - GitHub owner: `GLORIFIER7`
   - GitHub repository: `GLORIFIER`
   - GitHub workflow filename: `pypi-python-sdk.yml`
   - GitHub environment: `pypi`
5. Verify the exact package name and version, full license text, wheel and
   sdist contents, security checks, repository source commit, and approval.
6. Only then manually dispatch the **GLORIFIER Python SDK PyPI** workflow
   from `main`, supply the exact `sdk/python/pyproject.toml` version, and
   explicitly check `confirm_publish`. The workflow tests the SDK, checks
   the built distributions, and publishes solely after the protected
   `pypi` environment permits it.
7. Confirm the project appears on PyPI under the intended account and that
   the distribution can be installed in a clean Python environment. Record
   the publication URL and version in the project's evidence ledger.

**No PyPI API token, .pypirc file, password, wallet key, or GitHub personal
access token is required in this repository.** Publishing uses GitHub OIDC
Trusted Publishing to obtain short-lived credentials.

The workflow never deploys Neural, starts paid inference, moves funds, or
overrides branch protection. A package upload is not a live-service readiness
or whole-repository verification result.

## Local validation

From `sdk/python/`:

```sh
python -m unittest -v test_glorifier_neural_client.py
python -m pip install build twine
python -m build
python -m twine check dist/*
```

Install test in an isolated environment using the local wheel and import:

```sh
python -m pip install --no-deps dist/*.whl
python -c "from glorifier_neural_client import GlorifierNeuralClient, GlorifierAPIError"
```

## Security notes

- Do not publish the FastAPI server just to populate the PyPI profile.
- Keep the public SDK dependency-free until a reviewed change justifies it.
- PyPI version uploads are immutable; bump the package version for updates.
- Confirm package ownership on PyPI before first release; the profile username
  does not automatically reserve any distribution name.
- Treat missing PyPI login, pending Trusted Publisher, protected GitHub
  environment, signed-commit review, or passing CI as **NOT VERIFIED**.
- Do not claim a release completed based on a build or successful dry run.
