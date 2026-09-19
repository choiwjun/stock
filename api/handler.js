import { handleRequest } from "../src/app/server.js";

export default function handler(request, response) {
  return handleRequest(request, response);
}
