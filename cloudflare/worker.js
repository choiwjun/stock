import { Container } from "@cloudflare/containers";

export class StockResearchContainer extends Container {
  defaultPort = 4173;
  sleepAfter = "10m";
  enableInternet = true;

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: env.NODE_ENV || "development",
      PORT: "4173",
      APP_ORIGIN: env.APP_ORIGIN || "",
      MARKET_PROVIDER: env.MARKET_PROVIDER || "fixture",
      NEON_DATABASE_URL: env.NEON_DATABASE_URL || "",
      INTERNAL_METRICS_TOKEN: env.INTERNAL_METRICS_TOKEN || "",
    };
  }
}

export default {
  async fetch(request, env) {
    const container = env.STOCK_RESEARCH_CONTAINER.getByName("staging-singleton");
    return container.fetch(request);
  },
};
