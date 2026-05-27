export interface Customer {
  name: string;
  phone: string;
  email?: string;
  cpf: string;
  cep: string;
  address: string;
  city?: string;
  addressNumber: string;
  /** Marca / montadora (no card do Pátio entra só o modelo em vehicleModel) */
  vehicleBrand?: string;
  /** Nome do modelo / veículo (exibido no card) */
  vehicleModel: string;
  /** Apenas modo módulo (Laboratório): identificação do módulo */
  moduleIdentification?: string;
  /** Laboratório: tipo de produto (módulos, pinça, outro) */
  moduleKind?: 'completo' | 'eletronico' | 'hidraulico' | 'pinca_freio' | 'outro';
  /** Quando moduleKind=outro: descrição livre da peça */
  moduleProductOther?: string;
  /** Modo módulo: módulo de carro ou moto */
  moduleVehicleKind?: 'carro' | 'moto';
  plate: string;
  /** Cor do veículo (ex.: consulta PlacaFipe) */
  vehicleColor?: string;
  /** Ano ou ano/modelo em texto */
  vehicleYear?: string;
  /** Motor: cilindradas, combustível, etc. */
  vehicleEngineInfo?: string;
  /** Quilometragem do veículo (Km) */
  mileageKm?: string;
  issueDescription: string;
  aiAnalysis?: string;
  /** Fluxo agenda → recepção (vínculo opcional com card Trello) */
  trelloCardId?: string;
}

export interface ProcessingStatus {
  step: 'idle' | 'analyzing' | 'searching' | 'updating' | 'creating' | 'success' | 'error' | 'loading_board';
  message?: string;
}

/** Formato de lista/coluna do quadro (ex.: etapas da OS). */
export interface BoardList {
  id: string;
  name: string;
  pos: number;
}

export interface BoardMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
}

export interface BoardCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

export interface BoardChecklist {
  id: string;
  name: string;
  checkItems: BoardCheckItem[];
}

export interface BoardAction {
  id: string;
  idMemberCreator: string;
  data: {
    text: string;
    edited_at?: string | null; // Preenchido quando o comentário foi editado (exibe "editada")
  };
  type: string;
  date: string;
  memberCreator: {
    id: string;
    fullName: string;
    avatarHash?: string | null;
    avatarUrl?: string | null;
  };
}

export interface BoardAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  previews?: { url: string; height: number; width: number }[];
}

/** Link anexado ao modal da OS (manual, peça, etc.). */
export interface VehicleReferenceLink {
  id: string;
  label: string;
  url: string;
}

/** Vínculo de serviço do pátio com uma OS do laboratório. */
export interface LabServiceLink {
  id: string;
  serviceLabel: string;
  source: "budget" | "manual";
  sourceBudgetId?: string | null;
  sourceBudgetItemIndex?: number | null;
  laboratoryOrderId: string;
  createdAt: string;
}

export interface BoardCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  url: string;
  dateLastActivity: string;
  pos: number;
  due?: string | null;
  members?: BoardMember[];
  checklists?: BoardChecklist[];
  actions?: BoardAction[];
  attachments?: BoardAttachment[];
  garantiaTag?: boolean;
  mileageKm?: string | null;
  deliveryDate?: string | null;
  /** Número da OS na oficina (ex: 1, 2, 3). */
  osNumber?: number | null;
  /** Categoria do veículo na recepção (Compacto, Médio/SUV, Pick-Up, Premium). Só Pátio (veículo). */
  vehicleCategory?: string | null;
  /** Marca/montadora (não entra no título do card). */
  vehicleBrand?: string | null;
  /** Cor / ano / motor (texto) vindos da recepção ou consulta placa. */
  vehicleColor?: string | null;
  vehicleYear?: string | null;
  vehicleEngineInfo?: string | null;
  /** Links úteis salvos no modal do veículo/módulo. */
  referenceLinks?: VehicleReferenceLink[];
  /** Serviços do pátio enviados para OS do laboratório (vínculos). */
  labServiceLinks?: LabServiceLink[];
}

/** Aliases usados pelo Pátio / quadro. */
export type TrelloCard = BoardCard;
export type TrelloList = BoardList;
export type TrelloMember = BoardMember;
export type TrelloAction = BoardAction;
export type TrelloAttachment = BoardAttachment;

export interface Appointment {
  id: string;
  title: string;
  customerName: string;
  phone?: string;
  email?: string;
  vehicleModel: string;
  plate: string;
  date: Date;
  time: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  /** Legado Trello (opcional). */
  trelloCardId?: string;
}
