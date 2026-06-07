/** Router tunnel health (GET /status/nodes). */
export type RouterTunnelStatus = "online" | "degraded" | "offline";

export type NodeStatus = {
  node_id: string;
  moniker?: string | null;
  status: RouterTunnelStatus;
  connected_at: string | null;
  last_pong_at: string | null;
  uptime_secs: number | null;
  in_flight_requests: number;
  model_count: number;
};

export type NodesListResponse = {
  router_uptime_secs: number;
  tunnel_count: number;
  nodes: NodeStatus[];
};

export type ProviderOffering = {
  node_id: string;
  model_id: string;
  tunnel_status: string;
  context_length: number;
  quantization: string;
  parameter_count: string;
  source_url: string;
  features: Record<string, string>;
  concurrency: number;
  active_requests: number;
  queued_requests: number;
  /** Deprecated alias of `active_requests`. */
  active_sessions: number;
  available_slots: number;
};

export type ProviderListResponse = {
  object: "provider_list";
  data: ProviderOffering[];
};

export type FeatureCatalogEntry = {
  key: string;
  description: string;
};

export type FeatureCatalogResponse = {
  object: "feature_catalog";
  data: FeatureCatalogEntry[];
};

export type ModelCapacityAggregate = {
  modelId: string;
  providers: ProviderOffering[];
  onlineCount: number;
  totalAvailableSlots: number;
  featureKeys: string[];
  sampleQuantization: string | null;
};
