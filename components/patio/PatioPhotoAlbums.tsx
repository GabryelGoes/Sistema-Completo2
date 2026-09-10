import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
  X,
  Camera,
  Images,
} from 'lucide-react';
import { StorageThumbImg } from '../ui/StorageThumbImg';
import {
  createServiceOrderPhotoFolder,
  deleteServiceOrderPhoto,
  deleteServiceOrderPhotoFolder,
  getServiceOrderPhotoFolderDetail,
  getServiceOrderPhotoFolders,
  renameServiceOrderPhotoFolder,
  uploadServiceOrderPhoto,
  type ServiceOrderPhoto,
  type ServiceOrderPhotoFolder,
} from '../../services/apiService';

function attachmentDisplayName(fileName: string): string {
  const base = String(fileName || '').split('/').pop() || fileName;
  return base.replace(/^\d{10,}_/, '').replace(/^entrada_[^_]+_\d+_/, 'Entrada · ');
}

/** Storage costuma gravar `{timestamp}_entrada_{osId}_….jpg`. */
function isEntradaIntakePhotoFileName(name: string): boolean {
  const base = String(name || '').trim().split('/').pop() || '';
  return /(^|_)entrada_/i.test(base);
}

const VIRTUAL_ENTRADA_ID = '__virtual_entrada__';
const VIRTUAL_OUTRAS_ID = '__virtual_outras__';

function buildVirtualFoldersFromPhotos(photos: ServiceOrderPhoto[]): {
  folders: ServiceOrderPhotoFolder[];
  photosByFolder: Record<string, ServiceOrderPhoto[]>;
} {
  const entrada: ServiceOrderPhoto[] = [];
  const outras: ServiceOrderPhoto[] = [];
  for (const photo of photos) {
    if (isEntradaIntakePhotoFileName(photo.name)) entrada.push(photo);
    else outras.push(photo);
  }
  const folders: ServiceOrderPhotoFolder[] = [];
  const photosByFolder: Record<string, ServiceOrderPhoto[]> = {};
  folders.push({
    id: VIRTUAL_ENTRADA_ID,
    name: 'Entrada do veículo',
    slug: 'entrada',
    isSystem: true,
    sortOrder: 0,
    photoCount: entrada.length,
    coverUrls: entrada.slice(0, 4).map((p) => p.url),
  });
  photosByFolder[VIRTUAL_ENTRADA_ID] = entrada;
  if (outras.length > 0) {
    folders.push({
      id: VIRTUAL_OUTRAS_ID,
      name: 'Outras fotos',
      slug: 'outras',
      isSystem: false,
      sortOrder: 50,
      photoCount: outras.length,
      coverUrls: outras.slice(0, 4).map((p) => p.url),
    });
    photosByFolder[VIRTUAL_OUTRAS_ID] = outras;
  }
  return { folders, photosByFolder };
}

function FolderCover({
  urls,
  className = '',
  dense = false,
}: {
  urls: string[];
  className?: string;
  dense?: boolean;
}) {
  const covers = urls.slice(0, 4);
  if (covers.length === 0) {
    return (
      <div
        className={`flex aspect-square items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200/80 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-950 ${className}`}
      >
        <ImageIcon
          className={`${dense ? 'h-7 w-7' : 'h-10 w-10'} text-zinc-300 dark:text-zinc-600`}
          strokeWidth={1.5}
        />
      </div>
    );
  }
  if (covers.length === 1) {
    return (
      <div className={`relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900 ${className}`}>
        <StorageThumbImg
          src={covers[0]}
          alt=""
          className="h-full w-full object-cover"
          sizes={dense ? '120px' : '200px'}
          thumbMaxWidth={dense ? 160 : 280}
          thumbMaxHeight={dense ? 160 : 280}
          thumbQuality={58}
        />
      </div>
    );
  }
  return (
    <div className={`grid aspect-square grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-white/40 dark:bg-black/40 ${className}`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative min-h-0 min-w-0 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {covers[i] ? (
            <StorageThumbImg
              src={covers[i]}
              alt=""
              className="h-full w-full object-cover"
              sizes={dense ? '60px' : '100px'}
              thumbMaxWidth={dense ? 90 : 140}
              thumbMaxHeight={dense ? 90 : 140}
              thumbQuality={50}
            />
          ) : (
            <div className="h-full w-full bg-zinc-100/80 dark:bg-zinc-900/80" />
          )}
        </div>
      ))}
    </div>
  );
}

export type PatioPhotoAlbumsProps = {
  serviceOrderId: string;
  canEdit: boolean;
  sectionTitleClassName?: string;
  onPhotosChanged?: () => void | Promise<void>;
  onPreviewPhoto?: (photos: ServiceOrderPhoto[], index: number) => void;
  onSharePhoto?: (e: React.MouseEvent, photo: { url: string; name: string }) => void;
  /** Notifica pasta aberta (para uploads do menu superior). */
  onActiveFolderChange?: (
    target: { folderId?: string; folderSlug?: string } | null
  ) => void;
  /** Permite o pai disparar refresh após upload externo. */
  refreshKey?: number;
  /**
   * Fotos já carregadas da OS (Storage). Usado para montar pastas locais
   * quando a API de pastas falha (ex.: migration ainda não aplicada) e para
   * garantir que a entrada do veículo continue visível em Anexos.
   */
  fallbackPhotos?: ServiceOrderPhoto[];
  /** Layout mais compacto (modal PC). */
  dense?: boolean;
};

export function PatioPhotoAlbums({
  serviceOrderId,
  canEdit,
  sectionTitleClassName = 'text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white',
  onPhotosChanged,
  onPreviewPhoto,
  onSharePhoto,
  onActiveFolderChange,
  refreshKey = 0,
  fallbackPhotos = [],
  dense = false,
}: PatioPhotoAlbumsProps) {
  const [folders, setFolders] = useState<ServiceOrderPhotoFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingVirtualFolders, setUsingVirtualFolders] = useState(false);
  const [virtualPhotosByFolder, setVirtualPhotosByFolder] = useState<
    Record<string, ServiceOrderPhoto[]>
  >({});
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<ServiceOrderPhotoFolder | null>(null);
  const [photos, setPhotos] = useState<ServiceOrderPhoto[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyFolderId, setBusyFolderId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const usingVirtualRef = useRef(usingVirtualFolders);
  usingVirtualRef.current = usingVirtualFolders;
  const virtualPhotosRef = useRef(virtualPhotosByFolder);
  virtualPhotosRef.current = virtualPhotosByFolder;
  const fallbackPhotosRef = useRef(fallbackPhotos);
  fallbackPhotosRef.current = fallbackPhotos;
  const openFolderIdRef = useRef(openFolderId);
  openFolderIdRef.current = openFolderId;
  const detailRequestIdRef = useRef(0);

  const applyVirtualFallback = useCallback((sourcePhotos: ServiceOrderPhoto[]) => {
    const built = buildVirtualFoldersFromPhotos(sourcePhotos);
    setFolders(built.folders);
    setVirtualPhotosByFolder(built.photosByFolder);
    setUsingVirtualFolders(true);
    setError(null);
  }, []);

  const fallbackSignature = useMemo(
    () =>
      fallbackPhotos
        .map((p) => p.path)
        .filter(Boolean)
        .sort()
        .join('|'),
    [fallbackPhotos]
  );

  const resolveLocalFolderPhotos = useCallback((folderId: string) => {
    const built = buildVirtualFoldersFromPhotos(fallbackPhotosRef.current);
    const folder =
      foldersRef.current.find((f) => f.id === folderId) ||
      built.folders.find((f) => f.id === folderId) ||
      null;
    const list =
      virtualPhotosRef.current[folderId] ||
      built.photosByFolder[folderId] ||
      (folder?.slug === 'entrada'
        ? built.photosByFolder[VIRTUAL_ENTRADA_ID]
        : folder?.slug === 'outras'
          ? built.photosByFolder[VIRTUAL_OUTRAS_ID]
          : undefined) ||
      [];
    return { folder, list };
  }, []);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getServiceOrderPhotoFolders(serviceOrderId);
      setFolders(list);
      setUsingVirtualFolders(false);
      setVirtualPhotosByFolder({});
    } catch {
      if (fallbackPhotosRef.current.length > 0) {
        applyVirtualFallback(fallbackPhotosRef.current);
      } else {
        setError('Não foi possível carregar as pastas.');
      }
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId, applyVirtualFallback]);

  const loadFolderDetail = useCallback(
    async (folderId: string) => {
      const requestId = ++detailRequestIdRef.current;
      setLoadingFolder(true);
      setError(null);
      try {
        if (usingVirtualRef.current || folderId.startsWith('__virtual_')) {
          const { folder, list } = resolveLocalFolderPhotos(folderId);
          if (requestId !== detailRequestIdRef.current) return;
          setOpenFolder(folder);
          setPhotos(list);
          return;
        }

        const detail = await getServiceOrderPhotoFolderDetail(serviceOrderId, folderId);
        if (requestId !== detailRequestIdRef.current) return;

        let nextPhotos = detail.photos;
        // Se a API devolve pasta vazia mas há fotos locais conhecidas (entrada/outras), usa fallback.
        if (nextPhotos.length === 0 && fallbackPhotosRef.current.length > 0) {
          const built = buildVirtualFoldersFromPhotos(fallbackPhotosRef.current);
          if (detail.folder.slug === 'entrada') {
            nextPhotos = built.photosByFolder[VIRTUAL_ENTRADA_ID] || [];
          } else if (detail.folder.slug === 'outras') {
            nextPhotos = built.photosByFolder[VIRTUAL_OUTRAS_ID] || [];
          }
        }

        setOpenFolder(detail.folder);
        setPhotos(nextPhotos);
        setFolders((prev) =>
          prev.map((f) =>
            f.id === detail.folder.id
              ? {
                  ...f,
                  name: detail.folder.name,
                  slug: detail.folder.slug,
                  isSystem: detail.folder.isSystem,
                  photoCount: nextPhotos.length,
                  coverUrls:
                    nextPhotos.slice(0, 4).map((p) => p.url) ||
                    detail.folder.coverUrls ||
                    f.coverUrls,
                }
              : f
          )
        );
      } catch (err) {
        if (fallbackPhotosRef.current.length > 0) {
          const built = buildVirtualFoldersFromPhotos(fallbackPhotosRef.current);
          const folder =
            built.folders.find((f) => f.id === folderId) ||
            foldersRef.current.find((f) => f.id === folderId) ||
            built.folders[0] ||
            null;
          const list = folder
            ? built.photosByFolder[folder.id] ||
              (folder.slug === 'entrada'
                ? built.photosByFolder[VIRTUAL_ENTRADA_ID]
                : folder.slug === 'outras'
                  ? built.photosByFolder[VIRTUAL_OUTRAS_ID]
                  : []) ||
              []
            : [];
          if (requestId !== detailRequestIdRef.current) return;
          setOpenFolder(folder);
          setPhotos(list);
          setUsingVirtualFolders(true);
          setVirtualPhotosByFolder(built.photosByFolder);
          setFolders(built.folders);
        } else if (requestId === detailRequestIdRef.current) {
          setError(err instanceof Error ? err.message : 'Não foi possível abrir a pasta.');
        }
      } finally {
        if (requestId === detailRequestIdRef.current) {
          setLoadingFolder(false);
        }
      }
    },
    [serviceOrderId, resolveLocalFolderPhotos]
  );

  useEffect(() => {
    void loadFolders();
  }, [loadFolders, refreshKey]);

  useEffect(() => {
    if (!usingVirtualFolders) return;
    applyVirtualFallback(fallbackPhotosRef.current);
    const currentId = openFolderIdRef.current;
    if (!currentId) return;
    const { folder, list } = resolveLocalFolderPhotos(currentId);
    setOpenFolder(folder);
    setPhotos(list);
  }, [fallbackSignature, usingVirtualFolders, applyVirtualFallback, resolveLocalFolderPhotos]);

  useEffect(() => {
    if (!openFolderId) {
      onActiveFolderChange?.(null);
      return;
    }
    const folderMeta = foldersRef.current.find((f) => f.id === openFolderId);
    const slug = folderMeta?.slug || openFolder?.slug || null;
    if (openFolderId === VIRTUAL_ENTRADA_ID || slug === 'entrada') {
      onActiveFolderChange?.(
        openFolderId.startsWith('__virtual_')
          ? { folderSlug: 'entrada' }
          : { folderId: openFolderId, folderSlug: 'entrada' }
      );
      return;
    }
    if (openFolderId === VIRTUAL_OUTRAS_ID || slug === 'outras') {
      onActiveFolderChange?.(
        openFolderId.startsWith('__virtual_')
          ? { folderSlug: 'outras' }
          : { folderId: openFolderId, folderSlug: 'outras' }
      );
      return;
    }
    onActiveFolderChange?.({ folderId: openFolderId });
  }, [openFolderId, openFolder?.slug, onActiveFolderChange]);

  const loadFolderDetailRef = useRef(loadFolderDetail);
  loadFolderDetailRef.current = loadFolderDetail;

  // Só reage a openFolderId/refreshKey — evita loop infinito quando folders muda.
  useEffect(() => {
    if (!openFolderId) {
      detailRequestIdRef.current += 1;
      setOpenFolder(null);
      setPhotos([]);
      setLoadingFolder(false);
      return;
    }
    void loadFolderDetailRef.current(openFolderId);
  }, [openFolderId, refreshKey, serviceOrderId]);

  const totalPhotos = useMemo(
    () => folders.reduce((sum, f) => sum + (f.photoCount || 0), 0),
    [folders]
  );

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creating) return;
    if (usingVirtualFolders) {
      alert(
        'Para criar pastas novas, aplique a migration de pastas de fotos no Supabase e atualize a página.'
      );
      return;
    }
    setCreating(true);
    try {
      const created = await createServiceOrderPhotoFolder(serviceOrderId, name);
      setFolders((prev) => [...prev, created]);
      setCreateOpen(false);
      setNewFolderName('');
      setOpenFolderId(created.id);
      setUsingVirtualFolders(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar pasta.');
    } finally {
      setCreating(false);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setBusyFolderId(folderId);
    try {
      const updated = await renameServiceOrderPhotoFolder(serviceOrderId, folderId, name);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...updated, photoCount: f.photoCount, coverUrls: f.coverUrls } : f)));
      if (openFolder?.id === folderId) {
        setOpenFolder((prev) => (prev ? { ...prev, name: updated.name } : prev));
      }
      setRenamingId(null);
      setRenameValue('');
      setFolderMenuId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao renomear pasta.');
    } finally {
      setBusyFolderId(null);
    }
  };

  const handleDeleteFolder = async (folder: ServiceOrderPhotoFolder) => {
    if (folder.isSystem) return;
    const msg =
      folder.photoCount > 0
        ? `Excluir a pasta “${folder.name}”? As ${folder.photoCount} foto(s) serão movidas para “Outras fotos”.`
        : `Excluir a pasta “${folder.name}”?`;
    if (!window.confirm(msg)) return;
    setBusyFolderId(folder.id);
    try {
      await deleteServiceOrderPhotoFolder(serviceOrderId, folder.id);
      if (openFolderId === folder.id) setOpenFolderId(null);
      await loadFolders();
      await onPhotosChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir pasta.');
    } finally {
      setBusyFolderId(null);
      setFolderMenuId(null);
    }
  };

  const uploadIntoOpenFolder = async (files: FileList | File[]) => {
    if (!openFolderId || !canEdit) return;
    const list = Array.from(files).filter((f) => f && f.size > 0);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const folderOpts = openFolderId.startsWith('__virtual_')
        ? {
            folderSlug:
              openFolderId === VIRTUAL_ENTRADA_ID
                ? 'entrada'
                : openFolderId === VIRTUAL_OUTRAS_ID
                  ? 'outras'
                  : undefined,
          }
        : { folderId: openFolderId };
      for (const file of list) {
        const fileName =
          openFolderId === VIRTUAL_ENTRADA_ID || openFolder?.slug === 'entrada'
            ? `entrada_${serviceOrderId}_${Date.now()}.jpg`
            : file.name;
        await uploadServiceOrderPhoto(serviceOrderId, file, fileName, folderOpts);
      }
      await onPhotosChanged?.();
      await loadFolders();
      if (openFolderId) await loadFolderDetail(openFolderId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar foto.');
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photo: ServiceOrderPhoto) => {
    if (!canEdit) return;
    if (!window.confirm('Excluir esta foto permanentemente?')) return;
    setDeletingPath(photo.path);
    try {
      await deleteServiceOrderPhoto(serviceOrderId, photo.path);
      setPhotos((prev) => prev.filter((p) => p.path !== photo.path));
      await loadFolders();
      await onPhotosChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir foto.');
    } finally {
      setDeletingPath(null);
    }
  };

  if (loading && folders.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[#007AFF]" />
      </div>
    );
  }

  if (error && folders.length === 0 && !openFolderId) {
    return (
      <div className="rounded-2xl bg-zinc-50/80 px-4 py-6 text-center dark:bg-white/[0.03]">
        <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">{error}</p>
        <button
          type="button"
          onClick={() => void loadFolders()}
          className="mt-3 text-[13px] font-semibold text-[#007AFF]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  /* —— Interior da pasta —— */
  if (openFolderId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenFolderId(null)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100/90 text-[#007AFF] transition-colors hover:bg-zinc-200/90 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            aria-label="Voltar às pastas"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <div className="min-w-0 flex-1">
            <p className={`${sectionTitleClassName} truncate`}>
              {openFolder?.name || 'Pasta'}
            </p>
            <p className="text-[12px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </p>
          </div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void uploadIntoOpenFolder(e.target.files);
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void uploadIntoOpenFolder(e.target.files);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => cameraRef.current?.click()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#007AFF] text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                title="Câmera"
                aria-label="Adicionar pela câmera"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" strokeWidth={2.25} />}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => galleryRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-100/90 px-3 text-[13px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-200/90 disabled:opacity-50 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.12]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Galeria
              </button>
            </div>
          ) : null}
        </div>

        {loadingFolder ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#007AFF]" />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-zinc-50 to-zinc-100/60 px-6 py-14 text-center dark:from-white/[0.04] dark:to-white/[0.02]">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.2)] dark:bg-zinc-900 dark:shadow-none">
              <Images className="h-7 w-7 text-[#007AFF]" strokeWidth={1.75} />
            </div>
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">Nenhuma foto nesta pasta</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Adicione fotos da câmera ou da galeria. Elas ficam organizadas neste álbum.
            </p>
          </div>
        ) : (
          <div
            className={
              dense
                ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-2.5'
                : 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 md:gap-3'
            }
          >
            {photos.map((photo, photoIndex) => {
              const label = attachmentDisplayName(photo.name);
              const isDeleting = deletingPath === photo.path;
              return (
                <div key={photo.path} className="group flex min-w-0 flex-col gap-1.5">
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => onPreviewPhoto?.(photos, photoIndex)}
                      className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/60"
                    >
                      <StorageThumbImg
                        src={photo.url}
                        alt={label}
                        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        sizes="(max-width: 640px) 45vw, 180px"
                        thumbMaxWidth={220}
                        thumbMaxHeight={220}
                        thumbQuality={54}
                        loading={photoIndex < 8 ? 'eager' : 'lazy'}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      {onSharePhoto ? (
                        <button
                          type="button"
                          onClick={(e) => onSharePhoto(e, { url: photo.url, name: photo.name })}
                          className="rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm"
                          title="Compartilhar"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void handleDeletePhoto(photo)}
                          className="rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm disabled:opacity-50"
                          title="Excluir"
                          aria-label="Excluir foto"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="truncate px-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400" title={label}>
                    {label}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* —— Grade de álbuns —— */
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={sectionTitleClassName}>Pastas de fotos</p>
          <p className="mt-0.5 text-[12px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
            {folders.length} {folders.length === 1 ? 'pasta' : 'pastas'}
            {totalPhotos > 0 ? ` · ${totalPhotos} ${totalPhotos === 1 ? 'foto' : 'fotos'}` : ''}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setNewFolderName('');
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#007AFF] px-3 py-1.5 text-[12px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            <FolderPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
            Nova pasta
          </button>
        ) : null}
      </div>

      <div
        className={
          dense
            ? 'flex flex-wrap gap-x-3 gap-y-4'
            : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4'
        }
      >
        {folders.map((folder) => {
          const busy = busyFolderId === folder.id;
          const menuOpen = folderMenuId === folder.id;
          const isRenaming = renamingId === folder.id;
          return (
            <div
              key={folder.id}
              className={`relative min-w-0 ${dense ? 'w-[112px] sm:w-[120px]' : ''}`}
            >
              {isRenaming ? (
                <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleRenameFolder(folder.id);
                      }
                      if (e.key === 'Escape') {
                        setRenamingId(null);
                        setRenameValue('');
                      }
                    }}
                    className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-zinc-900 outline-none ring-1 ring-zinc-200/80 focus:ring-2 focus:ring-[#007AFF]/35 dark:bg-zinc-900 dark:text-white dark:ring-white/10"
                    autoFocus
                    disabled={busy}
                    maxLength={80}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(null);
                        setRenameValue('');
                      }}
                      className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-zinc-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={busy || !renameValue.trim()}
                      onClick={() => void handleRenameFolder(folder.id)}
                      className="rounded-lg bg-[#007AFF] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenFolderId(folder.id)}
                    className="group w-full text-left focus:outline-none"
                  >
                    <div
                      className={`overflow-hidden shadow-[0_12px_32px_-18px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out group-hover:scale-[1.015] group-active:scale-[0.985] dark:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.65)] ${
                        dense ? 'rounded-xl' : 'rounded-2xl'
                      }`}
                    >
                      <FolderCover
                        urls={folder.coverUrls || []}
                        dense={dense}
                        className={dense ? '!rounded-xl' : undefined}
                      />
                    </div>
                    <div className={`mt-2 flex items-start gap-1 ${dense ? 'px-0' : 'px-0.5'}`}>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate font-semibold tracking-tight text-zinc-900 dark:text-white ${
                            dense ? 'text-[12px]' : 'text-[14px]'
                          }`}
                        >
                          {folder.name}
                        </p>
                        <p
                          className={`font-medium tabular-nums text-zinc-500 dark:text-zinc-400 ${
                            dense ? 'text-[11px]' : 'text-[12px]'
                          }`}
                        >
                          {folder.photoCount} {folder.photoCount === 1 ? 'foto' : 'fotos'}
                          {folder.isSystem ? ' · Sistema' : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                  {canEdit && !folder.isSystem && !folder.id.startsWith('__virtual_') ? (
                    <div className="absolute right-1 top-[calc(100%-2.6rem)]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderMenuId(menuOpen ? null : folder.id);
                        }}
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.08] dark:hover:text-zinc-200"
                        aria-label="Opções da pasta"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl bg-white py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] dark:bg-zinc-900 dark:shadow-[0_20px_48px_-14px_rgba(0,0,0,0.7)]">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                            onClick={() => {
                              setRenamingId(folder.id);
                              setRenameValue(folder.name);
                              setFolderMenuId(null);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#007AFF]" />
                            Renomear
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            onClick={() => void handleDeleteFolder(folder)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[420] flex items-end justify-center bg-black/35 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="patio-new-photo-folder-title"
            className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_-20px_rgba(0,0,0,0.45)] dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h3 id="patio-new-photo-folder-title" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                Nova pasta
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-full bg-zinc-100 p-1.5 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-5 pt-2">
              <p className="mb-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Organize fotos do veículo em álbuns — como no app Fotos.
              </p>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateFolder();
                  }
                }}
                placeholder="Ex.: Diagnóstico, Entrega, Peças"
                maxLength={80}
                autoFocus
                className="w-full rounded-2xl bg-zinc-100 px-4 py-3 text-[15px] font-medium text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:bg-zinc-50 focus:ring-2 focus:ring-[#007AFF]/30 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-zinc-500 dark:focus:bg-white/[0.08]"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-full px-4 py-2.5 text-[14px] font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creating || !newFolderName.trim()}
                  onClick={() => void handleCreateFolder()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#007AFF] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
