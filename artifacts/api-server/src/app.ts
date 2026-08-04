import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { globalLimiter } from "./middlewares/rateLimit";

const app: Express = express();

// Replit routes this behind its own proxy, so req.ip is the proxy's address
// unless we trust one hop. Every rate limiter keys on req.ip, so without
// this they'd bucket the entire internet together and throttle real users.
app.set("trust proxy", 1);

// Don't advertise the framework.
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Query string is dropped deliberately — never log credentials or
          // tokens that end up there by accident.
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  helmet({
    // This is a pure JSON API — it serves no HTML, so a CSP here just adds a
    // header nothing consumes. Everything else (nosniff, HSTS, referrer
    // policy, frame denial) is worth having.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

// An allowlist rather than the previous bare cors(), which sent
// Access-Control-Allow-Origin: * and reflected requested headers — letting
// any website on the internet call this API (including the admin routes)
// from a visitor's browser. Native clients send no Origin and are
// unaffected by this.
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: native app, curl, server-to-server. Allow.
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    allowedHeaders: ["content-type", "authorization", "x-admin-token"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.use(globalLimiter);

// 100kb is the express default; stated explicitly so it's an intentional
// bound rather than an inherited one. Sync payloads are additionally capped
// by maxItems in the OpenAPI schema.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);

app.use("/api", notFoundHandler);
app.use(errorHandler);

export default app;
