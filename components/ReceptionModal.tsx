import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, X, Camera, Search, Loader2 } from 'lucide-react';
import { Customer, ProcessingStatus } from '../types';
import { ProcessingOverlay } from './ProcessingOverlay';
import { saveReceptionIntake, uploadServiceOrderPhoto, consultPlacaFipe } from '../services/apiService';
import { iosModalShell, iosModalClose, iosLabel, iosInput, iosAccentPrimaryButton } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';

const emptyCustomer: Customer = {
  name: '',
  cpf: '',
  phone: '',
  email: '',
  cep: '',
  address: '',
  city: '',
  addressNumber: '',
  vehicleBrand: '',
  vehicleModel: '',
  plate: '',
  vehicleColor: '',
  vehicleYear: '',
  vehicleEngineInfo: '',
  mileageKm: '',
  issueDescription: '',
};

function normalizePlacaLocal(raw: string) {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

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
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);
  const [plateLookupError, setPlateLookupError] = useState<string | null>(null);
  const lastFetchedPlacaRef = useRef<string | null>(null);
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
        city: initialData.city ?? '',
        addressNumber: initialData.addressNumber ?? '',
        vehicleBrand: initialData.vehicleBrand ?? '',
        vehicleModel: initialData.vehicleModel ?? '',
        plate: initialData.plate ?? '',
        vehicleColor: initialData.vehicleColor ?? '',
        vehicleYear: initialData.vehicleYear ?? '',
        vehicleEngineInfo: initialData.vehicleEngineInfo ?? '',
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

  const runPlacaLookup = useCallback(
    async (force?: boolean) => {
      const p = normalizePlacaLocal(customer.plate);
      if (p.length < 7) {
        setPlateLookupError('Placa incompleta (mín. 7 caracteres).');
        return;
      }
      if (!force && lastFetchedPlacaRef.current === p) return;
      setPlateLookupError(null);
      setPlateLookupLoading(true);
      try {
        const result = await consultPlacaFipe(p);
        lastFetchedPlacaRef.current = normalizePlacaLocal(result.plate || p);
        setCustomer((prev) => ({
          ...prev,
          plate: (result.plate || p).toUpperCase(),
          vehicleBrand: result.vehicleBrand?.trim() || prev.vehicleBrand,
          vehicleModel: result.vehicleModel?.trim() || prev.vehicleModel,
          vehicleColor: result.vehicleColor?.trim() || prev.vehicleColor,
          vehicleYear: result.vehicleYear?.trim() || prev.vehicleYear,
          vehicleEngineInfo: result.vehicleEngineInfo?.trim() || prev.vehicleEngineInfo,
        }));
      } catch (e: unknown) {
        setPlateLookupError(e instanceof Error ? e.message : 'Falha na consulta.');
      } finally {
        setPlateLookupLoading(false);
      }
    },
    [customer.plate]
  );

  useEffect(() => {
    const p = normalizePlacaLocal(customer.plate);
    if (lastFetchedPlacaRef.current != null && p !== lastFetchedPlacaRef.current) {
      lastFetchedPlacaRef.current = null;
    }
  }, [customer.plate]);

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

  useRegisterModalOpen(isOpen);

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
                <label className={iosLabel}>Marca / montadora</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="vehicleBrand"
                    placeholder="Ex.: Renault"
                    value={customer.vehicleBrand ?? ''}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={iosLabel}>Modelo (no card)</label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="vehicleModel"
                    placeholder="Ex.: Logan 1.6 ou pela placa"
                    value={customer.vehicleModel}
                    onChange={handleInputChange}
                    className={`${iosInput} pl-10`}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className={iosLabel}>Placa</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="relative flex-1 min-w-0">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="plate"
                    placeholder="ABC1D23"
                    value={customer.plate ? customer.plate.toUpperCase() : ''}
                    onChange={handlePlateChange}
                    onBlur={() => void runPlacaLookup(false)}
                    maxLength={8}
                    className={`${iosInput} pl-10 uppercase w-full`}
                  />
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void runPlacaLookup(true)}
                  disabled={plateLookupLoading}
                  className="shrink-0 flex items-center justify-center gap-2 rounded-xl border border-zinc-200/90 px-3 py-2.5 text-sm font-semibold text-zinc-800 dark:border-white/[0.12] dark:text-zinc-100 disabled:opacity-50"
                >
                  {plateLookupLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="w-4 h-4" aria-hidden />
                  )}
                  Buscar placa
                </button>
              </div>
              {plateLookupError ? (
                <p className="text-xs text-red-600 dark:text-red-400">{plateLookupError}</p>
              ) : (
                <p className="text-[11px] text-zinc-500">Token da API fica só no servidor (Vercel).</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={iosLabel}>Cor</label>
                <input
                  type="text"
                  name="vehicleColor"
                  placeholder="Ex.: Branca"
                  value={customer.vehicleColor ?? ''}
                  onChange={handleInputChange}
                  className={iosInput}
                />
              </div>
              <div>
                <label className={iosLabel}>Ano</label>
                <input
                  type="text"
                  name="vehicleYear"
                  placeholder="2010 / 2010"
                  value={customer.vehicleYear ?? ''}
                  onChange={handleInputChange}
                  className={iosInput}
                />
              </div>
              <div>
                <label className={iosLabel}>Motor</label>
                <input
                  type="text"
                  name="vehicleEngineInfo"
                  placeholder="Cilindradas / combustível"
                  value={customer.vehicleEngineInfo ?? ''}
                  onChange={handleInputChange}
                  className={iosInput}
                />
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
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif" onChange={handleFileSelect} />
              {!photoPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 border border-zinc-200/90 dark:border-white/[0.1] rounded-2xl flex items-center justify-center gap-3 text-zinc-600 dark:text-zinc-300 bg-white/50 dark:bg-white/[0.04] backdrop-blur-md hover:border-[#007AFF]/40 hover:bg-white/80 dark:hover:bg-white/[0.08] transition-all active:scale-[0.99]"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-[15px] font-medium">Foto (câmera ou galeria)</span>
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
              <button type="submit" className={`${iosAccentPrimaryButton} flex-1 flex items-center justify-center gap-2`}>
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
