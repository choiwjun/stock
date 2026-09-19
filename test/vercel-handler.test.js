import test from "node:test";
import assert from "node:assert/strict";

process.env.VERCEL = "1";
process.env.NODE_ENV = "development";
process.env.APP_ORIGIN = "https://staging.example.test";

const { default: vercelHandler } = await import("../api/handler.js");

function responseDouble() {
  return {
    headersSent: false,
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    end(body = "") {
      this.body += body;
      return this;
    },
  };
}

test("Vercel handler serves health checks without starting a Node listener", async () => {
  const response = responseDouble();
  await vercelHandler({
    method: "GET",
    url: "/healthz",
    headers: { origin: "https://staging.example.test" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).status, "ok");
  assert.equal(response.headers["x-request-id"].startsWith("req_"), true);
});
