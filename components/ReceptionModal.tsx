import React, { useState, useEffect, useRef } from 'react';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, X, Camera, Image as ImageIcon } from 'lucide-react';
import { Customer, ProcessingStatus } from '../types';
import { Input, TextArea } from './ui/Input';
import { ProcessingOverlay } from './ProcessingOverlay';
import { saveReceptionIntake, uploadServiceOrderPhoto } from '../services/apiService';

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
  blurPlates?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReceptionModal: React.FC<ReceptionModalProps> = ({
  isOpen,
  initialData,
  blurPlates = false,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1C1C1E] border border-zinc-200 dark:border-white/10 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-white/10 bg-gradient-to-r from-brand-yellow/10 to-transparent dark:from-brand-yellow/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-yellow/20 flex items-center justify-center">
              <Car className="w-5 h-5 text-brand-yellow" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Chegou ao Pátio</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Preencha e confirme para criar a ficha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - scrollable */}
        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nome" name="name" placeholder="Nome do cliente" value={customer.name} onChange={handleInputChange} icon={<User className="w-4 h-4" />} />
              <Input label="CPF" name="cpf" placeholder="000.000.000-00" value={customer.cpf} onChange={handleInputChange} icon={<ShieldCheck className="w-4 h-4" />} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Telefone" name="phone" placeholder="(11) 99999-9999" value={customer.phone} onChange={handleInputChange} icon={<Smartphone className="w-4 h-4" />} />
              <Input label="E-mail" name="email" placeholder="email@exemplo.com" value={customer.email ?? ''} onChange={handleInputChange} icon={<Mail className="w-4 h-4" />} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Endereço" name="address" placeholder="Rua, bairro..." value={customer.address} onChange={handleInputChange} icon={<Map className="w-4 h-4" />} />
              <Input label="CEP" name="cep" placeholder="00000-000" value={customer.cep} onChange={handleInputChange} icon={<MapPin className="w-4 h-4" />} />
            </div>
            <Input label="Nº" name="addressNumber" placeholder="123" value={customer.addressNumber} onChange={handleInputChange} icon={<Hash className="w-4 h-4" />} />

            <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-2" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Modelo do veículo" name="vehicleModel" placeholder="Ex: BMW 320i" value={customer.vehicleModel} onChange={handleInputChange} icon={<Car className="w-4 h-4" />} />
              <Input
                label="Placa"
                name="plate"
                placeholder="ABC-1D23"
                value={customer.plate ? customer.plate.toUpperCase() : ''}
                onChange={handlePlateChange}
                className="uppercase"
                maxLength={8}
                icon={<FileText className="w-4 h-4" />}
              />
            </div>
            <Input label="Km" name="mileageKm" placeholder="Ex: 45000" value={customer.mileageKm ?? ''} onChange={handleInputChange} icon={<Hash className="w-4 h-4" />} />

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Queixa do cliente</label>
              <TextArea label="" name="issueDescription" placeholder="Descreva o problema..." value={customer.issueDescription} onChange={handleInputChange} className="min-h-[80px]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Foto (opcional)</label>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
              {!photoPreview ? (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-3 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl flex items-center justify-center gap-2 text-zinc-500 hover:border-brand-yellow hover:bg-brand-yellow/5 transition-colors">
                  <Camera className="w-5 h-5" />
                  <span className="text-sm">Adicionar foto do veículo</span>
                </button>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <img src={photoPreview} alt="Preview" className="w-full h-40 object-cover" />
                  <button type="button" onClick={() => { setPhotoBlob(null); setPhotoPreview(null); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/90 text-white hover:bg-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-brand-yellow text-black font-bold shadow-lg shadow-brand-yellow/20 hover:bg-[#fcd61e] transition-all flex items-center justify-center gap-2">
                Criar Ficha
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
