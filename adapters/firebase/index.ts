import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";

setGlobalOptions({ region: "asia-southeast1" });
import { app } from "../../src/app.js";

const handler = async (req: Request, res: Response) => {
  const url = `https://${req.headers.host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(
    req.headers as Record<string, string | string[] | undefined>,
  )) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const webRequest = new Request(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  const webResponse = await app.fetch(webRequest);

  res.status(webResponse.status);

  webResponse.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value);
  });

  const body = await webResponse.text();
  res.send(body);
};

export const api = onRequest(
  {
    timeoutSeconds: 60,
    minInstances: 0,
    maxInstances: 100,
  },
  handler,
);
