import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { app } from "../../src/app.js";

export const api = async (req: ExpressRequest, res: ExpressResponse) => {
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
