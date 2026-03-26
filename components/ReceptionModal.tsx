import React, { useState, useEffect, useRef } from 'react';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, X, Camera } from 'lucide-react';
import { Customer, ProcessingStatus } from '../types';
import { ProcessingOverlay } from './ProcessingOverlay';
import { saveReceptionIntake, uploadServiceOrderPhoto } from '../services/apiService';
import { iosModalShell, iosModalClose, iosLabel, iosInput, iosPrimaryButton } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';

const emptyCustomer: Customer = {
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
};

interface ReceptionModalProps {
  isOpen: boolean;
  initialData: Customer | null;
  /** Reservado para compatibilidade (ex.: embaçar placas em telas somente leitura). */
  blurPlates?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReceptionModal: React.FC<ReceptionModalProps> = ({
  isOpen,
  initialData,
  blurPlates: _blurPlates = false,
  onClose,
  onSuccess,
}) => {
  const [customer, setCustomer] = useState<Customer>({ ...emptyCustomer });
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle' });
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && initialData) {
      setCustomer({
        name: initialData.name ?? '',
        cpf: initialData.cpf ?? '',
        phone: initialData.phone ?? '',
        email: initialData.email ?? '',
        cep: initialData.cep ?? '',
        address: initialData.address ?? '',
        addressNumber: initialData.addressNumber ?? '',
        vehicleModel: initialData.vehicleModel ?? '',
        plate: initialData.plate ?? '',
        mileageKm: initialData.mileageKm ?? '',
        issueDescription: initialData.issueDescription ?? '',
        trelloCardId: initialData.trelloCardId,
      });
      setPhotoBlob(null);
      setPhotoPreview(null);
      setStatus({ step: 'idle' });
    }
  }, [isOpen, initialData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCustomer((prev) => ({ ...prev, [name]: value }));
  };

  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomer((prev) => ({ ...prev, plate: e.target.value.toUpperCase() }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.name && !customer.phone && !customer.vehicleModel && !customer.plate) {
      setStatus({ step: 'error', message: 'Preencha pelo menos algum dado de identificação (nome, telefone, veículo ou placa).' });
      return;
    }
    try {
      setStatus({ step: 'creating', message: 'Criando cadastro' });
      const { serviceOrder } = await saveReceptionIntake(customer);

      if (photoBlob && serviceOrder?.id) {
        await uploadServiceOrderPhoto(serviceOrder.id, photoBlob, `entrada_${serviceOrder.id}_${Date.now()}.jpg`);
      }

      setStatus({ step: 'success', message: 'Cadastro criado com sucesso' });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setStatus({ step: 'error', message: `Erro: ${msg}` });
    }
  };

  const resetForm = () => {
    setCustomer(initialData ? { ...emptyCustomer, ...initialData } : { ...emptyCustomer });
    setPhotoBlob(null);
    setPhotoPreview(null);
    setStatus({ step: 'idle' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className={`${iosModalShell} w-full max-w-2xl max-h-[90vh] animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
          <IosModalHeader
            icon={<Car className="w-6 h-6 text-white" strokeWidth={2.2} />}
            title="Chegou ao pátio"
            subtitle="Confirme os dados do agendamento e crie a ficha"
            gradientClass="from-emerald-500 to-teal-700"
          />
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 sm:px-8 pb-8 custom-scrollbar">
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={iosLabel}>Nome</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="name"
                    placeholder="Nome do cliente"
                    value={customer.name}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                    autoComplete="name"
                  />
                </div>
              </div>
              <div>
                <label className={iosLabel}>CPF</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="cpf"
                    placeholder="000.000.000-00"
                    value={customer.cpf}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={iosLabel}>Telefone</label>
                <div className="relative">
                  <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="tel"
                    name="phone"
                    placeholder="(11) 99999-9999"
                    value={customer.phone}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div>
                <label className={iosLabel}>E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="email"
                    name="email"
                    placeholder="email@exemplo.com"
                    value={customer.email ?? ''}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                    autoComplete="email"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={iosLabel}>Endereço</label>
                <div className="relative">
                  <Map className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="address"
                    placeholder="Rua, bairro..."
                    value={customer.address}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={iosLabel}>CEP</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="cep"
                    placeholder="00000-000"
                    value={customer.cep}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={iosLabel}>Nº</label>
              <div className="relative">
                <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="addressNumber"
                  placeholder="123"
                  value={customer.addressNumber}
                  onChange={handleInputChange}
                  className={`${iosInput} pl-10`}
                />
              </div>
            </div>

            <div className="h-px bg-zinc-200/70 dark:bg-white/[0.08] my-1" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={iosLabel}>Modelo do veículo</label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="vehicleModel"
                    placeholder="Ex.: BMW 320i"
                    value={customer.vehicleModel}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={iosLabel}>Placa</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="plate"
                    placeholder="ABC-1D23"
                    value={customer.plate ? customer.plate.toUpperCase() : ''}
                    onChange={handlePlateChange}
                    maxLength={8}
                    className={`${iosInput} pl-10 uppercase`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={iosLabel}>Km</label>
              <div className="relative">
                <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="mileageKm"
                  placeholder="Ex.: 45000"
                  value={customer.mileageKm ?? ''}
                  onChange={handleInputChange}
                  className={`${iosInput} pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={iosLabel}>Queixa do cliente</label>
              <textarea
                name="issueDescription"
                placeholder="Descreva o problema..."
                value={customer.issueDescription}
                onChange={handleInputChange}
                className={`${iosInput} min-h-[88px] resize-y py-3`}
              />
            </div>

            <div>
              <label className={iosLabel}>Foto (opcional)</label>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
              {!photoPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 border border-zinc-200/90 dark:border-white/[0.1] rounded-2xl flex items-center justify-center gap-3 text-zinc-600 dark:text-zinc-300 bg-white/50 dark:bg-white/[0.04] backdrop-blur-md hover:border-[#007AFF]/40 hover:bg-white/80 dark:hover:bg-white/[0.08] transition-all active:scale-[0.99]"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-[15px] font-medium">Adicionar foto do veículo</span>
                </button>
              ) : (
                <div className="relative rounded-[1.25rem] overflow-hidden border border-zinc-200/80 dark:border-white/[0.1] bg-zinc-100/80 dark:bg-black/40 shadow-inner">
                  <img src={photoPreview} alt="" className="w-full h-44 object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoBlob(null);
                      setPhotoPreview(null);
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-red-500/95 text-white hover:bg-red-600 shadow-lg transition-colors"
                    aria-label="Remover foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-zinc-200/50 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.12] text-[15px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button type="submit" className={`${iosPrimaryButton} flex-1 flex items-center justify-center gap-2 py-3.5`}>
                Criar ficha
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <ProcessingOverlay status={status} onClose={resetForm} />
    </div>
  );
};
