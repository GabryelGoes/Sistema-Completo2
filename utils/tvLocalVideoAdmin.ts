/**
 * Vídeo da TV lido do PC — referência local:arquivo.mp4.
 * Um clique: escolhe o vídeo, grava na pasta (1ª vez pede a pasta, depois lembra).
 */

export const TV_LOCAL_PREFIX = "local:";

const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp)$/i;
const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv,.3gp";

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

type WinFs = Window & {
  showDirectoryPicker?: (opts: { id: string; mode: string }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (opts: {
    types: { description: string; accept: Record<string, string[]> }[];
    multiple: boolean;
  }) => Promise<FileSystemFileHandle[]>;
};

function supportsFolderWrite(): boolean {
  return typeof window !== "undefined" && typeof (window as WinFs).showDirectoryPicker === "function";
}

function supportsOpenFilePicker(): boolean {
  return typeof window !== "undefined" && typeof (window as WinFs).showOpenFilePicker === "function";
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

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
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

async function verifyDirPermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts = { mode: "readwrite" as const };
    if ((await dir.queryPermission(opts)) === "granted") return true;
    return (await dir.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

async function getOrPickTvFolder(): Promise<FileSystemDirectoryHandle> {
  const saved = await idbGet<FileSystemDirectoryHandle>(KEY);
  if (saved && (await verifyDirPermission(saved))) return saved;

  if (!supportsFolderWrite()) {
    throw new Error("Use Chrome ou Edge para gravar vídeos no PC automaticamente.");
  }
  const dir = await (window as WinFs).showDirectoryPicker!({
    id: "rda-tv-video-folder",
    mode: "readwrite",
  });
  await idbSet(KEY, dir);
  if (!(await verifyDirPermission(dir))) {
    throw new Error("Permissão da pasta negada.");
  }
  return dir;
}

/** Abre o seletor de um único arquivo de vídeo. */
export function pickVideoFileFromPc(): Promise<File | null> {
  if (supportsOpenFilePicker()) {
    return (window as WinFs)
      .showOpenFilePicker!({
        types: [
          {
            description: "Vídeo",
            accept: {
              "video/*": [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".3gp"],
            },
          },
        ],
        multiple: false,
      })
      .then((handles) => handles[0]?.getFile() ?? null)
      .catch(() => null);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = VIDEO_ACCEPT;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => finish(input.files?.[0] ?? null);
    document.body.appendChild(input);
    input.click();
  });
}

export function isVideoFileForLocal(file: Pick<File, "type" | "name">): boolean {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

/**
 * Fluxo único: escolhe o vídeo → grava na pasta da TV (pede a pasta só na 1ª vez) → devolve local:arquivo.mp4
 */
export async function selectPcVideoForTvSlide(): Promise<{
  fileName: string;
  mediaUrl: string;
}> {
  const file = await pickVideoFileFromPc();
  if (!file) throw new Error("Seleção cancelada.");
  if (!isVideoFileForLocal(file)) {
    throw new Error("Escolha um arquivo de vídeo (MP4, MOV, WebM, etc.).");
  }

  const fileName = file.name.split(/[/\\]/).pop()?.trim() || "video.mp4";

  if (supportsFolderWrite()) {
    const dir = await getOrPickTvFolder();
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(file);
    await writable.close();
  }

  return { fileName, mediaUrl: toLocalVideoMediaUrl(fileName) };
}

/** @deprecated use selectPcVideoForTvSlide */
export async function copyVideoToTvFolder(file: File): Promise<{ fileName: string }> {
  const fileName = file.name.split(/[/\\]/).pop()?.trim() || "video.mp4";
  if (supportsFolderWrite()) {
    const dir = await getOrPickTvFolder();
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(file);
    await writable.close();
  }
  return { fileName };
}

export function supportsLocalFolderWrite(): boolean {
  return supportsFolderWrite();
}
