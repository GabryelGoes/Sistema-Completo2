
export interface Customer {
  name: string;
  phone: string;
  email?: string;
  cpf: string;
  cep: string;
  address: string;
  addressNumber: string;
  vehicleModel: string;
  plate: string;
  /** Quilometragem do veículo (Km) */
  mileageKm?: string;
  issueDescription: string;
  aiAnalysis?: string;
  trelloCardId?: string;
}

export interface TrelloConfig {
  apiKey: string;
  token: string;
  listId: string;
  agendamentoListId?: string;
  boardId?: string;
  lockRotation?: boolean;
}

export interface ProcessingStatus {
  step: 'idle' | 'analyzing' | 'searching' | 'updating' | 'creating' | 'success' | 'error' | 'loading_board';
  message?: string;
}

export interface TrelloList {
  id: string;
  name: string;
  pos: number;
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  checkItems: TrelloCheckItem[];
}

export interface TrelloAction {
  id: string;
  idMemberCreator: string;
  data: {
    text: string;
  };
  type: string;
  date: string;
  memberCreator: {
    id: string;
    fullName: string;
    avatarHash?: string | null;
    avatarUrl?: string | null; // Calculado no frontend/service
  };
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  previews?: { url: string; height: number; width: number }[];
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  url: string;
  dateLastActivity: string;
  pos: number;
  due?: string | null;
  members?: TrelloMember[];
  checklists?: TrelloChecklist[];
  actions?: TrelloAction[];      // Comentários carregados sob demanda
  attachments?: TrelloAttachment[]; // Anexos carregados sob demanda
  /** Etiqueta de garantia: definida ao entrar na etapa Garantia e só removida pelo modal. */
  garantiaTag?: boolean;
  /** Quilometragem do veículo (vinda da OS). */
  mileageKm?: string | null;
  /** Data de entrega prevista (YYYY-MM-DD, vinda da OS). */
  deliveryDate?: string | null;
}

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
  trelloCardId?: string;
}
