import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Loader2, Check, Lock, User } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard, iosInput } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
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
  // Senha do administrador (alterar senha)
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminPasswordMessage, setAdminPasswordMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  const handleSaveAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPasswordMessage(null);
    if (adminNewPassword.trim().length < 4) {
      setAdminPasswordMessage({ type: 'err', text: 'A senha deve ter pelo menos 4 caracteres.' });
      return;
    }
    if (adminNewPassword !== adminConfirm) {
      setAdminPasswordMessage({ type: 'err', text: 'As senhas não coincidem.' });
      return;
    }
    setSavingAdmin(true);
    try {
      await updateWorkshopSettings({ adminPassword: adminNewPassword.trim() });
      setAdminPasswordMessage({ type: 'ok', text: 'Senha do administrador alterada!' });
      setAdminNewPassword('');
      setAdminConfirm('');
    } catch (e) {
      setAdminPasswordMessage({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' });
    } finally {
      setSavingAdmin(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} max-w-md max-h-[94vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<User className="w-6 h-6 text-white" strokeWidth={2.2} />}
              title="Perfil do administrador"
              subtitle="Nome, foto e senha de acesso total"
              gradientClass="from-blue-500 to-indigo-700"
            />
          </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        <TechnicianPhotoEditorModal
          isOpen={!!photoEditorFile}
          imageFile={photoEditorFile}
          technicianName={displayName}
          onSave={handlePhotoEditorSave}
          onCancel={() => setPhotoEditorFile(null)}
        />

        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8 space-y-6">
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
                  className={iosInput}
                  placeholder="Ex.: Rei do ABS"
                />
              </div>

              {/* Senha do administrador */}
              <section className={`${iosModalInsetCard} p-4 sm:p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-5 h-5 text-amber-500" />
                  <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Senha do administrador
                  </h3>
                </div>
                <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-4">
                  Define a senha usada no login &quot;Acesso total&quot;.
                </p>
                {adminPasswordMessage && (
                  <div
                    className={`mb-3 px-4 py-3 rounded-xl text-sm ${
                      adminPasswordMessage.type === 'ok'
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {adminPasswordMessage.text}
                  </div>
                )}
                <form onSubmit={handleSaveAdminPassword} className="space-y-3">
                  <input
                    type="password"
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="Nova senha"
                    className={iosInput}
                  />
                  <input
                    type="password"
                    value={adminConfirm}
                    onChange={(e) => setAdminConfirm(e.target.value)}
                    placeholder="Confirmar nova senha"
                    className={iosInput}
                  />
                  <button
                    type="submit"
                    disabled={savingAdmin || !adminNewPassword.trim() || adminNewPassword !== adminConfirm}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
                  >
                    {savingAdmin ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    Salvar senha do admin
                  </button>
                </form>
              </section>

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
    </div>
  );
};
