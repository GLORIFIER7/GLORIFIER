FROM ghcr.io/foundry-rs/foundry:v1.4.0

USER root
RUN apt-get update && apt-get install -y --no-install-recommends jq ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app/contracts
COPY contracts/ /app/contracts/

RUN forge install OpenZeppelin/openzeppelin-contracts --no-commit \
 && forge install foundry-rs/forge-std --no-commit \
 && forge build

CMD ["/bin/sh", "-c", "sh /app/contracts/railway-deploy.sh"]
