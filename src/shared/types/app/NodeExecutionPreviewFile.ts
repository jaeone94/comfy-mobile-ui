export interface NodeExecutionPreviewFile {
  filename: string;
  subfolder?: string;
  type?: 'input' | 'output' | 'temp' | string;
}
