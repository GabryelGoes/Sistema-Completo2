/**
 * Sincroniza templates de etiquetas entre localStorage (cache) e o servidor
 * (workshop_settings.label_templates), para todos os dispositivos verem o mesmo layout.
 *
 * Primeira vez após o deploy: se o servidor ainda não tem templates e este
 * dispositivo tem edições locais, faz upload automático — preserva o que você
 * já configurou no PC. Upload automático só ocorre com autorização (G3);
 * 403 não entra em loop de retries **no mesmo contexto de auth**.
 * Troca de usuário / logout / concessão de `access_settings` (ou full_access)
 * muda a chave de contexto e libera nova tentativa controlada.
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
import {
  clearLabelAutoUploadDeniedIfCurrent,
  getLabelTemplatesAutoUploadDeniedForKey,
  getLabelTemplatesLastSyncedAt,
  getLabelTemplatesSyncAuthKey,
  markLabelAutoUploadDenied,
  shouldSkipLabelAutoUpload,
  touchLabelTemplatesLastSyncedAt,
} from './labelTemplatesSyncAuth';

export {
  computeLabelTemplatesSyncAuthKey,
  getLabelTemplatesAutoUploadGateState,
  markLabelAutoUploadDeniedForTests,
  resetLabelTemplatesSyncStateForTests,
  setLabelTemplatesSyncAuthContext,
  shouldSkipLabelAutoUpload,
  type LabelTemplatesSyncAuthInput,
} from './labelTemplatesSyncAuth';

let syncInFlight: Promise<LabelTemplatesSyncResult> | null = null;

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
 * - 403 no upload → mantém o local, sem loop no mesmo authKey.
 */
export async function syncLabelTemplatesFromServer(opts?: {
  force?: boolean;
}): Promise<LabelTemplatesSyncResult> {
  if (syncInFlight) return syncInFlight;
  const now = Date.now();
  const lastSyncedAt = getLabelTemplatesLastSyncedAt();
  if (!opts?.force && lastSyncedAt && now - lastSyncedAt < 8_000) {
    return { store: loadAllLabelTemplates(), status: 'local_cache' };
  }

  const authKeyAtStart = getLabelTemplatesSyncAuthKey();

  syncInFlight = (async (): Promise<LabelTemplatesSyncResult> => {
    const local = loadAllLabelTemplates();
    try {
      const settings = await getWorkshopSettings();
      const remoteRaw = settings.labelTemplates ?? null;
      if (storeHasAnyTemplate(remoteRaw)) {
        const remote = normalizeLabelTemplatesStore(remoteRaw);
        saveAllLabelTemplates(remote);
        touchLabelTemplatesLastSyncedAt();
        return { store: remote, status: 'remote' };
      }
      // Servidor ainda sem templates: tenta publicar o local (SEC-04.2: exige G3).
      const skipUpload = shouldSkipLabelAutoUpload(
        authKeyAtStart,
        getLabelTemplatesAutoUploadDeniedForKey()
      );
      if (hasLocalLabelTemplates() && !skipUpload) {
        try {
          await updateWorkshopSettings({ labelTemplates: local });
          // Sucesso limpa bloqueio deste contexto (se ainda for o mesmo).
          if (getLabelTemplatesSyncAuthKey() === authKeyAtStart) {
            clearLabelAutoUploadDeniedIfCurrent();
          }
          touchLabelTemplatesLastSyncedAt();
          return { store: local, status: 'uploaded_local' };
        } catch (e) {
          if (isApiHttpError(e) && e.kind === 'forbidden') {
            // Só marca deny se o contexto não mudou durante o request.
            if (getLabelTemplatesSyncAuthKey() === authKeyAtStart) {
              markLabelAutoUploadDenied(authKeyAtStart);
            }
            touchLabelTemplatesLastSyncedAt();
            return { store: local, status: 'local_only_forbidden' };
          }
          if (isNetworkFetchError(e) || (isApiHttpError(e) && e.kind === 'server')) {
            touchLabelTemplatesLastSyncedAt();
            return { store: local, status: 'local_only_network' };
          }
          touchLabelTemplatesLastSyncedAt();
          return { store: local, status: 'local_only_network' };
        }
      }
      touchLabelTemplatesLastSyncedAt();
      return {
        store: local,
        status: skipUpload ? 'local_only_forbidden' : 'local_cache',
      };
    } catch (e) {
      touchLabelTemplatesLastSyncedAt();
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
    touchLabelTemplatesLastSyncedAt();
    clearLabelAutoUploadDeniedIfCurrent();
    return { store: next, remoteSaved: true };
  } catch (e) {
    // Mantém local — não mascara 403/rede como sucesso remoto.
    throw e instanceof Error ? e : new Error('Falha ao salvar etiquetas no servidor.');
  }
}
