export type PreviewFileReference =
  | string
  | {
      filename: string;
      subfolder?: string;
      type?: 'input' | 'output' | 'temp';
    };
