import React from 'react';
import { X } from 'lucide-react';

interface ExternalPatioViewProps {
  onClose: () => void;
}

export const ExternalPatioView: React.FC<ExternalPatioViewProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-black animate-in fade-in duration-500">
      {/* Iframe Full Screen */}
      <iframe 
        src="https://sistema-final-patio.vercel.app/" 
        className="w-full h-full border-0"
        title="Visão Pátio Completa"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />

      {/* Botão Fechar Discreto - Reduzido e movido para a esquerda */}
      <button 
        onClick={onClose}
        className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 dark:bg-black/40 backdrop-blur-md text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/20 dark:hover:bg-black/60 border border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300 group z-[101]"
        aria-label="Fechar Visão Pátio"
      >
        <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};