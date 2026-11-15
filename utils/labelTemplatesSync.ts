/**
 * Sincroniza templates de etiquetas entre localStorage (cache) e o servidor
 * (workshop_settings.label_templates), para todos os dispositivos verem o mesmo layout.
 *
 * Primeira vez após o deploy: se o servidor ainda não tem templates e este
 * dispositivo tem edições locais, faz upload automático — preserva o que você
 * já configurou no PC. Upload automático só ocorre com autorização (G3);
 * 403 não entra em loop de retries.
 */
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';
import {
  hasLocalLabelTemplates,
  loadAllLabelTemplates,
  normalizeLabelTemplatesStore,
  saveAllLabelTemplates,
  type LabelTemplatesStore,
} from './labelTemplates';
import { isApiHttpError, isNetworkFetchError } from './apiHttpError';

let syncInFlight: Promise<LabelTemplatesSyncResult> | null = null;
let lastSyncedAt = 0;
/** Evita re-tentar upload automático após 403 na mesma sessão. */
let autoUploadDenied = false;

export type LabelTemplatesSyncStatus =
  | 'remote'
  | 'local_cache'
  | 'local_only_network'
  | 'local_only_forbidden'
  | 'uploaded_local';

export type LabelTemplatesSyncResult = {
  store: LabelTemplatesStore;
  status: LabelTemplatesSyncStatus;
};

function storeHasAnyTemplate(
  store: Partial<Record<string, unknown>> | null | undefined
): boolean {
  if (!store || typeof store !== 'object') return false;
  return Boolean(store.lab_os || store.estoque || store.chave || store.abs_modulo);
}

/**
 * Busca o store canônico no servidor.
 * - Servidor vazio + local com dados → sobe o local (migração), se autorizado.
 * - Servidor com dados → baixa e atualiza o cache local.
 * - Falha de rede → mantém o local.
 * - 403 no upload → mantém o local, sem loop.
 */
export async function syncLabelTemplatesFromServer(opts?: {
  force?: boolean;
}): Promise<LabelTemplatesSyncResult> {
  if (syncInFlight) return syncInFlight;
  const now = Date.now();
  if (!opts?.force && lastSyncedAt && now - lastSyncedAt < 8_000) {
    return { store: loadAllLabelTemplates(), status: 'local_cache' };
  }

  syncInFlight = (async (): Promise<LabelTemplatesSyncResult> => {
    const local = loadAllLabelTemplates();
    try {
      const settings = await getWorkshopSettings();
      const remoteRaw = settings.labelTemplates ?? null;
      if (storeHasAnyTemplate(remoteRaw)) {
        const remote = normalizeLabelTemplatesStore(remoteRaw);
        saveAllLabelTemplates(remote);
        lastSyncedAt = Date.now();
        return { store: remote, status: 'remote' };
      }
      // Servidor ainda sem templates: tenta publicar o local (SEC-04.2: exige G3).
      if (hasLocalLabelTemplates() && !autoUploadDenied) {
        try {
          await updateWorkshopSettings({ labelTemplates: local });
          lastSyncedAt = Date.now();
          return { store: local, status: 'uploaded_local' };
        } catch (e) {
          if (isApiHttpError(e) && e.kind === 'forbidden') {
            autoUploadDenied = true;
            lastSyncedAt = Date.now();
            return { store: local, status: 'local_only_forbidden' };
          }
          if (isNetworkFetchError(e) || (isApiHttpError(e) && e.kind === 'server')) {
            lastSyncedAt = Date.now();
            return { store: local, status: 'local_only_network' };
          }
          lastSyncedAt = Date.now();
          return { store: local, status: 'local_only_network' };
        }
      }
      lastSyncedAt = Date.now();
      return {
        store: local,
        status: autoUploadDenied ? 'local_only_forbidden' : 'local_cache',
      };
    } catch (e) {
      lastSyncedAt = Date.now();
      if (isApiHttpError(e) && e.kind === 'forbidden') {
        return { store: local, status: 'local_only_forbidden' };
      }
      return { store: local, status: 'local_only_network' };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export type LabelTemplatesPersistResult = {
  store: LabelTemplatesStore;
  remoteSaved: boolean;
};

/** Salva no cache local e, se autorizado, no servidor. */
export async function persistLabelTemplatesToServer(
  store: LabelTemplatesStore
): Promise<LabelTemplatesPersistResult> {
  const next = normalizeLabelTemplatesStore(store);
  saveAllLabelTemplates(next);
  try {
    await updateWorkshopSettings({ labelTemplates: next });
    lastSyncedAt = Date.now();
    return { store: next, remoteSaved: true };
  } catch (e) {
    // Mantém local — não mascara 403/rede como sucesso remoto.
    throw e instanceof Error ? e : new Error('Falha ao salvar etiquetas no servidor.');
  }
}
