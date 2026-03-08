import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Users, Plus, Pencil, Trash2, Check, Loader2, Camera, ImagePlus } from 'lucide-react';
import {
  getWorkshopTechnicians,
  createWorkshopTechnician,
  updateWorkshopTechnician,
  deleteWorkshopTechnician,
  uploadWorkshopTechnicianPhoto,
  type WorkshopTechnician,
} from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';

function capitalizeFirst(str: string): string {
  if (!str || !str.trim()) return str;
  return str.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

const COLOR_OPTIONS: { value: string; label: string; class: string }[] = [
  { value: 'red', label: 'Vermelho', class: 'bg-red-600' },
  { value: 'blue', label: 'Azul', class: 'bg-blue-600' },
  { value: 'green', label: 'Verde', class: 'bg-green-600' },
  { value: 'amber', label: 'Âmbar', class: 'bg-amber-500' },
  { value: 'zinc', label: 'Neutro', class: 'bg-zinc-600' },
];

interface WorkshopTechniciansModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkshopTechniciansModal: React.FC<WorkshopTechniciansModalProps> = ({ isOpen, onClose }) => {
  const [technicians, setTechnicians] = useState<WorkshopTechnician[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>('zinc');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState<string>('zinc');
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const [photoEditorTechId, setPhotoEditorTechId] = useState<string | null>(null);
  const [photoEditorTechName, setPhotoEditorTechName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTechnicians = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopTechnicians();
      setTechnicians(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar técnicos.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchTechnicians();
  }, [isOpen, fetchTechnicians]);

  const handleAdd = async () => {
    const slug = newSlug.trim().toLowerCase().replace(/\s+/g, '_');
    const name = newName.trim();
    if (!slug || !name || adding) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createWorkshopTechnician(slug, name, newColor);
      setTechnicians((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewSlug('');
      setNewName('');
      setNewColor('zinc');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: WorkshopTechnician) => {
    setEditingId(t.id);
    setEditingSlug(t.slug);
    setEditingName(t.name);
    setEditingColor(t.color_style || 'zinc');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingSlug('');
    setEditingName('');
    setEditingColor('zinc');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingSlug.trim() || !editingName.trim()) {
      cancelEdit();
      return;
    }
    setError(null);
    try {
      const updated = await updateWorkshopTechnician(editingId, {
        slug: editingSlug.trim(),
        name: editingName.trim(),
        color_style: editingColor,
      });
      setTechnicians((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este técnico da lista? Os cards que o tiverem atribuído continuarão com o nome antigo até você reatribuir.')) return;
    setError(null);
    try {
      await deleteWorkshopTechnician(id);
      setTechnicians((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    }
  };

  const triggerPhotoInput = (technicianId: string) => {
    (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current?.setAttribute?.('data-tech-id', technicianId);
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const techId = fileInputRef.current?.getAttribute?.('data-tech-id');
    const file = e.target.files?.[0];
    if (!techId || !file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    const tech = technicians.find((t) => t.id === techId);
    setPhotoEditorFile(file);
    setPhotoEditorTechId(techId);
    setPhotoEditorTechName(tech ? capitalizeFirst(tech.name) : 'Técnico');
  };

  const handlePhotoEditorSave = async (blob: Blob) => {
    const techId = photoEditorTechId;
    if (!techId) return;
    setPhotoEditorFile(null);
    setPhotoEditorTechId(null);
    setPhotoEditorTechName('');
    setUploadingPhotoId(techId);
    setError(null);
    try {
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const updated = await uploadWorkshopTechnicianPhoto(techId, file, file.name);
      setTechnicians((prev) => prev.map((t) => (t.id === techId ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar foto.');
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const handlePhotoEditorCancel = () => {
    setPhotoEditorFile(null);
    setPhotoEditorTechId(null);
    setPhotoEditorTechName('');
  };

  const colorClass = (colorStyle: string | null) => {
    const c = (colorStyle || 'zinc').toLowerCase();
    const opt = COLOR_OPTIONS.find((o) => o.value === c);
    return opt ? opt.class : 'bg-zinc-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-3xl h-[92vh] max-h-[92vh] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-500 dark:text-violet-400" />
            Técnicos
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
          aria-label="Selecionar foto (arquivo ou câmera)"
        />

        <TechnicianPhotoEditorModal
          isOpen={!!photoEditorFile}
          imageFile={photoEditorFile}
          technicianName={photoEditorTechName}
          onSave={handlePhotoEditorSave}
          onCancel={handlePhotoEditorCancel}
        />

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Cadastre os técnicos para atribuir nos cards do pátio. O identificador (slug) é usado internamente; o nome aparece nos cards. Toque no ícone de câmera para adicionar ou alterar a foto (arquivo ou câmera do dispositivo).
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm">
            <div className="p-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03] space-y-2">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="Identificador (ex: gabryel)"
                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="Nome (ex: Gabryel)"
                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Cor:</span>
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewColor(opt.value)}
                    className={`w-8 h-8 rounded-full ${opt.class} ${newColor === opt.value ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-offset-[#1C1C1E] ring-white' : 'opacity-70 hover:opacity-100'} transition-opacity`}
                    title={opt.label}
                  />
                ))}
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newSlug.trim() || !newName.trim() || adding}
                  className="ml-auto shrink-0 w-10 h-10 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
                >
                  {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : technicians.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum técnico cadastrado.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">Adicione acima para atribuir nos cards do pátio.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/50 dark:divide-white/[0.06]">
                {technicians.map((t) => (
                  <div
                    key={t.id}
                    className="min-h-[52px] flex items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    {editingId === t.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => triggerPhotoInput(t.id)}
                          disabled={uploadingPhotoId === t.id}
                          className="w-10 h-10 rounded-full overflow-hidden border-2 border-dashed border-zinc-300 dark:border-white/20 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:border-violet-500/50 shrink-0"
                          title="Foto (arquivo ou câmera)"
                        >
                          {uploadingPhotoId === t.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                          ) : t.photo_url ? (
                            <img src={t.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImagePlus className="w-5 h-5 text-zinc-400" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={editingSlug}
                          onChange={(e) => setEditingSlug(e.target.value)}
                          placeholder="Slug"
                          className="w-24 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                        />
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          placeholder="Nome"
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          {COLOR_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setEditingColor(opt.value)}
                              className={`w-7 h-7 rounded-full ${opt.class} ${editingColor === opt.value ? 'ring-2 ring-offset-1 ring-zinc-900 dark:ring-white' : 'opacity-70'} transition-opacity`}
                              title={opt.label}
                            />
                          ))}
                        </div>
                        <button type="button" onClick={handleSaveEdit} className="w-9 h-9 rounded-lg bg-violet-500 text-white flex items-center justify-center hover:bg-violet-600">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={cancelEdit} className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-white/20">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => triggerPhotoInput(t.id)}
                            disabled={uploadingPhotoId === t.id}
                            className="w-10 h-10 rounded-full overflow-hidden border-2 border-zinc-200 dark:border-white/10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:ring-2 hover:ring-violet-500/50 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500"
                            title="Adicionar ou alterar foto (arquivo ou câmera)"
                          >
                            {uploadingPhotoId === t.id ? (
                              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                            ) : t.photo_url ? (
                              <img src={t.photo_url} alt={capitalizeFirst(t.name)} className="w-full h-full object-cover" />
                            ) : (
                              <div className={`w-full h-full rounded-full flex items-center justify-center text-sm font-bold text-white ${colorClass(t.color_style)}`}>
                                {capitalizeFirst(t.name).charAt(0)}
                              </div>
                            )}
                          </button>
                          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                            <Camera className="w-3 h-3 text-white" />
                          </span>
                        </div>
                        <span className="flex-1 min-w-0 text-[17px] font-medium text-zinc-900 dark:text-white truncate">{capitalizeFirst(t.name)}</span>
                        <span className="text-[13px] text-zinc-400 dark:text-zinc-500 truncate max-w-[100px]">{t.slug}</span>
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-violet-600 hover:bg-violet-500/10 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
