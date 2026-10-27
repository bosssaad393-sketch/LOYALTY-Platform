// Test helpers for the Apple Wallet pass: a THROWAWAY signing certificate made in memory (never written to disk, never
// a real Apple key) and a tiny .pkpass / zip reader. Nothing here touches a network.

import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { inflateRawSync } from "node:zlib";

// node-forge is what passkit-generator itself signs with; it has no type package here, so only what we call is typed.
type ForgeName = { name: string; value: string };
type Forge = {
  pki: {
    privateKeyFromPem(pem: string): unknown;
    publicKeyFromPem(pem: string): unknown;
    createCertificate(): {
      publicKey: unknown;
      serialNumber: string;
      validity: { notBefore: Date; notAfter: Date };
      setSubject(attrs: ForgeName[]): void;
      setIssuer(attrs: ForgeName[]): void;
      sign(key: unknown, md: unknown): void;
    };
    certificateToPem(cert: unknown): string;
  };
  md: { sha256: { create(): unknown } };
};
const forge = createRequire(import.meta.url)("node-forge") as Forge;

/** A self-signed certificate and its key as PEM strings. Different on every call. Test use only. */
export function throwawayCertificate(commonName: string): { cert: string; key: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 30);
  const subject = [{ name: "commonName", value: commonName }];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: privateKey };
}

/** Reads every file of a zip (a .pkpass is a zip). Handles stored and deflated entries. */
export function unzip(zip: Buffer): Map<string, Buffer> {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file.");
  const total = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken zip directory.");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
