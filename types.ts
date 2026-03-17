export interface Customer {
  name: string;
  phone: string;
  email?: string;
  cpf: string;
  cep: string;
  address: string;
  city?: string;
  addressNumber: string;
  vehicleModel: string;
  /** Apenas modo módulo (Laboratório): identificação do módulo */
  moduleIdentification?: string;
  plate: string;
  /** Quilometragem do veículo (Km) */
  mileageKm?: string;
  issueDescription: string;
  aiAnalysis?: string;
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
}
