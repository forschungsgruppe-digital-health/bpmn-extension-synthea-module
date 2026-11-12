# Modeler demo (bpmn.io + synthea extension) and the converter, in one image.
# xmllint (libxml2-utils) is included so `npm run validate` also works inside.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install first (own layer, cached until a package.json changes).
COPY package.json ./
COPY demo/package.json demo/
COPY extension/lint/bpmnlint-plugin-synthea/package.json extension/lint/bpmnlint-plugin-synthea/
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 5173
# --host so the port is reachable from outside the container.
CMD ["npm", "--prefix", "demo", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
