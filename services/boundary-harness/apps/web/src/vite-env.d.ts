/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: "mock" | "api";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_SSE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type GateDecideProbe = {
  id: string;
  body: {
    decision: "pass" | "revise" | "defer";
    version: number;
    note?: string;
    structural_change?: boolean;
  };
};

interface Window {
  __lastGateDecide?: GateDecideProbe;
}
