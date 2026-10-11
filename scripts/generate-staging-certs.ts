import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "selfsigned";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certsDir = path.resolve(__dirname, "../docker/nginx/certs");

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const certPath = path.join(certsDir, "staging.crt");
const keyPath = path.join(certsDir, "staging.key");

console.log(
  "Generating self-signed SSL certificates for CloudPilot Staging...",
);

async function main() {
  const attrs = [
    { name: "commonName", value: "cloudpilot.local" },
    { name: "organizationName", value: "CloudPilot" },
    { name: "countryName", value: "VN" },
  ];

  const pems = await generate(attrs, {
    days: 1825, // 5 years
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 2, value: "cloudpilot.local" },
          { type: 2, value: "staging.cloudpilot.local" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });

  fs.writeFileSync(certPath, pems.cert, "utf8");
  fs.writeFileSync(keyPath, pems.private, "utf8");

  console.log("Successfully generated staging SSL certificates:");
  console.log(` - Certificate: ${certPath}`);
  console.log(` - Private Key: ${keyPath}`);
}

main().catch((err) => {
  console.error("Failed to generate staging certificates:", err);
  process.exit(1);
});
