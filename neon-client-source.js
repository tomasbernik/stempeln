import { BetterAuthVanillaAdapter, createClient } from "@neondatabase/neon-js";

export function createStempelnClient(authUrl, dataApiUrl) {
  return createClient({
    auth: { adapter: BetterAuthVanillaAdapter(), url: authUrl, allowAnonymous: false },
    dataApi: { url: dataApiUrl, options: { db: { schema: "public" } } },
  });
}
