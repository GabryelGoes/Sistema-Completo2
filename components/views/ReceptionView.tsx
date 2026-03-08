import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, History, Search, RefreshCw, X, MessageSquare, Paperclip, Download, ZoomIn, Eye, ExternalLink, Copy, Eraser, Camera, Image as ImageIcon, Calendar } from 'lucide-react';
import { Customer, TrelloConfig, ProcessingStatus, TrelloCard, TrelloAction, TrelloAttachment } from '../../types';
import { Input, TextArea } from '../ui/Input';
import { BrazilFlagIcon } from '../ui/BrazilFlagIcon';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { findCardByPlate, createCard, updateCard, updateCardFull, searchArchivedCards, parseCustomerFromDescription, getCardDetails, uploadAttachment, addCardComment } from '../../services/trelloService';
import { saveReceptionIntake } from '../../services/apiService';

interface ReceptionViewProps {
  trelloConfig: TrelloConfig;
  initialData?: Customer | null;
  onDataLoaded?: () => void;
  onAppointmentConverted?: (cardId: string) => void;
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
  trelloConfig, 
  initialData, 
  onDataLoaded,
  onAppointmentConverted
}) => {
  const [customer, setCustomer] = useState<Customer>({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    cep: '',
    address: '',
    addressNumber: '',
    vehicleModel: '',
    plate: '',
    mileageKm: '',
    issueDescription: ''
  });

  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle' });

  // Estados para Histórico
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearchPlate, setHistorySearchPlate] = useState('');
  const [archivedCards, setArchivedCards] = useState<TrelloCard[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Estados para Detalhes do Card no Histórico (Idêntico ao PatioView)
  const [selectedHistoryCard, setSelectedHistoryCard] = useState<TrelloCard | null>(null);
  const [cardDetails, setCardDetails] = useState<{ actions: TrelloAction[], attachments: TrelloAttachment[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cameraOrientation, setCameraOrientation] = useState<{alpha: number | null, beta: number | null, gamma: number | null} | null>(null);

  // Efeito para carregar dados iniciais vindos do Pátio (ou outra fonte)
  useEffect(() => {
    if (initialData) {
        setCustomer(prev => ({ ...prev, ...initialData }));
        
        if (onDataLoaded) {
            onDataLoaded();
        }
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

    // Validação mínima (mantendo flexibilidade anterior)
    if (!customer.name && !customer.phone && !customer.vehicleModel && !customer.plate) {
      setStatus({
        step: 'error',
        message: 'Preencha pelo menos algum dado de identificação (nome, telefone, veículo ou placa).',
      });
      return;
    }

    try {
      setStatus({ step: 'creating', message: 'Criando cadastro' });

      // 1) Salvar no banco (Supabase)
      const { customer: savedCustomer, serviceOrder } = await saveReceptionIntake(customer);

      // 2) Se houver foto, enviar para o Storage vinculado à OS
      if (photoBlob && serviceOrder?.id) {
        const formData = new FormData();
        formData.append(
          'file',
          photoBlob,
          `entrada_${serviceOrder.id}_${Date.now()}.jpg`
        );

        await fetch(`/api/service-orders/${serviceOrder.id}/photos`, {
          method: 'POST',
          body: formData,
        });
      }

      // 3) Integração opcional com Trello (modo transição)
      let cardId = '';
      if (trelloConfig.apiKey && trelloConfig.token && trelloConfig.listId) {
        const existingCard = await findCardByPlate(trelloConfig, customer.plate);

        if (customer.trelloCardId) {
          await updateCardFull(trelloConfig, customer.trelloCardId, customer, trelloConfig.listId);
          cardId = customer.trelloCardId;
          if (onAppointmentConverted) {
            onAppointmentConverted(cardId);
          }
        } else if (existingCard) {
          cardId = await updateCard(trelloConfig, existingCard.id, customer);
        } else {
          cardId = await createCard(trelloConfig, customer);
        }

        if (photoBlob && cardId) {
          const fileName = `foto_entrada_${new Date().getTime()}.jpg`;
          await uploadAttachment(trelloConfig, cardId, photoBlob, fileName);

          if (cameraOrientation) {
            const orientationText = `📱 **Dados do Giroscópio (Foto):**
Alpha: ${cameraOrientation.alpha?.toFixed(2) || 'N/A'}
Beta: ${cameraOrientation.beta?.toFixed(2) || 'N/A'}
Gamma: ${cameraOrientation.gamma?.toFixed(2) || 'N/A'}`;

            await addCardComment(trelloConfig, cardId, orientationText);
          }
        }
      }

      setStatus({ step: 'success', message: 'Cadastro criado com sucesso' });

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
      addressNumber: '',
      vehicleModel: '',
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

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    // Preenche a busca com a placa atual se houver
    if (customer.plate) {
      setHistorySearchPlate(customer.plate);
      // Se já tiver placa, faz a busca automática
      handleSearchHistory(customer.plate);
    } else {
      setArchivedCards([]);
    }
  };

  const handleSearchHistory = async (termToSearch: string = historySearchPlate) => {
    if (!termToSearch.trim()) return;
    
    setIsLoadingHistory(true);
    setArchivedCards([]);
    try {
      const cards = await searchArchivedCards(trelloConfig, termToSearch);
      setArchivedCards(cards);
    } catch (err) {
      console.error(err);
      alert("Erro ao buscar histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Carrega detalhes quando abre um card do histórico
  const handleOpenCardDetails = (card: TrelloCard) => {
    setSelectedHistoryCard(card);
    setLoadingDetails(true);
    setCardDetails(null);
    getCardDetails(trelloConfig, card.id)
      .then(details => setCardDetails(details))
      .catch(err => console.error(err))
      .finally(() => setLoadingDetails(false));
  };

  const handleUseRegistration = (card: TrelloCard) => {
    const parsedData = parseCustomerFromDescription(card.desc);
    
    // Mescla os dados atuais com os dados do cartão, preservando a placa (se houver) e limpando a queixa
    setCustomer(prev => ({
      ...prev,
      ...parsedData,
      plate: customer.plate || prev.plate || parsedData.plate || '',
      issueDescription: '' // Limpa a queixa para novo serviço
    }));

    // Fecha modais
    setSelectedHistoryCard(null);
    setIsHistoryOpen(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 animate-in fade-in duration-500">
      
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="h-20 w-auto object-contain bg-black rounded-xl p-2" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-yellow leading-none">
              REI DO ABS
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Recepção & Cadastro</p>
          </div>
        </div>
        
        <div className="flex gap-2">
           <button 
            onClick={handleOpenHistory}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-brand-yellow hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-300"
            title="Consultar Histórico (Arquivados)"
          >
            <History className="w-4 h-4" />
            <span className="text-xs font-bold uppercase hidden sm:inline">Histórico</span>
          </button>
        </div>
      </header>

      {/* Main Card */}
      <div className="bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border rounded-[2rem] p-6 md:p-10 shadow-2xl relative overflow-hidden">
        
        {/* Decorative Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-yellow/5 to-transparent rounded-full blur-3xl -z-10" />

        <form onSubmit={handleSubmit} className="space-y-6">
          
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input 
              label="Nome Completo"
              name="name"
              placeholder="Ex: João da Silva"
              value={customer.name}
              onChange={handleInputChange}
              icon={<User className="w-4 h-4" />}
            />
             <Input 
              label="CPF"
              name="cpf"
              placeholder="000.000.000-00"
              value={customer.cpf}
              onChange={handleInputChange}
              icon={<ShieldCheck className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input 
              label="Telefone"
              name="phone"
              placeholder="(11) 99999-9999"
              value={customer.phone}
              onChange={handleInputChange}
              icon={<Smartphone className="w-4 h-4" />}
            />
             <Input 
              label="E-mail"
              name="email"
              placeholder="exemplo@email.com"
              value={customer.email}
              onChange={handleInputChange}
              icon={<Mail className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Input 
              label="Endereço"
              name="address"
              placeholder="Rua, Avenida, Bairro..."
              value={customer.address}
              onChange={handleInputChange}
              icon={<Map className="w-4 h-4" />}
            />
             <Input 
              label="CEP"
              name="cep"
              placeholder="00000-000"
              value={customer.cep}
              onChange={handleInputChange}
              icon={<MapPin className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Input 
              label="Nº"
              name="addressNumber"
              placeholder="123"
              value={customer.addressNumber}
              onChange={handleInputChange}
              icon={<Hash className="w-4 h-4" />}
            />
          </div>

          <div className="w-full h-px bg-zinc-200 dark:bg-brand-border/50 my-2"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              placeholder="ABC-1234"
              value={customer.plate ? customer.plate.toUpperCase() : ''}
              onChange={(e) => handleInputChange({ ...e, target: { ...e.target, value: e.target.value.toUpperCase() } })}
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
                Foto do Veículo (Opcional)
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
                    <span className="font-medium text-sm">Foto do veículo</span>
                </button>
            ) : (
                <div className="relative rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-black">
                    <img src={photoPreview} alt="Preview" className="w-full h-64 object-cover opacity-80" />
                    
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

          <div className="pt-6 flex justify-center">
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

        </form>
      </div>

      <ProcessingOverlay 
        status={status}
        onClose={resetForm}
      />

      {/* --- MODAL DE HISTÓRICO (ARQUIVADOS) --- */}
      {isHistoryOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
            <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-4xl h-[85vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-modal-sheet relative">
               
               {/* Header Modal */}
               <div className="p-6 border-b border-zinc-200/60 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/80 dark:bg-white/[0.04]">
                  <div className="flex items-center gap-3">
                     <div className="bg-brand-yellow/10 p-2 rounded-xl">
                        <History className="w-6 h-6 text-brand-yellow" />
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Histórico de Veículos</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Busca automática ou manual</p>
                     </div>
                  </div>
                  <button onClick={() => setIsHistoryOpen(false)} className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               {/* Search Area */}
               <div className="p-6 bg-zinc-100 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex gap-3">
                     <div className="flex-1 relative">
                        <input 
                           type="text" 
                           placeholder="Digite placa, nome, cpf, telefone ou cep..." 
                           value={historySearchPlate}
                           onChange={(e) => setHistorySearchPlate(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                           className="w-full bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow/50 transition-colors"
                        />
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     </div>
                     <button 
                        onClick={() => handleSearchHistory()}
                        disabled={isLoadingHistory}
                        className="bg-brand-yellow text-black px-6 rounded-xl font-bold hover:bg-[#fcd61e] transition-colors disabled:opacity-50"
                     >
                        {isLoadingHistory ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Buscar'}
                     </button>
                  </div>
               </div>

               {/* Results List */}
               <div className="flex-1 overflow-y-auto p-6 bg-zinc-50 dark:bg-[#0A0A0A] custom-scrollbar">
                  {isLoadingHistory ? (
                     <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                        <RefreshCw className="w-8 h-8 animate-spin text-brand-yellow" />
                        <p>Buscando no arquivo morto...</p>
                     </div>
                  ) : archivedCards.length > 0 ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {archivedCards.map(card => {
                           const parts = card.name.split('-');
                           const model = parts[0]?.trim() || card.name;
                           const plate = parts[1]?.trim() || '---';
                           const customerName = parts[2]?.trim() || '';

                           return (
                              <div 
                                 key={card.id}
                                 onClick={() => handleOpenCardDetails(card)}
                                 className="group bg-white dark:bg-[#1C1C1E] border border-zinc-200 dark:border-[#2C2C2E] rounded-2xl p-5 hover:border-brand-yellow/30 transition-all cursor-pointer shadow-sm dark:shadow-lg hover:shadow-md dark:hover:shadow-xl flex flex-col justify-between min-h-[140px]"
                              >
                                 <div className="flex justify-between items-start mb-4">
                                    <div>
                                       <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter truncate max-w-[200px]">{model}</h3>
                                       <div className="flex items-center gap-2 mt-1">
                                          <User className="w-3 h-3 text-zinc-500" />
                                          <p className="text-zinc-500 dark:text-zinc-300 text-sm font-bold truncate max-w-[150px]">{customerName}</p>
                                       </div>
                                    </div>
                                    <div className="bg-zinc-100 dark:bg-white text-zinc-900 dark:text-black font-mono font-black text-sm px-2 py-1 rounded border-2 border-zinc-900 dark:border-black">
                                       {plate.toUpperCase()}
                                    </div>
                                 </div>
                                 
                                 <div className="flex items-end justify-between mt-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                    {/* Data em Evidência */}
                                    <div className="flex flex-col">
                                         <span className="text-[10px] uppercase text-zinc-400 dark:text-zinc-400 font-bold tracking-wider">Arquivado em</span>
                                         <span className="text-xl text-brand-yellow font-black tracking-tight leading-none">
                                            {card.dateLastActivity ? new Date(card.dateLastActivity).toLocaleDateString('pt-BR') : 'N/A'}
                                         </span>
                                    </div>

                                    <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                                       Ver Detalhes <ArrowRight className="w-3 h-3" />
                                    </span>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                        <History className="w-16 h-16 mb-4 opacity-20" />
                        <p>Nenhum registro encontrado.</p>
                     </div>
                  )}
               </div>

            </div>
         </div>
      )}

      {/* --- DETALHES DO CARD ARQUIVADO (IDÊNTICO AO PÁTIO) --- */}
      {selectedHistoryCard && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
            <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-4xl h-[90vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-modal-sheet relative">
               
               {/* Header com Close e Botão de Ação Principal */}
               <div className="absolute top-6 right-6 z-10 flex gap-3">
                  <button 
                     onClick={() => handleUseRegistration(selectedHistoryCard)}
                     className="bg-brand-yellow hover:bg-[#fcd61e] text-black px-6 py-2.5 rounded-full font-bold shadow-lg shadow-brand-yellow/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                     <Copy className="w-4 h-4" />
                     USAR CADASTRO
                  </button>
                  <button 
                     onClick={() => setSelectedHistoryCard(null)}
                     className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800/80 backdrop-blur-md flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                  >
                     <X className="w-6 h-6" />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {/* Hero Section */}
                  <div className="p-8 md:p-12 pb-8">
                     <div className="flex flex-col gap-3 mb-6">
                        <span className="inline-flex self-start items-center gap-2 px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-xl border-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700">
                            ARQUIVADO
                        </span>
                        <h1 className="text-5xl md:text-7xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-none">
                          {selectedHistoryCard.name.split('-')[0]}
                        </h1>
                     </div>

                     <div className="flex flex-wrap items-center gap-4 text-zinc-400">
                         <div className="flex items-center">
                            {/* PLACA MERCOSUL */}
                            <div className="w-[140px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-xl shadow-black/20 select-none">
                               <div className="h-5 bg-[#003399] flex items-center justify-between px-3 relative">
                                  <span className="text-[8px] font-bold text-white tracking-wider">BRASIL</span>
                                  <BrazilFlagIcon width={16} height={11} className="rounded-sm flex-shrink-0 border border-white/30" />
                               </div>
                               <div className="h-10 flex items-center justify-center bg-white">
                                  <span className="text-black font-mono text-2xl font-black tracking-widest leading-none">
                                     {(selectedHistoryCard.name.split('-')[1]?.trim() || '---').toUpperCase()}
                                  </span>
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-4 py-2">
                            <User className="w-5 h-5 text-zinc-500" />
                            <span className="text-lg font-medium text-zinc-700 dark:text-white">{selectedHistoryCard.name.split('-')[2]?.trim()}</span>
                         </div>
                     </div>
                  </div>

                  <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800/50 mx-auto max-w-[90%]"></div>

                  {/* Body Content */}
                  <div className="p-8 md:p-12 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                      
                      {/* Left Column: Description & Comments */}
                      <div className="lg:col-span-2 space-y-10">
                        {/* Description */}
                        <div>
                           <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
                              <FileText className="w-4 h-4" />
                              Ficha Técnica & Queixa (Registro Antigo)
                           </h3>
                           <div className="bg-zinc-50 dark:bg-[#1C1C1E] rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 leading-relaxed font-light text-lg">
                              <ReactMarkdown components={MarkdownComponents}>
                                 {selectedHistoryCard.desc || "Nenhuma descrição disponível."}
                              </ReactMarkdown>
                           </div>
                        </div>

                        {/* Comments */}
                        <div>
                           <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <MessageSquare className="w-4 h-4" />
                             Histórico de Atividades
                          </h3>
                          <div className="bg-zinc-50 dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                             <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar bg-white dark:bg-[#121212]">
                                {loadingDetails ? (
                                   <div className="flex justify-center py-8">
                                      <RefreshCw className="w-6 h-6 text-brand-yellow animate-spin" />
                                   </div>
                                ) : cardDetails?.actions && cardDetails.actions.length > 0 ? (
                                   cardDetails.actions.map(action => (
                                      <div key={action.id} className="flex gap-4">
                                         <div className="flex-shrink-0">
                                            {action.memberCreator.avatarUrl ? (
                                               <img src={action.memberCreator.avatarUrl} alt={action.memberCreator.fullName} className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700" />
                                            ) : (
                                               <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                                                  <User className="w-5 h-5" />
                                               </div>
                                            )}
                                         </div>
                                         <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                               <span className="font-bold text-zinc-900 dark:text-white text-sm">{action.memberCreator.fullName}</span>
                                               <span className="text-xs text-zinc-500">{new Date(action.date).toLocaleString('pt-BR')}</span>
                                            </div>
                                            <div className="bg-zinc-100 dark:bg-zinc-800/50 p-3 rounded-r-xl rounded-bl-xl text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed border border-zinc-200 dark:border-zinc-700/50">
                                                <ReactMarkdown components={MarkdownComponents}>
                                                   {action.data.text}
                                                </ReactMarkdown>
                                            </div>
                                         </div>
                                      </div>
                                   ))
                                ) : (
                                   <div className="text-center py-8 text-zinc-600 italic">
                                      Nenhum comentário registrado no histórico.
                                   </div>
                                )}
                             </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Attachments */}
                      <div className="space-y-8">
                         <div>
                            <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                               <Paperclip className="w-4 h-4" />
                               Anexos Antigos
                            </h3>
                            <div className="space-y-3">
                               {loadingDetails ? (
                                  <div className="flex justify-center p-4">
                                     <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
                                  </div>
                               ) : cardDetails?.attachments && cardDetails.attachments.length > 0 ? (
                                  <div className="grid grid-cols-2 gap-2">
                                     {cardDetails.attachments.map(att => {
                                       const isImage = att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url);
                                       const isPdf = att.mimeType === 'application/pdf' || att.url.toLowerCase().endsWith('.pdf');
                                       
                                       return (
                                        <a 
                                          key={att.id} 
                                          href={att.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="block bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden group hover:border-zinc-400 dark:hover:border-zinc-500 transition-all cursor-pointer"
                                        >
                                           <div className="h-24 bg-zinc-200 dark:bg-black flex items-center justify-center relative overflow-hidden">
                                              {att.previews && att.previews.length > 0 ? (
                                                 <img 
                                                   src={att.previews[att.previews.length > 2 ? 2 : 0].url}
                                                   alt={att.name} 
                                                   className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                                 />
                                              ) : (
                                                 <FileText className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
                                              )}
                                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <ExternalLink className="w-5 h-5 text-white" />
                                              </div>
                                           </div>
                                           <div className="p-2 bg-zinc-50 dark:bg-zinc-900">
                                              <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate">{att.name}</p>
                                           </div>
                                        </a>
                                     )})}
                                  </div>
                               ) : (
                                  <div className="text-center py-6 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">
                                     <p className="text-zinc-600 text-sm">Nenhum anexo encontrado.</p>
                                  </div>
                               )}
                            </div>
                         </div>
                         {selectedHistoryCard.due && (
                           <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
                              <Calendar className="w-4 h-4 text-brand-yellow" />
                              <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
                                Entrega: {new Date(selectedHistoryCard.due).toLocaleDateString('pt-BR')}
                              </span>
                           </div>
                         )}
                      </div>

                  </div>
               </div>

            </div>
         </div>
      )}

    </div>
  );
};