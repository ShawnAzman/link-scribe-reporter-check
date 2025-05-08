
export interface LinkCheckResult {
  url: string;
  isWorking: boolean;
  statusCode?: number | string;
  error?: string;
  sourcePage?: string; // The page where this link was found
}
