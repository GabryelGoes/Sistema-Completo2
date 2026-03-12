import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Loader2, Check } from 'lucide-react';
import { getWorkshopSettings, updateWorkshopSettings, uploadWorkshopAdminPhoto } from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chamado após salvar o nome/foto com sucesso (para o App atualizar o nome exibido). */
  onSaved?: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [displayName, setDisplayName] = useState('Rei do ABS');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getWorkshopSettings()
      .then((s) => {
        setDisplayName(s.adminDisplayName ?? 'Rei do ABS');
        setPhotoUrl(s.adminPhotoUrl ?? null);
      })
      .catch(() => setError('Não foi possível carregar o perfil.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateWorkshopSettings({ adminDisplayName: displayName.trim() || 'Rei do ABS' });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = () => fileInputRef.current?.click();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setPhotoEditorFile(file);
  };

  const handlePhotoEditorSave = async (blob: Blob) => {
    setPhotoEditorFile(null);
    setSaving(true);
    setError(null);
    try {
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const res = await uploadWorkshopAdminPhoto(file, file.name);
      setPhotoUrl(res.adminPhotoUrl);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar foto.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200/60 dark:border-white/10 w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200/60 dark:border-white/10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Perfil do administrador</h2>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        <TechnicianPhotoEditorModal
          isOpen={!!photoEditorFile}
          imageFile={photoEditorFile}
          technicianName={displayName}
          onSave={handlePhotoEditorSave}
          onCancel={() => setPhotoEditorFile(null)}
        />

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={handlePhotoSelect}
                  className="w-24 h-24 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <img src="/logo.png" alt="" className="w-full h-full object-cover" />
                  )}
                </button>
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Toque para alterar a foto (comentários, etc.)</span>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-zinc-600 dark:text-zinc-400 mb-2">Nome exibido</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="Ex.: Rei do ABS"
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
