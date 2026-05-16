export type QaAgentConfig = {
  documentationPath: string;
  registryPath: string;
  reportPath: string;
  htmlReportPath?: string;
  backendBaseUrl?: string;
  frontendBaseUrl?: string;
  llm?: {
    enabled: boolean;
    controlledRequirementExtraction?: boolean;
  };
};
