import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, X, MessageSquare, Paperclip, Download, ZoomIn, Eye, ExternalLink, Eraser, Camera, Image as ImageIcon, Calendar, Package } from 'lucide-react';
import { Customer, ProcessingStatus } from '../../types';
import { Input, TextArea } from '../ui/Input';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { saveReceptionIntake } from '../../services/apiService';
import type { ServiceOrderType } from '../../services/apiService';

const RECEPTION_MODE_KEY = 'app_reception_mode';

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

          {receptionMode === 'vehicle' ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

    </div>
  );
};