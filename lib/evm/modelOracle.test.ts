import { describe, expect, it } from "vitest";

import { modelNameToId } from "./modelOracle";

describe("modelNameToId", () => {
  it("matches Solidity keccak256(abi.encodePacked(modelName))", () => {
    // From contracts/test/ModelPriceOracle.t.sol
    expect(modelNameToId("llama3:8b")).toBe(
      "0xa4dec912d6dd24b224db8b32c54cea79fc4c2208b29f6937679d17c34672741e",
    );
  });
});
