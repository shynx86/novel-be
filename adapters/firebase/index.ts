import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";

setGlobalOptions({ region: "asia-southeast1" });
import { app } from "../../src/app.js";

function collectBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = req as unknown as Readable;
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

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

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      // Buffer the raw multipart body — Express doesn't parse it
      const rawBody = await collectBody(req);
      body = new Uint8Array(rawBody);
    } else {
      body = JSON.stringify(req.body);
    }
  }

  const webRequest = new Request(url, {
    method: req.method,
    headers,
    body,
  });

  const webResponse = await app.fetch(webRequest);

  res.status(webResponse.status);

  webResponse.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value);
  });

  const respBody = await webResponse.text();
  res.send(respBody);
};

export const api = onRequest(
  {
    timeoutSeconds: 60,
    minInstances: 0,
    maxInstances: 100,
    invoker: "public",
  },
  handler,
);
