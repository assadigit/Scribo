declare module "mammoth/mammoth.browser" {
  export interface ConvertToHtmlInput {
    arrayBuffer?: ArrayBuffer;
    path?: string;
  }
  export interface ConvertResult {
    value: string;
    messages: unknown[];
  }
  export function convertToHtml(input: ConvertToHtmlInput): Promise<ConvertResult>;
}
