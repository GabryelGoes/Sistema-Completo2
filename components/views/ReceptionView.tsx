import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, Building2, X, Check, MessageSquare, Paperclip, Download, ZoomIn, Eye, ExternalLink, Eraser, Camera, Image as ImageIcon, Calendar, Package, History, Search, RefreshCw, Calculator } from 'lucide-react';
import { Customer, ProcessingStatus } from '../../types';
import { Input, TextArea } from '../ui/Input';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { saveReceptionIntake, uploadServiceOrderPhoto, getServiceOrders, getServiceOrderBudgets, type ServiceOrderListItem, type SavedBudgetFromApi } from '../../services/apiService';
import type { ServiceOrderType } from '../../services/apiService';
import { BrazilFlagIcon } from '../ui/BrazilFlagIcon';

const RECEPTION_MODE_KEY = 'app_reception_mode';

/** Mesmo critério do Pátio: dois primeiros nomes do cliente. */
function firstTwoNames(fullName: string): string {
  if (!fullName || !fullName.trim()) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(0, 2).join(' ');
}

/** Tamanho do título do modelo (alinhado ao Pátio / tablet). */
function getModelTitleClass(modelName: string) {
  const len = (modelName || '').length;
  if (len > 40) return 'text-2xl md:text-4xl lg:text-3xl';
  if (len > 26) return 'text-3xl md:text-5xl lg:text-3xl';
  return 'text-3xl md:text-5xl lg:text-3xl';
}

interface ReceptionViewProps {
  initialData?: Customer | null;
  onDataLoaded?: () => void;
  /** Modo cinematográfico: embaçar placas exibidas (para gravar tela / redes sociais). */
  blurPlates?: boolean;
}

// Componentes de Estilo para Markdown (Reutilizado do PatioView para consistência)
const MarkdownComponents = {
  p: ({children}: any) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
  strong: ({children}: any) => <strong className="font-bold text-white">{children}</strong>,
  em: ({children}: any) => <em className="italic text-zinc-400">{children}</em>,
  ul: ({children}: any) => <ul className="list-disc list-inside ml-2 mb-2 space-y-1">{children}</ul>,
  ol: ({children}: any) => <ol className="list-decimal list-inside ml-2 mb-2 space-y-1">{children}</ol>,
  li: ({children}: any) => <li className="text-zinc-300">{children}</li>,
  a: ({children, href}: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-yellow hover:underline">{children}</a>,
  blockquote: ({children}: any) => <blockquote className="border-l-4 border-zinc-600 pl-4 py-1 italic text-zinc-400 my-2">{children}</blockquote>,
};

export const ReceptionView: React.FC<ReceptionViewProps> = ({
  initialData,
  onDataLoaded,
  blurPlates = false,
}) => {
  const [receptionMode, setReceptionMode] = useState<ServiceOrderType>(() => {
    try {
      const v = localStorage.getItem(RECEPTION_MODE_KEY);
      return (v === 'module' ? 'module' : 'vehicle') as ServiceOrderType;
    } catch {
      return 'vehicle';
    }
  });

  const [customer, setCustomer] = useState<Customer>({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    cep: '',
    address: '',
    city: '',
    addressNumber: '',
    vehicleModel: '',
    moduleIdentification: '',
    plate: '',
    mileageKm: '',
    issueDescription: ''
  });

  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle' });

  useEffect(() => {
    try {
      localStorage.setItem(RECEPTION_MODE_KEY, receptionMode);
    } catch (_) {}
  }, [receptionMode]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cameraOrientation, setCameraOrientation] = useState<{alpha: number | null, beta: number | null, gamma: number | null} | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState<ServiceOrderListItem[]>([]);
  const [expandedHistoryOrderId, setExpandedHistoryOrderId] = useState<string | null>(null);
  const [historyBudgetsByOrder, setHistoryBudgetsByOrder] = useState<Record<string, SavedBudgetFromApi[]>>({});
  /** Só true após GET com sucesso; evita travar retry quando houve erro (array vazio é truthy em JS). */
  const [historyBudgetsFetchOk, setHistoryBudgetsFetchOk] = useState<Record<string, boolean>>({});
  const [historyBudgetsLoadingId, setHistoryBudgetsLoadingId] = useState<string | null>(null);
  const [historyBudgetErrorByOrder, setHistoryBudgetErrorByOrder] = useState<Record<string, string>>({});
  const [historyBudgetDetail, setHistoryBudgetDetail] = useState<SavedBudgetFromApi | null>(null);

  // Efeito para carregar dados iniciais vindos do Pátio ou Histórico (todos editáveis, inclusive placa)
  useEffect(() => {
    if (initialData) {
      setCustomer((prev) => ({
        ...prev,
        name: initialData.name ?? prev.name,
        phone: initialData.phone ?? prev.phone,
        email: initialData.email ?? prev.email,
        cpf: initialData.cpf ?? prev.cpf,
        cep: initialData.cep ?? prev.cep,
        address: initialData.address ?? prev.address,
        city: initialData.city ?? prev.city ?? '',
        addressNumber: initialData.addressNumber ?? prev.addressNumber,
        vehicleModel: initialData.vehicleModel ?? prev.vehicleModel,
        moduleIdentification: initialData.moduleIdentification ?? prev.moduleIdentification,
        plate: initialData.plate ?? prev.plate,
        mileageKm: initialData.mileageKm ?? prev.mileageKm,
        issueDescription: initialData.issueDescription ?? prev.issueDescription,
        trelloCardId: initialData.trelloCardId,
      }));
      if (onDataLoaded) onDataLoaded();
    }
  }, [initialData, onDataLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCustomer(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isModule = receptionMode === 'module';
    if (isModule) {
      if (!customer.name && !customer.phone && !customer.vehicleModel && !customer.moduleIdentification) {
        setStatus({
          step: 'error',
          message: 'Preencha pelo menos nome, telefone, veículo ou identificação do módulo.',
        });
        return;
      }
    } else {
      if (!customer.name && !customer.phone && !customer.vehicleModel && !customer.plate) {
        setStatus({
          step: 'error',
          message: 'Preencha pelo menos algum dado de identificação (nome, telefone, veículo ou placa).',
        });
        return;
      }
    }

    try {
      setStatus({ step: 'creating', message: 'Criando cadastro' });

      const { customer: savedCustomer, serviceOrder } = await saveReceptionIntake(customer, receptionMode);

      // 2) Se houver foto, enviar (com compressão automática para evitar 413 no Vercel)
      if (photoBlob && serviceOrder?.id) {
        await uploadServiceOrderPhoto(
          serviceOrder.id,
          photoBlob,
          `entrada_${serviceOrder.id}_${Date.now()}.jpg`
        );
      }

      const osLabel = serviceOrder?.os_number != null ? ` OS #${serviceOrder.os_number}.` : '';
      setStatus({ step: 'success', message: `Cadastro criado com sucesso.${osLabel}` });

      // Futuro: podemos usar savedCustomer / serviceOrder (ex: redirecionar, imprimir, etc.)
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setStatus({ step: 'error', message: `Erro: ${errorMessage}` });
    }
  };

  const resetForm = () => {
    setCustomer({
      name: '',
      cpf: '',
      phone: '',
      email: '',
      cep: '',
      address: '',
      city: '',
      addressNumber: '',
      vehicleModel: '',
      moduleIdentification: '',
      plate: '',
      mileageKm: '',
      issueDescription: '',
      trelloCardId: undefined
    });
    setPhotoBlob(null);
    setPhotoPreview(null);
    setCameraOrientation(null);
    setStatus({ step: 'idle' });
  };

  const clearPhoto = () => {
    setPhotoBlob(null);
    setPhotoPreview(null);
    setCameraOrientation(null);
  };

  // --- Funções de Histórico ---
  const loadVehicleHistory = async (term = '') => {
    setHistoryLoading(true);
    try {
      const rows = await getServiceOrders('CANCELLED', 'vehicle');
      const t = term.trim().toLowerCase();
      const filtered = t
        ? rows.filter((o) =>
            (o.plate || '').toLowerCase().includes(t) ||
            (o.vehicle_model || '').toLowerCase().includes(t) ||
            (o.customer_name || o.customers?.name || '').toLowerCase().includes(t)
          )
        : rows;
      setArchivedOrders(filtered);
    } catch (e) {
      console.error(e);
      setArchivedOrders([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) loadVehicleHistory(historySearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryOpen]);

  useEffect(() => {
    if (!isHistoryOpen) {
      setHistoryBudgetDetail(null);
      setExpandedHistoryOrderId(null);
    }
  }, [isHistoryOpen]);

  const handleToggleHistoryBudgets = async (serviceOrderId: string) => {
    if (expandedHistoryOrderId === serviceOrderId) {
      setExpandedHistoryOrderId(null);
      return;
    }

    setExpandedHistoryOrderId(serviceOrderId);
    if (historyBudgetsFetchOk[serviceOrderId]) return;

    setHistoryBudgetsLoadingId(serviceOrderId);
    setHistoryBudgetErrorByOrder((prev) => ({ ...prev, [serviceOrderId]: '' }));
    try {
      const budgets = await getServiceOrderBudgets(serviceOrderId);
      setHistoryBudgetsByOrder((prev) => ({ ...prev, [serviceOrderId]: budgets }));
      setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: true }));
    } catch (err: any) {
      setHistoryBudgetErrorByOrder((prev) => ({
        ...prev,
        [serviceOrderId]: err?.message ?? 'Falha ao carregar orçamentos.',
      }));
    } finally {
      setHistoryBudgetsLoadingId(null);
    }
  };

  const handleRetryHistoryBudgets = async (serviceOrderId: string) => {
    setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: false }));
    setHistoryBudgetErrorByOrder((prev) => ({ ...prev, [serviceOrderId]: '' }));
    setHistoryBudgetsLoadingId(serviceOrderId);
    try {
      const budgets = await getServiceOrderBudgets(serviceOrderId);
      setHistoryBudgetsByOrder((prev) => ({ ...prev, [serviceOrderId]: budgets }));
      setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: true }));
    } catch (err: any) {
      setHistoryBudgetErrorByOrder((prev) => ({
        ...prev,
        [serviceOrderId]: err?.message ?? 'Falha ao carregar orçamentos.',
      }));
    } finally {
      setHistoryBudgetsLoadingId(null);
    }
  };

  return (
    <div className="w-full max-w-2xl lg:max-w-5xl mx-auto px-4 md:px-6 pb-24 animate-in fade-in duration-500">
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="h-20 w-auto object-contain bg-black rounded-xl p-2" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-yellow leading-none">
              REI DO ABS
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Recepção & Cadastro</p>
          </div>
        </div>

        <div className="flex bg-zinc-200 dark:bg-black/40 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setReceptionMode('vehicle')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              receptionMode === 'vehicle'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Car className="w-4 h-4" />
            Veículos
          </button>
          <button
            type="button"
            onClick={() => setReceptionMode('module')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              receptionMode === 'module'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Módulos
          </button>
        </div>
      </header>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
          title="Consultar histórico de veículos arquivados"
        >
          <History className="w-4 h-4" />
          Histórico de veículos
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border rounded-[2rem] p-6 md:p-8 lg:p-10 shadow-2xl relative overflow-hidden">
        
        {/* Decorative Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-yellow/5 to-transparent rounded-full blur-3xl -z-10" />

        <form onSubmit={handleSubmit} className="space-y-6 lg:space-y-0">
          
          <div className="flex justify-end mb-1">
             <button
               type="button"
               onClick={resetForm}
               className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-red-400 flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-white/5"
               title="Limpar todos os campos"
             >
               <Eraser className="w-3.5 h-3.5" />
               Limpar
             </button>
          </div>

          {/* Desktop: duas colunas (Cliente | Veículo + Queixa + Foto + Botão) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {/* Coluna esquerda: Dados do cliente */}
            <div className="space-y-6">
              <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-brand-border pb-2">
                Dados do cliente
              </h2>
              <div>
                <Input 
                  label="Nome Completo"
                  name="name"
                  placeholder="Ex: João da Silva"
                  value={customer.name}
                  onChange={handleInputChange}
                  icon={<User className="w-4 h-4" />}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input 
                  label="CPF"
                  name="cpf"
                  placeholder="000.000.000-00"
                  value={customer.cpf}
                  onChange={handleInputChange}
                  icon={<ShieldCheck className="w-4 h-4" />}
                />
                <Input 
                  label="Telefone"
                  name="phone"
                  placeholder="(11) 99999-9999"
                  value={customer.phone}
                  onChange={handleInputChange}
                  icon={<Smartphone className="w-4 h-4" />}
                />
              </div>
              <div>
                <Input 
                  label="E-mail"
                  name="email"
                  placeholder="exemplo@email.com"
                  value={customer.email}
                  onChange={handleInputChange}
                  icon={<Mail className="w-4 h-4" />}
                />
              </div>
              <div>
                <Input 
                  label="Endereço"
                  name="address"
                  placeholder="Rua, Avenida, Bairro..."
                  value={customer.address}
                  onChange={handleInputChange}
                  icon={<Map className="w-4 h-4" />}
                />
              </div>
              <div>
                <Input 
                  label="Cidade"
                  name="city"
                  placeholder="Ex: São Paulo"
                  value={customer.city ?? ''}
                  onChange={handleInputChange}
                  icon={<Building2 className="w-4 h-4" />}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input 
                  label="CEP"
                  name="cep"
                  placeholder="00000-000"
                  value={customer.cep}
                  onChange={handleInputChange}
                  icon={<MapPin className="w-4 h-4" />}
                />
                <Input 
                  label="Nº"
                  name="addressNumber"
                  placeholder="123"
                  value={customer.addressNumber}
                  onChange={handleInputChange}
                  icon={<Hash className="w-4 h-4" />}
                />
              </div>
            </div>

            {/* Coluna direita: Veículo/Módulo + Queixa + Foto + Botão */}
            <div className="space-y-6">
              <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-brand-border pb-2">
                {receptionMode === 'vehicle' ? 'Veículo e atendimento' : 'Módulo e atendimento'}
              </h2>
              <div className="w-full h-px bg-zinc-200 dark:bg-brand-border/50 lg:hidden" />

              {receptionMode === 'vehicle' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input 
                    label="Modelo do Veículo"
                    name="vehicleModel"
                    placeholder="Ex: BMW 320i"
                    value={customer.vehicleModel}
                    onChange={handleInputChange}
                    icon={<Car className="w-4 h-4" />}
                  />
                  <Input
                    label="Placa"
                    name="plate"
                    placeholder="ABC-1D23"
                    value={customer.plate ? String(customer.plate).toUpperCase() : ''}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, plate: e.target.value.toUpperCase() }))}
                    className="uppercase"
                    maxLength={8}
                    icon={<FileText className="w-4 h-4" />}
                  />
                  <Input 
                    label="Km"
                    name="mileageKm"
                    placeholder="Ex: 45000"
                    value={customer.mileageKm ?? ''}
                    onChange={handleInputChange}
                    icon={<Hash className="w-4 h-4" />}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input 
                    label="Veículo"
                    name="vehicleModel"
                    placeholder="Ex: BMW 320i"
                    value={customer.vehicleModel}
                    onChange={handleInputChange}
                    icon={<Package className="w-4 h-4" />}
                  />
                  <Input 
                    label="Identificação do módulo"
                    name="moduleIdentification"
                    placeholder="Ex: Módulo ABS XYZ"
                    value={customer.moduleIdentification ?? ''}
                    onChange={handleInputChange}
                    icon={<Package className="w-4 h-4" />}
                  />
                </div>
              )}

              <div className="relative">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider ml-1 mb-1">
                  Queixa do Cliente
                </label>
                <TextArea
                  label=""
                  name="issueDescription"
                  placeholder="Descreva o problema relatado pelo cliente..."
                  value={customer.issueDescription}
                  onChange={handleInputChange}
                />
              </div>

              {/* Camera Section */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider ml-1">
                  {receptionMode === 'vehicle' ? 'Foto do Veículo (Opcional)' : 'Foto (Opcional)'}
                </label>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                />
                {!photoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 border border-zinc-300 dark:border-zinc-700 rounded-xl flex items-center justify-center gap-3 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-brand-yellow hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="font-medium text-sm">{receptionMode === 'module' ? 'Foto do módulo' : 'Foto do veículo'}</span>
                  </button>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-black">
                    <img src={photoPreview} alt="Preview" className="w-full h-48 lg:h-56 object-cover opacity-80" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                          type="button"
                          onClick={clearPhoto}
                          className="p-2 rounded-full bg-red-500/90 text-white hover:bg-red-600 transition-colors shadow-lg"
                          title="Remover foto"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-md p-3 rounded-xl border border-white/10">
                        <div className="flex items-center gap-3">
                          <ImageIcon className="w-5 h-5 text-brand-yellow" />
                          <div className="flex-1">
                            <p className="text-xs font-bold text-white uppercase">Foto Selecionada</p>
                            <p className="text-[10px] text-zinc-300 mt-0.5">Clique no X para remover</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-center lg:justify-start">
                <button 
                  type="submit"
                  className="
                    group relative 
                    min-w-[220px] px-8 py-3.5 
                    rounded-full
                    bg-brand-yellow
                    text-black font-bold text-base tracking-wide
                    shadow-lg shadow-brand-yellow/20
                    hover:bg-[#fcd61e]
                    hover:shadow-brand-yellow/40
                    hover:-translate-y-0.5
                    active:translate-y-0
                    transition-all duration-300
                    flex items-center justify-center gap-2
                  "
                >
                  Criar Ficha
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

        </form>
      </div>

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
          <div className="w-full max-w-[90rem] max-h-[90vh] bg-white/95 dark:bg-[#1C1C1E]/95 border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] overflow-hidden flex flex-col shadow-[0_18px_60px_-24px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/90 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="bg-brand-yellow/15 p-2 rounded-xl">
                  <History className="w-6 h-6 text-zinc-900 dark:text-brand-yellow" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Histórico de veículos</h2>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Veículos arquivados — mesmo visual dos cards do Pátio</p>
                </div>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-black/30">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadVehicleHistory(historySearch)}
                    placeholder="Buscar por placa, cliente ou modelo"
                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadVehicleHistory(historySearch)}
                  className="min-w-[44px] h-11 px-4 rounded-xl bg-brand-yellow text-zinc-950 font-bold flex items-center justify-center hover:bg-[#fcd61e] transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50/60 dark:bg-brand-surface/60 custom-scrollbar">
              {historyLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-yellow" />
                  <p>Carregando arquivados...</p>
                </div>
              ) : archivedOrders.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">Nenhum veículo arquivado encontrado.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedOrders.map((o) => {
                  const model = (o.vehicle_model || 'Veículo').trim();
                  const plate = (o.plate || '---').toUpperCase();
                  const customerName = firstTwoNames((o.customer_name || o.customers?.name || 'Cliente').trim());
                  return (
                  <div
                    key={o.id}
                    className="group bg-white dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-white/[0.08] rounded-2xl p-5 hover:border-brand-yellow/80 dark:hover:border-brand-yellow/80 transition-all shadow-sm hover:shadow-lg flex flex-col min-h-[200px]"
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`${getModelTitleClass(model)} font-black text-zinc-900 dark:text-white uppercase leading-[0.95] tracking-tighter break-words italic`}
                        >
                          {model}
                        </h3>
                        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/50 dark:border-white/[0.06] w-fit max-w-full">
                          <User className="w-4 h-4 text-brand-yellow shrink-0" strokeWidth={2} />
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate tracking-tight">
                            {customerName}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-[120px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-md shadow-black/20 select-none">
                          <div className="h-4 bg-[#003399] flex items-center justify-between px-2">
                            <span className="text-[7px] font-bold text-white tracking-wider">BRASIL</span>
                            <BrazilFlagIcon width={12} height={8} className="rounded-[2px] flex-shrink-0 border border-white/30" />
                          </div>
                          <div className="h-9 flex items-center justify-center bg-white">
                            <span className={`text-black font-mono text-xl font-black tracking-[0.2em] leading-none ${blurPlates ? 'blur-plate' : ''}`}>
                              {plate}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-end justify-between mt-auto pt-3 border-t border-zinc-200/80 dark:border-zinc-800/70">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 font-bold tracking-wider">Arquivado</span>
                        <span className="text-lg text-zinc-800 dark:text-zinc-100 font-black tracking-tight leading-none truncate">
                          {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 shrink-0">{o.status}</span>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => handleToggleHistoryBudgets(o.id)}
                        className="w-full px-3 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 transition-colors"
                      >
                        {expandedHistoryOrderId === o.id ? 'Ocultar orçamentos' : 'Ver orçamentos'}
                      </button>
                    </div>
                    {expandedHistoryOrderId === o.id && (
                      <div className="mt-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50/90 dark:bg-black/30 p-3 space-y-2">
                        {historyBudgetsLoadingId === o.id ? (
                          <div className="text-sm text-zinc-500 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Carregando orçamentos...
                          </div>
                        ) : historyBudgetErrorByOrder[o.id] ? (
                          <div className="space-y-2">
                            <div className="text-sm text-red-500">{historyBudgetErrorByOrder[o.id]}</div>
                            <button
                              type="button"
                              onClick={() => handleRetryHistoryBudgets(o.id)}
                              className="text-xs font-semibold text-zinc-900 dark:text-white underline"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : (historyBudgetsByOrder[o.id] || []).length === 0 ? (
                          <div className="text-sm text-zinc-500">Nenhum orçamento encontrado para este veículo.</div>
                        ) : (
                          (historyBudgetsByOrder[o.id] || []).map((b, idx) => (
                            <div key={b.id} className="rounded-lg border border-zinc-200 dark:border-white/10 p-2.5 bg-white dark:bg-white/[0.02]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                  Orçamento {idx + 1}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {new Date(b.createdAt).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              {b.diagnosis?.trim() && (
                                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                                  <span className="font-medium">Diagnóstico:</span> {b.diagnosis}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                {b.services.length} serviço(s) • {b.parts.length} peça(s)
                              </p>
                              <button
                                type="button"
                                onClick={() => setHistoryBudgetDetail(b)}
                                className="mt-2 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-yellow text-black hover:opacity-90 transition-opacity"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Abrir orçamento completo
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: orçamento completo (histórico arquivado) — acima do modal de histórico (z-50) */}
      {historyBudgetDetail && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setHistoryBudgetDetail(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-200 dark:border-white/10 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                  <Calculator className="w-5 h-5 text-brand-yellow shrink-0" />
                  <h2 className="text-lg font-bold truncate">Orçamento</h2>
                </div>
                {historyBudgetDetail.cardName?.trim() && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 truncate">{historyBudgetDetail.cardName}</p>
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  {new Date(historyBudgetDetail.createdAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryBudgetDetail(null)}
                className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-zinc-900 dark:text-zinc-100">
              {historyBudgetDetail.diagnosis?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Diagnóstico</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{historyBudgetDetail.diagnosis}</div>
                </section>
              )}
              {historyBudgetDetail.services.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Serviços</h3>
                  <ul className="list-none space-y-1.5 text-sm">
                    {historyBudgetDetail.services.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {s.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />}
                        {s.approved === false && <X className="w-4 h-4 shrink-0 text-red-600 mt-0.5" aria-hidden />}
                        {s.approved !== true && s.approved !== false && (
                          <span className="w-4 h-4 shrink-0 text-center font-bold text-zinc-400 mt-0.5" aria-hidden>—</span>
                        )}
                        <span>{s.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {historyBudgetDetail.parts.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Peças</h3>
                  <ul className="space-y-1.5 text-sm">
                    {historyBudgetDetail.parts.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {p.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />}
                        {p.approved === false && <X className="w-4 h-4 shrink-0 text-red-600 mt-0.5" aria-hidden />}
                        {p.approved !== true && p.approved !== false && (
                          <span className="w-4 h-4 shrink-0 text-center font-bold text-zinc-400 mt-0.5" aria-hidden>—</span>
                        )}
                        <span>
                          <span className="font-semibold">({p.quantity}x)</span> {p.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {historyBudgetDetail.observations?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Observações</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{historyBudgetDetail.observations}</div>
                </section>
              )}
              {!historyBudgetDetail.diagnosis?.trim() &&
                historyBudgetDetail.services.length === 0 &&
                historyBudgetDetail.parts.length === 0 &&
                !historyBudgetDetail.observations?.trim() && (
                  <p className="text-sm text-zinc-500">Este orçamento não possui itens preenchidos.</p>
                )}
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay 
        status={status}
        onClose={() => {
          if (status.step === 'success') {
            resetForm();
          } else {
            setStatus({ step: 'idle' });
          }
        }}
      />

    </div>
  );
};