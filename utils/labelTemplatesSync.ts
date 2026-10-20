/**
 * Sincroniza templates de etiquetas entre localStorage (cache) e o servidor
 * (workshop_settings.label_templates), para todos os dispositivos verem o mesmo layout.
 *
 * Primeira vez após o deploy: se o servidor ainda não tem templates e este
 * dispositivo tem edições locais, faz upload automático — preserva o que você
 * já configurou no PC.
 */
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';
import {
  hasLocalLabelTemplates,
  loadAllLabelTemplates,
  normalizeLabelTemplatesStore,
  saveAllLabelTemplates,
  type LabelTemplatesStore,
} from './labelTemplates';

let syncInFlight: Promise<LabelTemplatesStore> | null = null;
let lastSyncedAt = 0;

function storeHasAnyTemplate(
  store: Partial<Record<string, unknown>> | null | undefined
): boolean {
  if (!store || typeof store !== 'object') return false;
  return Boolean(store.lab_os || store.estoque || store.chave || store.abs_modulo);
}

/**
 * Busca o store canônico no servidor.
 * - Servidor vazio + local com dados → sobe o local (migração).
 * - Servidor com dados → baixa e atualiza o cache local.
 * - Falha de rede → mantém o local.
 */
export async function syncLabelTemplatesFromServer(opts?: {
  force?: boolean;
}): Promise<LabelTemplatesStore> {
  if (syncInFlight) return syncInFlight;
  const now = Date.now();
  if (!opts?.force && lastSyncedAt && now - lastSyncedAt < 8_000) {
    return loadAllLabelTemplates();
  }

  syncInFlight = (async () => {
    const local = loadAllLabelTemplates();
    try {
      const settings = await getWorkshopSettings();
      const remoteRaw = settings.labelTemplates ?? null;
      if (storeHasAnyTemplate(remoteRaw)) {
        const remote = normalizeLabelTemplatesStore(remoteRaw);
        saveAllLabelTemplates(remote);
        lastSyncedAt = Date.now();
        return remote;
      }
      // Servidor ainda sem templates: publica o que este dispositivo já tem.
      if (hasLocalLabelTemplates()) {
        await updateWorkshopSettings({ labelTemplates: local });
        lastSyncedAt = Date.now();
        return local;
      }
      lastSyncedAt = Date.now();
      return local;
    } catch {
      return local;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Salva no cache local e no servidor (fonte da verdade entre dispositivos). */
export async function persistLabelTemplatesToServer(
  store: LabelTemplatesStore
): Promise<LabelTemplatesStore> {
  const next = normalizeLabelTemplatesStore(store);
  saveAllLabelTemplates(next);
  try {
    await updateWorkshopSettings({ labelTemplates: next });
    lastSyncedAt = Date.now();
  } catch (e) {
    // Mantém local mesmo se a rede falhar — próxima sync tenta de novo.
    throw e instanceof Error ? e : new Error('Falha ao salvar etiquetas no servidor.');
  }
  return next;
}
