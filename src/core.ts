// Re-export layer for the frozen core contract.
//
// The core lives once in the agentic-core package. This file re-exports
// every runtime value and type so pack code can import from ./core.js
// and instanceof checks stay true. Nothing is vendored here.

export {
  createDryRunResult,
  createGuards,
  createLogger,
  defineBrand,
  dispatchText,
  getCostReport,
  GuardError,
  HttpRouterAdapter,
  LocalRouterAdapter,
  recordCost,
  resetCosts,
  summarizeText,
  VendorError,
} from "agentic-core";

export type {
  BrandConfig,
  CapsConfig,
  CostEntry,
  CostReport,
  DispatchOptions,
  DispatchReceipt,
  DispatchResult,
  Guards,
  GuardsConfig,
  HttpRouterOptions,
  LogLevel,
  Logger,
  LoggerOptions,
  QuietHoursConfig,
  RouterAdapter,
  SummarizeOptions,
  TextSummary,
  TopWord,
} from "agentic-core";