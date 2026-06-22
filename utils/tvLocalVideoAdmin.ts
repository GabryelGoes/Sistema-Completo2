/**
 * Vídeos longos da TV — pasta local no PC (referência local:arquivo.mp4).
 * No painel de gestão: copia o arquivo para a pasta escolhida (Chrome/Edge).
 */

export const TV_LOCAL_PREFIX = "local:";

const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp)$/i;

export function toLocalVideoMediaUrl(fileName: string): string {
  const base = String(fileName || "")
    .trim()
    .split(/[/\\]/)
    .pop();
  return `${TV_LOCAL_PREFIX}${base || "video.mp4"}`;
}

export function isLocalVideoMediaUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().toLowerCase().startsWith(TV_LOCAL_PREFIX);
}

export function localVideoMediaFileName(url: string): string {
  return String(url).trim().slice(TV_LOCAL_PREFIX.length).replace(/^[/\\]+/, "").trim();
}

export function supportsLocalFolderWrite(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

const DB_NAME = "rda-tv-local-admin";
const DB_VERSION = 1;
const STORE = "folder";
const KEY = "videoDir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Grava o vídeo na pasta escolhida pelo usuário (mesma pasta que a TV deve usar). */
export async function copyVideoToTvFolder(file: File): Promise<{ fileName: string }> {
  if (!supportsLocalFolderWrite()) {
    throw new Error("Use Google Chrome ou Microsoft Edge no PC da TV para gravar na pasta local.");
  }
  const picker = (window as Window & { showDirectoryPicker: (opts: { id: string; mode: string }) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  const dir = await picker({ id: "rda-tv-video-folder", mode: "readwrite" });
  await idbSet(KEY, dir).catch(() => {});
  const fileName = file.name.split(/[/\\]/).pop()?.trim() || "video.mp4";
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return { fileName };
}

export function isVideoFileForLocal(file: Pick<File, "type" | "name">): boolean {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}
