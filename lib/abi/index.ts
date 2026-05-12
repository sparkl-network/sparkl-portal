import type { Abi } from "viem";

import settlementEscrowJson from "./SettlementEscrow.json";
import providerRegistryJson from "./ProviderRegistry.json";

export const providerRegistryAbi = providerRegistryJson as Abi;
export const settlementEscrowAbi = settlementEscrowJson as Abi;
