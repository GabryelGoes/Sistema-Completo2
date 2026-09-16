/** Tipagem mínima do driver vendored `niimbot.js` (IIFE → window.Niimbot). */

export type NiimbotModel = {
  name_prefixes: string[];
  task: string;
  density?: number;
  label_type?: number;
  speed?: number;
};

export type NiimbotSize = {
  w_px: number;
  h_px: number;
  offset_y_px?: number;
};

export type NiimbotPrintOpts = {
  model: NiimbotModel;
  size: NiimbotSize;
  copies?: number;
  density?: number;
  offsetY?: number;
  onProgress?: (status: string) => void;
};

export type NiimbotPrinterInfo = {
  modelId: number;
  protocolVersion: number;
  label: string;
  task: string;
  dpi: number;
} | null;

export type NiimbotApi = {
  VERSION?: string;
  isSupported: () => boolean;
  connect: (model: NiimbotModel) => Promise<void>;
  disconnect: () => Promise<void>;
  identify: (model: NiimbotModel) => Promise<NiimbotPrinterInfo>;
  printImage: (url: string, opts: NiimbotPrintOpts) => Promise<void>;
  printBatch: (urls: string[], opts: NiimbotPrintOpts) => Promise<void>;
  printer: NiimbotPrinterInfo;
};

declare global {
  interface Window {
    Niimbot: NiimbotApi;
  }
  // eslint-disable-next-line no-var
  var Niimbot: NiimbotApi;
}

export {};
