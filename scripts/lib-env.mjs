// Loads the (non-committed, non-deployed) .env and exposes the test pod admin
// credentials. Used only by Node-side seed/capture scripts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "../.env"));
} catch {
  /* .env optional if vars are already in the environment */
}

export const POD = {
  idp: process.env.TEST_POD_IDP || "https://pod.mpeters.dev/",
  email: process.env.TEST_POD_EMAIL,
  password: process.env.TEST_POD_PASSWORD,
};

if (!POD.email || !POD.password) {
  console.error(
    "Missing TEST_POD_EMAIL / TEST_POD_PASSWORD — copy .env.example to .env."
  );
  process.exit(1);
}
