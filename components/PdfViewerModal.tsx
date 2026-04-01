import React from 'react';
import { FileText, Download, X } from 'lucide-react';

/** Modal em tela cheia com iframe para visualizar PDF (mesma URL usada no Pátio para OS ativas). */
export function PdfViewerModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl animate-modal-backdrop">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-brand-yellow" />
          <h3 className="text-white font-bold">Visualização de Documento</h3>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Abrir Externamente / Baixar"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 w-full h-full bg-[#1e1e1e] relative">
        <iframe src={src} className="w-full h-full border-0" title="PDF Preview" />
      </div>
    </div>
  );
}
