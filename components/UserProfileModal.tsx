import React, { useState, useRef } from 'react';
import { X, Camera, Loader2, Check, User, Lock } from 'lucide-react';
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  uploadMyProfilePhoto,
} from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';

interface UserProfileModalProps {
  isOpen: boolean;
  username: string;
  initialDisplayName: string;
  initialPhotoUrl: string | null;
  onClose: () => void;
  onProfileUpdated?: (data: { displayName?: string; photoUrl?: string | null }) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  username,
  initialDisplayName,
  initialPhotoUrl,
  onClose,
  onProfileUpdated,
}) => {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim()) {
      setError('Informe a senha atual para salvar o nome.');
      return;
    }
    setError(null);
    setMessage(null);
    setSavingName(true);
    try {
      const updated = await updateMyProfile(username, currentPassword, {
        displayName: displayName.trim() || username,
      });
      setDisplayName(updated.displayName);
      onProfileUpdated?.({ displayName: updated.displayName });
      setMessage('Nome salvo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSavingName(false);
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
    if (!currentPassword.trim()) {
      setError('Informe a senha atual para alterar a foto.');
      return;
    }
    setError(null);
    setSavingPhoto(true);
    try {
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const res = await uploadMyProfilePhoto(username, currentPassword, file, file.name);
      setPhotoUrl(res.photoUrl);
      onProfileUpdated?.({ photoUrl: res.photoUrl });
      setMessage('Foto atualizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar foto.');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!currentPassword.trim()) {
      setError('Informe a senha atual.');
      return;
    }
    if (newPassword.length < 4) {
      setError('A nova senha deve ter no mínimo 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeMyPassword(username, currentPassword, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Senha alterada com sucesso.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar senha.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200/60 dark:border-white/10 w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200/60 dark:border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Configurações de perfil</h2>
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

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm">
              {message}
            </div>
          )}

          {/* Foto de perfil */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handlePhotoSelect}
              className="w-24 h-24 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-10 h-10 text-zinc-500 dark:text-zinc-400" />
              )}
            </button>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Toque para alterar a foto</span>
          </div>

          {/* Nome exibido */}
          <form onSubmit={handleSaveName} className="space-y-2">
            <label className="block text-[13px] font-medium text-zinc-600 dark:text-zinc-400">Nome exibido</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Seu nome"
              />
              <button type="submit" disabled={savingName} className="px-4 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-medium flex items-center gap-1">
                {savingName ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Salvar
              </button>
            </div>
          </form>

          {/* Usuário de acesso (somente leitura) */}
          <div>
            <label className="block text-[13px] font-medium text-zinc-600 dark:text-zinc-400 mb-2">Usuário de acesso</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300">
              <User className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
              <span className="text-[15px]">{username}</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">Usado para entrar no sistema. Não pode ser alterado aqui.</p>
          </div>

          {/* Senha atual (para salvar nome/foto) */}
          <div>
            <label className="block text-[13px] font-medium text-zinc-600 dark:text-zinc-400 mb-2">Senha atual</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Necessária para salvar alterações"
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Alterar senha */}
          <form onSubmit={handleChangePassword} className="space-y-3 pt-2 border-t border-zinc-200 dark:border-white/10">
            <h3 className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Alterar senha de acesso</h3>
            <div>
              <label className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Mínimo 4 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Repita a nova senha"
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={changingPassword || !currentPassword.trim() || newPassword.length < 4 || newPassword !== confirmPassword} className="w-full py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2">
              {changingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              Alterar senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
