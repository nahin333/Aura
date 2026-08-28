#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const distDirectory = path.resolve(process.cwd(), process.argv[2] ?? "dist");
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const REQUIRED_FILES = [
  "index.html",
  "manifest.webmanifest",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "tesseract/worker.min.js",
  "tesseract/lang/eng.traineddata.gz",
  "tesseract/core/tesseract-core-lstm.wasm.js",
  "tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract/core/LICENSE",
  "icons/aura-192.png",
  "icons/aura-512.png",
  "icons/aura-maskable-512.png",
];

function fail(message) {
  throw new Error(`PWA build validation failed: ${message}`);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      fail(`symbolic links are not allowed in dist (${relativePath})`);
    }
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      fail(`unsupported filesystem entry in dist (${relativePath})`);
    }
  }

  return files;
}

function assetUrl(relativePath) {
  return `./${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function validatePng(buffer, filename, expectedSize) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${filename} is not a PNG`);
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    fail(`${filename} does not begin with an IHDR chunk`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  if (width !== expectedSize || height !== expectedSize) {
    fail(`${filename} must be ${expectedSize}x${expectedSize}, got ${width}x${height}`);
  }
  if (bitDepth !== 8 || colorType !== 6) {
    fail(`${filename} must be an 8-bit RGBA PNG`);
  }
}

async function validateBuild(files) {
  const fileSet = new Set(files);
  for (const requiredFile of REQUIRED_FILES) {
    if (!fileSet.has(requiredFile)) {
      fail(`missing required file ${requiredFile}`);
    }
  }

  const indexHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");
  if (!/<link\s+[^>]*rel=["']manifest["'][^>]*href=["']\.\/manifest\.webmanifest["'][^>]*>/i.test(indexHtml)
      && !/<link\s+[^>]*href=["']\.\/manifest\.webmanifest["'][^>]*rel=["']manifest["'][^>]*>/i.test(indexHtml)) {
    fail("index.html must link to ./manifest.webmanifest");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(distDirectory, "manifest.webmanifest"), "utf8"));
  } catch (error) {
    fail(`manifest.webmanifest is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest.webmanifest must contain a JSON object");
  }
  if (manifest.start_url !== "./" || manifest.scope !== "./" || manifest.id !== "./") {
    fail("manifest id, start_url, and scope must remain relative (./)");
  }
  if (manifest.display !== "standalone") {
    fail("manifest display must be standalone");
  }
  if (Object.hasOwn(manifest, "share_target")) {
    fail("share_target is intentionally unsupported until transient input cleanup is implemented");
  }
  if (!Array.isArray(manifest.icons)) {
    fail("manifest must declare icons");
  }

  const expectedIcons = new Map([
    ["./icons/aura-192.png", { sizes: "192x192", purpose: "any" }],
    ["./icons/aura-512.png", { sizes: "512x512", purpose: "any" }],
    ["./icons/aura-maskable-512.png", { sizes: "512x512", purpose: "maskable" }],
  ]);
  for (const [source, expected] of expectedIcons) {
    const icon = manifest.icons.find((candidate) => candidate?.src === source);
    if (!icon || icon.sizes !== expected.sizes || icon.type !== "image/png" || icon.purpose !== expected.purpose) {
      fail(`manifest icon ${source} is missing or has incorrect metadata`);
    }
  }

  await Promise.all([
    validatePng(await readFile(path.join(distDirectory, "icons/aura-192.png")), "icons/aura-192.png", 192),
    validatePng(await readFile(path.join(distDirectory, "icons/aura-512.png")), "icons/aura-512.png", 512),
    validatePng(await readFile(path.join(distDirectory, "icons/aura-maskable-512.png")), "icons/aura-maskable-512.png", 512),
  ]);
}

function serviceWorkerSource(precache, cacheVersion) {
  return `/* Generated by scripts/build-pwa.mjs. Do not edit. */
const CACHE_PREFIX = "aura-preflight-static:" + self.registration.scope + ":";
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(cacheVersion)};
const PRECACHE = ${JSON.stringify(precache, null, 2)};
const PRECACHE_REVISIONS = new Map(
  PRECACHE.map(({ url, acceptedRevisions }) => [
    new URL(url, self.registration.scope).href,
    acceptedRevisions,
  ]),
);
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const INDEX_PATH = new URL("./index.html", self.registration.scope).pathname;

function digestHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchVerifiedStatic(absoluteUrl, expectedRevisions) {
  const response = await fetch(new Request(absoluteUrl, {
    cache: "reload",
    credentials: "same-origin",
  }));
  if (response.status !== 200 || response.type === "opaque") {
    throw new Error("Unable to fetch a precached static file with HTTP 200.");
  }

  const body = await response.clone().arrayBuffer();
  const actualRevision = digestHex(await crypto.subtle.digest("SHA-256", body));
  if (!expectedRevisions.includes(actualRevision)) {
    throw new Error("A precached static file did not match its build digest.");
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await caches.delete(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const { url, acceptedRevisions } of PRECACHE) {
        const absoluteUrl = new URL(url, self.registration.scope).href;
        const response = await fetchVerifiedStatic(absoluteUrl, acceptedRevisions);
        await cache.put(absoluteUrl, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
  })());
});

function isAppNavigation(url) {
  return url.pathname === SCOPE_URL.pathname || url.pathname === INDEX_PATH;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback = await caches.match(INDEX_URL, { cacheName: CACHE_NAME });
    return fallback ?? Response.error();
  }
}

async function cacheFirstPrecached(absoluteUrl, expectedRevisions) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(absoluteUrl);
  if (cached) {
    return cached;
  }

  const response = await fetchVerifiedStatic(absoluteUrl, expectedRevisions);
  await cache.put(absoluteUrl, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== SCOPE_URL.origin) {
    return;
  }

  if (request.mode === "navigate" && isAppNavigation(requestUrl)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const expectedRevisions = PRECACHE_REVISIONS.get(requestUrl.href);
  if (expectedRevisions !== undefined) {
    event.respondWith(cacheFirstPrecached(requestUrl.href, expectedRevisions));
  }
});
`;
}

async function main() {
  const initialFiles = await listFiles(distDirectory);
  const staticFiles = initialFiles.filter((relativePath) => relativePath !== "sw.js");
  await validateBuild(staticFiles);

  const precache = [];
  const versionHash = createHash("sha256");
  versionHash.update("service-worker-template\0");
  versionHash.update(serviceWorkerSource.toString());
  versionHash.update("\n");
  for (const relativePath of staticFiles) {
    const content = await readFile(path.join(distDirectory, ...relativePath.split("/")));
    const revision = createHash("sha256").update(content).digest("hex");
    const acceptedRevisions = [revision];
    if (relativePath.endsWith(".gz")) {
      let decoded;
      try {
        decoded = gunzipSync(content);
      } catch (error) {
        fail(`${relativePath} is not valid gzip data (${error instanceof Error ? error.message : String(error)})`);
      }
      const decodedRevision = createHash("sha256").update(decoded).digest("hex");
      if (decodedRevision !== revision) {
        acceptedRevisions.push(decodedRevision);
      }
    }
    precache.push({ url: assetUrl(relativePath), revision, acceptedRevisions });
    versionHash.update(relativePath);
    versionHash.update("\0");
    versionHash.update(revision);
    versionHash.update("\n");
  }
  versionHash.update("precache-manifest\0");
  versionHash.update(JSON.stringify(precache));
  versionHash.update("\n");

  const cacheVersion = versionHash.digest("hex").slice(0, 20);
  await writeFile(
    path.join(distDirectory, "sw.js"),
    serviceWorkerSource(precache, cacheVersion),
    "utf8",
  );

  process.stdout.write(`Generated dist/sw.js with ${precache.length} content-hashed static files (${cacheVersion}).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
