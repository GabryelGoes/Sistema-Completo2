import React from 'react';
import { FileText, Download, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { mediaOverlayIconBtn } from './ui/iosModalStyles';

/**
 * Modal em tela cheia com iframe para visualizar PDF.
 * Renderizado em `document.body` com z-index acima dos modais do Pátio (portal z-[100]),
 * senão o visualizador ficaria invisível atrás do overlay do veículo.
 */
export function PdfViewerModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <ModalPortal>
    <div data-media-overlay className="fixed inset-0 z-[300] flex flex-col bg-black/95 backdrop-blur-xl animate-modal-backdrop">
      <div className="flex items-center justify-between border-b border-white/15 bg-black/70 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-brand-yellow" />
          <h3 className="text-white font-bold">Visualização de Documento</h3>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className={mediaOverlayIconBtn}
            title="Abrir Externamente / Baixar"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className={mediaOverlayIconBtn}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 w-full h-full bg-[#1e1e1e] relative">
        <iframe src={src} className="w-full h-full border-0" title="PDF Preview" />
      </div>
    </div>
    </ModalPortal>
  );
}
