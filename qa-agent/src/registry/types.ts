import type { Metadata, Tolerance } from '../shared/types';

export type OracleStatus =
  | 'implemented'
  | 'partially_implemented'
  | 'external_reference_required'
  | 'app_endpoint_only'
  | 'not_implemented';

export type BackendEndpointMapping = {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  auth?: 'none' | 'guest' | 'employee' | 'admin';
  formulaType?: string;
  resultPath?: string;
  requestShape?: string;
  notes?: string[];
};

export type OracleMetadata = {
  status: OracleStatus;
  notes?: string[];
};

export type RegistryExample = {
  id?: string;
  input: Record<string, unknown>;
  expected?: unknown;
  kind?: 'fixed' | 'edge' | 'property' | 'metamorphic';
  metadata?: Metadata;
};

export type FormulaDefinition = {
  id: string;
  expression: string;
  variables: string[];
  output: string;
  tolerance?: Tolerance;
  constraints?: string[];
  sourceRefs?: string[];
  implementationRefs?: string[];
  backendEndpoint?: BackendEndpointMapping;
  oracle?: OracleMetadata;
  engineeringReview?: string[];
  examples?: RegistryExample[];
  metadata?: Metadata;
};

export type AlgorithmDefinition = {
  id: string;
  description: string;
  inputs: string[];
  outputs: string[];
  constraints?: string[];
  sourceRefs?: string[];
  implementationRefs?: string[];
  backendEndpoint?: BackendEndpointMapping;
  oracle?: OracleMetadata;
  engineeringReview?: string[];
  examples?: RegistryExample[];
  properties?: string[];
  metadata?: Metadata;
};

export type RegistryFile = {
  formulas?: FormulaDefinition[];
  algorithms?: AlgorithmDefinition[];
  testCases?: unknown[];
};
