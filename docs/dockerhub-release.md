# GLORIFIER Docker image

Repository: [glorifier/glorifier on Docker Hub](https://hub.docker.com/r/glorifier/glorifier)  
Source: [GLORIFIER7/GLORIFIER](https://github.com/GLORIFIER7/GLORIFIER)

## Build locally

From the repository root:

```sh
docker build --pull -t glorifier/glorifier:local .
docker run --rm -p 3000:3000 --env-file .env glorifier/glorifier:local
```

Only provide environment variables the deployment actually needs. Do not bake secrets into the image or build arguments. The application listens on port 3000 by default; set `PORT` if your deployment requires a different port.

Check the application health endpoint:

```sh
curl --fail http://127.0.0.1:3000/api/health
```

When `DATABASE_URL` is configured, this endpoint returns an unhealthy HTTP status if the database probe fails. The separate `/api/health/ready` endpoint requires a configured and reachable database.

## Release policy

The Docker workflow follows these gates:

1. Pull requests build the image and scan it for unfixed-excluded CRITICAL and HIGH OS/library vulnerabilities. A finding fails the job.
2. Publishing is considered only after the `GLORIFIER CI` workflow succeeds for a push to `main`.
3. The exact commit that passed CI is checked out, built, and scanned before Docker Hub authentication.
4. A passing scan and configured Docker Hub credentials are required before publishing the `latest`, package-version, and source-SHA tags.
5. No image is published from a pull request. The workflow does not deploy the image to a production service.

## Required repository secrets

Configure these under **Settings → Secrets and variables → Actions**:

- `DOCKERHUB_USERNAME`: Docker Hub account username that can push to `glorifier/glorifier`.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with only the permissions needed to push to that repository.

Do not use a Docker Hub account password. If either secret is absent or the account cannot push to the repository, publishing fails closed. A green GitHub workflow does not by itself prove that the Docker Hub repository is public, that a tag is pullable, or that a deployed container is healthy; verify those separately.

## Runtime notes

- Run as a non-root user (Distroless UID `65532` for the primary image; UID `10001` for the Ubuntu runtime image).
- Container health checks use `/api/health`.
- `.dockerignore` excludes local environment files, credentials, dependency folders, and generated artifacts.
- Production images use Node.js 24; the Ubuntu image pins Node.js 24.22.2, and `package.json` declares a minimum of Node.js `24.12.0`.
- The primary image runs the compiled `dist/server.cjs` entrypoint. Development-only `tsx` is excluded from production dependencies.
- Pull-request CI builds all three container variants, verifies the primary image runtime Node version, smoke-tests the Ubuntu runtime health endpoint, and blocks HIGH/CRITICAL Trivy findings for each image. The permanent orchestrator's npm security overrides are pinned in `docker/orchestrator-security-patches/package-lock.json` and installed with `npm ci`.
- The workflow blocks publishing on CRITICAL/HIGH vulnerability findings that Trivy reports under its configured policy. It does not claim that a scan proves the absence of all vulnerabilities.
