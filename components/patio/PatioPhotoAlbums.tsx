import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  Check,
} from 'lucide-react';
import { StorageThumbImg } from '../ui/StorageThumbImg';
import {
  createServiceOrderPhotoFolder,
  deleteServiceOrderPhoto,
  deleteServiceOrderPhotoFolder,
  getServiceOrderPhotoFolderDetail,
  getServiceOrderPhotoFolders,
  moveServiceOrderPhotoToFolder,
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
      name: 'Biblioteca',
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
  const aspect = dense ? 'aspect-[3/4]' : 'aspect-[3/4]';
  if (covers.length === 0) {
    return (
      <div
        className={`flex ${aspect} items-center justify-center bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-300 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-950 ${className}`}
      >
        <ImageIcon
          className={`${dense ? 'h-9 w-9' : 'h-11 w-11'} text-white/70`}
          strokeWidth={1.5}
        />
      </div>
    );
  }
  if (covers.length === 1) {
    return (
      <div className={`relative ${aspect} overflow-hidden bg-zinc-200 dark:bg-zinc-900 ${className}`}>
        <StorageThumbImg
          src={covers[0]}
          alt=""
          className="h-full w-full object-cover"
          sizes={dense ? '200px' : '260px'}
          thumbMaxWidth={dense ? 320 : 420}
          thumbMaxHeight={dense ? 420 : 560}
          thumbQuality={62}
        />
      </div>
    );
  }
  return (
    <div className={`grid ${aspect} grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-black/20 ${className}`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative min-h-0 min-w-0 overflow-hidden bg-zinc-200 dark:bg-zinc-900">
          {covers[i] ? (
            <StorageThumbImg
              src={covers[i]}
              alt=""
              className="h-full w-full object-cover"
              sizes={dense ? '100px' : '130px'}
              thumbMaxWidth={dense ? 160 : 210}
              thumbMaxHeight={dense ? 160 : 210}
              thumbQuality={55}
            />
          ) : (
            <div className="h-full w-full bg-zinc-300/80 dark:bg-zinc-800" />
          )}
        </div>
      ))}
    </div>
  );
}

const iosAlbumsTitleClass =
  "font-[-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif] text-[22px] font-bold tracking-[-0.015em] text-zinc-950 dark:text-white sm:text-[24px]";

export type PatioPhotoAlbumsProps = {
  serviceOrderId: string;
  canEdit: boolean;
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
  const [libraryPhotos, setLibraryPhotos] = useState<ServiceOrderPhoto[]>([]);
  const [loadingLibraryPhotos, setLoadingLibraryPhotos] = useState(false);
  const [importPhotoPaths, setImportPhotoPaths] = useState<string[]>([]);
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
      const byFolder: Record<string, ServiceOrderPhoto[]> = {};
      for (const folder of list) {
        if (Array.isArray(folder.photos)) {
          byFolder[folder.id] = folder.photos;
        }
      }
      setVirtualPhotosByFolder(byFolder);
      setUsingVirtualFolders(false);
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
      setError(null);

      const folderMeta = foldersRef.current.find((f) => f.id === folderId) || null;
      const cachedFromMap = virtualPhotosRef.current[folderId];
      const cachedFromFolder = folderMeta?.photos;
      const isVirtual = usingVirtualRef.current || folderId.startsWith('__virtual_');
      const cached =
        cachedFromMap ||
        cachedFromFolder ||
        (isVirtual ? resolveLocalFolderPhotos(folderId).list : undefined);

      // Abre na hora com o cache da listagem — sem spinner.
      if (cached) {
        if (requestId !== detailRequestIdRef.current) return;
        setOpenFolder(folderMeta || resolveLocalFolderPhotos(folderId).folder);
        setPhotos(cached);
        setLoadingFolder(false);
        return;
      }

      if (isVirtual) {
        const { folder, list } = resolveLocalFolderPhotos(folderId);
        if (requestId !== detailRequestIdRef.current) return;
        setOpenFolder(folder);
        setPhotos(list);
        setLoadingFolder(false);
        return;
      }

      setLoadingFolder(true);
      try {
        const detail = await getServiceOrderPhotoFolderDetail(serviceOrderId, folderId);
        if (requestId !== detailRequestIdRef.current) return;

        let nextPhotos = detail.photos;
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
        setVirtualPhotosByFolder((prev) => ({ ...prev, [folderId]: nextPhotos }));
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
                  photos: nextPhotos,
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

  useEffect(() => {
    if (!createOpen) {
      setLibraryPhotos([]);
      setImportPhotoPaths([]);
      setLoadingLibraryPhotos(false);
      return;
    }
    let cancelled = false;
    setLoadingLibraryPhotos(true);
    void (async () => {
      try {
        const libraryFolder =
          foldersRef.current.find((f) => f.slug === 'outras') ||
          foldersRef.current.find((f) => /^(biblioteca|outras fotos)$/i.test(f.name));
        if (libraryFolder && !libraryFolder.id.startsWith('__virtual_')) {
          const detail = await getServiceOrderPhotoFolderDetail(
            serviceOrderId,
            libraryFolder.id
          );
          if (!cancelled) setLibraryPhotos(detail.photos);
          return;
        }
        const built = buildVirtualFoldersFromPhotos(fallbackPhotosRef.current);
        if (!cancelled) {
          setLibraryPhotos(built.photosByFolder[VIRTUAL_OUTRAS_ID] || []);
        }
      } catch {
        const built = buildVirtualFoldersFromPhotos(fallbackPhotosRef.current);
        if (!cancelled) {
          setLibraryPhotos(built.photosByFolder[VIRTUAL_OUTRAS_ID] || []);
        }
      } finally {
        if (!cancelled) setLoadingLibraryPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen, serviceOrderId]);

  const toggleImportPhoto = (path: string) => {
    setImportPhotoPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

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
      if (importPhotoPaths.length > 0) {
        for (const path of importPhotoPaths) {
          await moveServiceOrderPhotoToFolder(serviceOrderId, path, created.id);
        }
      }
      setCreateOpen(false);
      setNewFolderName('');
      setImportPhotoPaths([]);
      setUsingVirtualFolders(false);
      await onPhotosChanged?.();
      await loadFolders();
      setOpenFolderId(created.id);
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
        ? `Excluir a pasta “${folder.name}”? As ${folder.photoCount} foto(s) serão movidas para a Biblioteca.`
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
      <div className="space-y-4 font-[-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpenFolderId(null)}
            className="inline-flex h-10 items-center gap-0.5 rounded-full px-1.5 text-[17px] font-medium text-[#007AFF] transition-colors hover:bg-[#007AFF]/10 active:opacity-70 dark:text-[#7ab8ff]"
            aria-label="Voltar às pastas"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
            Fotos
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-zinc-950 dark:text-white">
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[#007AFF] transition-[filter,transform] hover:bg-zinc-200/90 active:scale-[0.96] disabled:opacity-50 dark:bg-white/[0.08] dark:text-[#7ab8ff]"
                title="Câmera"
                aria-label="Adicionar pela câmera"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" strokeWidth={2.25} />}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => galleryRef.current?.click()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[#007AFF] transition-colors hover:bg-zinc-200/90 disabled:opacity-50 dark:bg-white/[0.08] dark:text-[#7ab8ff]"
                title="Galeria"
                aria-label="Adicionar da galeria"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <div className="w-[76px] shrink-0" aria-hidden />
          )}
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

  /* —— Grade de álbuns (estilo Coleções / Memórias do iOS) —— */
  return (
    <div className="space-y-3 font-[-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif]">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className={`inline-flex min-w-0 items-center gap-1 ${iosAlbumsTitleClass}`}>
          <span className="truncate">Fotos</span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500"
            strokeWidth={2.5}
            aria-hidden
          />
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setNewFolderName('');
              setImportPhotoPaths([]);
            }}
            className="inline-flex shrink-0 items-center rounded-full bg-zinc-100 px-3.5 py-1.5 text-[15px] font-semibold text-[#007AFF] transition-colors hover:bg-zinc-200/90 active:scale-[0.98] dark:bg-white/[0.08] dark:text-[#7ab8ff] dark:hover:bg-white/[0.12]"
          >
            Nova pasta
          </button>
        ) : null}
      </div>

      <div
        className={
          dense
            ? '-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : '-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        {folders.map((folder) => {
          const busy = busyFolderId === folder.id;
          const menuOpen = folderMenuId === folder.id;
          const isRenaming = renamingId === folder.id;
          const cardWidth = dense ? 'w-[168px] sm:w-[184px]' : 'w-[196px] sm:w-[210px]';
          return (
            <div key={folder.id} className={`relative shrink-0 ${cardWidth}`}>
              {isRenaming ? (
                <div className="rounded-[22px] bg-zinc-100 p-3 dark:bg-white/[0.06]">
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
                    className="w-full rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-zinc-900 outline-none focus:ring-2 focus:ring-[#007AFF]/30 dark:bg-zinc-900 dark:text-white"
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
                      className="rounded-lg px-2.5 py-1 text-[13px] font-semibold text-zinc-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={busy || !renameValue.trim()}
                      onClick={() => void handleRenameFolder(folder.id)}
                      className="rounded-lg bg-[#007AFF] px-2.5 py-1 text-[13px] font-semibold text-white disabled:opacity-50"
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
                    className="group relative block w-full overflow-hidden rounded-[22px] text-left outline-none transition-transform duration-300 ease-out hover:scale-[1.015] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[#007AFF]/50"
                  >
                    <FolderCover
                      urls={folder.coverUrls || []}
                      dense={dense}
                      className="rounded-[22px]"
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                      <p
                        className="truncate text-[17px] font-bold leading-tight tracking-[-0.01em] text-white"
                        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}
                      >
                        {folder.name}
                      </p>
                      <p
                        className="mt-0.5 text-[13px] font-medium tabular-nums text-white/90"
                        style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}
                      >
                        {folder.photoCount} {folder.photoCount === 1 ? 'foto' : 'fotos'}
                      </p>
                    </div>
                  </button>
                  {canEdit && !folder.isSystem && !folder.id.startsWith('__virtual_') ? (
                    <div className="absolute right-2 top-2 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderMenuId(menuOpen ? null : folder.id);
                        }}
                        className="rounded-full bg-black/35 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/50"
                        aria-label="Opções da pasta"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 z-20 mt-1.5 min-w-[9.5rem] overflow-hidden rounded-2xl bg-white/95 py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:bg-zinc-900/95">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[15px] font-medium text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
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
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[15px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
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
            className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_-20px_rgba(0,0,0,0.45)] dark:bg-zinc-950"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-2">
              <p className="mb-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Dê um nome ao álbum. Você pode trazer fotos da Biblioteca para esta pasta.
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

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Importar da Biblioteca
                  </p>
                  {libraryPhotos.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={creating || importPhotoPaths.length === libraryPhotos.length}
                        onClick={() => setImportPhotoPaths(libraryPhotos.map((p) => p.path))}
                        className="text-[12px] font-semibold text-[#007AFF] disabled:opacity-40"
                      >
                        Todas
                      </button>
                      <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        disabled={creating || importPhotoPaths.length === 0}
                        onClick={() => setImportPhotoPaths([])}
                        className="text-[12px] font-semibold text-zinc-500 disabled:opacity-40 dark:text-zinc-400"
                      >
                        Limpar
                      </button>
                    </div>
                  ) : null}
                </div>
                {loadingLibraryPhotos ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#007AFF]" />
                  </div>
                ) : libraryPhotos.length === 0 ? (
                  <p className="rounded-2xl bg-zinc-50 px-3 py-4 text-center text-[13px] text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">
                    A Biblioteca ainda não tem fotos para importar.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-[12px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      {importPhotoPaths.length} de {libraryPhotos.length} selecionada
                      {libraryPhotos.length === 1 ? '' : 's'}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {libraryPhotos.map((photo) => {
                        const selected = importPhotoPaths.includes(photo.path);
                        const label = attachmentDisplayName(photo.name);
                        return (
                          <button
                            key={photo.path}
                            type="button"
                            disabled={creating}
                            onClick={() => toggleImportPhoto(photo.path)}
                            aria-pressed={selected}
                            title={label}
                            className={`relative overflow-hidden rounded-xl text-left transition active:scale-[0.99] disabled:opacity-55 ${
                              selected
                                ? 'ring-2 ring-[#007AFF] ring-offset-1 ring-offset-white dark:ring-[#7ab8ff] dark:ring-offset-zinc-950'
                                : ''
                            }`}
                          >
                            <StorageThumbImg
                              src={photo.url}
                              alt={label}
                              className="aspect-square h-full w-full object-cover"
                              thumbMaxWidth={160}
                              thumbMaxHeight={160}
                              thumbQuality={52}
                            />
                            <span
                              className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${
                                selected
                                  ? 'bg-[#007AFF] text-white'
                                  : 'bg-black/35 text-white/90'
                              }`}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-100 px-5 py-4 dark:border-white/[0.06]">
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
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {importPhotoPaths.length > 0
                  ? `Criar com ${importPhotoPaths.length} foto${importPhotoPaths.length === 1 ? '' : 's'}`
                  : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
