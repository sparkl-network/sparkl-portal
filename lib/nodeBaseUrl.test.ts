import { describe, expect, it } from "vitest";

import {
  metadataUriToBaseUrl,
  parseMetadataUri,
  registryMetadataUriToFetchUrl,
} from "./nodeBaseUrl";

describe("parseMetadataUri / metadataUriToBaseUrl", () => {
  it("parses legacy origin", () => {
    expect(parseMetadataUri("https://x.com:8080")).toEqual({
      baseUrl: "https://x.com:8080",
      raw: "https://x.com:8080",
    });
    expect(metadataUriToBaseUrl("https://x.com")).toBe("https://x.com");
  });

  it("parses JSON with baseUrl", () => {
    const raw = JSON.stringify({
      version: 1,
      baseUrl: "https://node.example:8787",
      node_id: "0xab",
    });
    const p = parseMetadataUri(raw);
    expect(p?.baseUrl).toBe("https://node.example:8787");
    expect(metadataUriToBaseUrl(raw)).toBe("https://node.example:8787");
  });

  it("parses JSON with moniker", () => {
    const raw = JSON.stringify({
      version: 1,
      moniker: "my-gpu-box",
      peer_id: "12D3KooWExample",
      node_id: "0xab",
    });
    const p = parseMetadataUri(raw);
    expect(p?.moniker).toBe("my-gpu-box");
    expect(p?.peerId).toBe("12D3KooWExample");
  });

  it("parses JSON with peer_id only (no baseUrl)", () => {
    const raw = JSON.stringify({
      version: 1,
      peer_id: "12D3KooWExamplePeerIdForTestOnly",
    });
    const p = parseMetadataUri(raw);
    expect(p?.baseUrl).toBeUndefined();
    expect(p?.peerId).toBe("12D3KooWExamplePeerIdForTestOnly");
    expect(metadataUriToBaseUrl(raw)).toBeNull();
    expect(registryMetadataUriToFetchUrl(raw)).toBeNull();
  });

  it("registry fetch URL adds /details for bare origin", () => {
    expect(registryMetadataUriToFetchUrl("https://h:1")).toBe(
      "https://h:1/details",
    );
  });
});
