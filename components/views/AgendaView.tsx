import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, MapPin, User, Car, CheckCircle2, AlertCircle, X, CalendarDays, List, RefreshCw, ArrowRight, FileText, Edit2, ExternalLink, Trash2, Phone, Mail } from 'lucide-react';
import { Customer, Appointment } from '../../types';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from '../../services/apiService';
import { ReceptionModal } from '../ReceptionModal';

interface AgendaViewProps {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  blurPlates?: boolean;
}

export const AgendaView: React.FC<AgendaViewProps> = ({ appointments, setAppointments, blurPlates = false }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [receptionModalData, setReceptionModalData] = useState<Customer | null>(null);
  /** Id do agendamento que abriu o modal "Chegou ao Pátio"; ao criar a ficha, este agendamento é removido da agenda. */
  const [receptionSourceAppointmentId, setReceptionSourceAppointmentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newAppointment, setNewAppointment] = useState<Partial<Appointment>>({
    date: new Date(),
    time: '09:00',
    status: 'scheduled',
    title: '',
    customerName: '',
    phone: '',
    email: '',
    vehicleModel: '',
    plate: '',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const exportToGoogleCalendar = (app: Appointment) => {
    const [hours, minutes] = app.time.split(':').map(Number);
    const startDate = new Date(app.date);
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1); // Default 1 hour duration

    const formatGDate = (date: Date) => date.toISOString().replace(/-|:|\.\d+/g, '');
    
    const title = encodeURIComponent(`${app.vehicleModel} - ${app.title}`);
    const details = encodeURIComponent(`Cliente: ${app.customerName}\nPlaca: ${app.plate}\nNotas: ${app.notes || ''}`);
    const dates = `${formatGDate(startDate)}/${formatGDate(endDate)}`;
    
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&sf=true&output=xml`;
    window.open(url, '_blank');
  };

  const handleEditClick = (app: Appointment) => {
    setNewAppointment(app);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const fetchAppointments = async () => {
    setIsLoading(true);
    try {
      const list = await getAppointments();
      setAppointments(list);
    } catch (err) {
      console.error("Falha ao carregar agendamentos da API", err);
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Load appointments from localStorage on mount (Removed as it's now in App.tsx)
  // Save appointments to localStorage whenever they change (Removed as it's now in App.tsx)

  const nextPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 7));
    }
  };

  const prevPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, -7));
    }
  };

  const onDateClick = (day: Date) => {
    setSelectedDate(day);
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    const date = newAppointment.date || selectedDate;
    const time = newAppointment.time || '09:00';

    setIsLoading(true);
    try {
      if (isEditing && newAppointment.id) {
        await updateAppointment(newAppointment.id, {
          title: newAppointment.title || 'Sem título',
          customerName: newAppointment.customerName || 'Cliente não informado',
          phone: newAppointment.phone || undefined,
          email: newAppointment.email || undefined,
          vehicleModel: newAppointment.vehicleModel || '',
          plate: newAppointment.plate || '',
          notes: newAppointment.notes || undefined,
          date,
          time,
          status: 'scheduled',
          trelloCardId: newAppointment.trelloCardId,
        });
      } else {
        await createAppointment({
          title: newAppointment.title || 'Sem título',
          customerName: newAppointment.customerName || 'Cliente não informado',
          phone: newAppointment.phone || undefined,
          email: newAppointment.email || undefined,
          vehicleModel: newAppointment.vehicleModel || '',
          plate: newAppointment.plate || '',
          notes: newAppointment.notes || undefined,
          date,
          time,
          status: 'scheduled',
          trelloCardId: newAppointment.trelloCardId,
        });
      }

      await fetchAppointments();
    } catch (err) {
      console.error("Erro ao salvar agendamento", err);
      alert(err instanceof Error ? err.message : "Erro ao salvar agendamento.");
    } finally {
      setIsLoading(false);
    }

    setIsModalOpen(false);
    setIsEditing(false);
    setNewAppointment({
      date: selectedDate,
      time: '09:00',
      status: 'scheduled',
      title: '',
      customerName: '',
      phone: '',
      email: '',
      vehicleModel: '',
      plate: '',
      notes: ''
    });
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) return;
    try {
      await deleteAppointment(id);
      await fetchAppointments();
    } catch (err) {
      console.error("Erro ao excluir agendamento", err);
      alert(err instanceof Error ? err.message : "Erro ao excluir agendamento.");
    }
  };

  const handleChegouAoPatio = (app: Appointment) => {
    const customerData: Customer = {
      name: app.customerName ?? '',
      phone: app.phone ?? '',
      email: app.email ?? '',
      cpf: '',
      cep: '',
      address: '',
      addressNumber: '',
      vehicleModel: app.vehicleModel ?? '',
      plate: app.plate ?? '',
      mileageKm: '',
      issueDescription: [app.title, app.notes].filter(Boolean).join('\n') || 'Agendamento',
      trelloCardId: app.trelloCardId,
    };
    setReceptionModalData(customerData);
    setReceptionSourceAppointmentId(app.id);
  };

  const handleNewAppointment = (date?: Date) => {
    const targetDate = date || selectedDate || new Date();
    setIsEditing(false);
    setNewAppointment({
      date: targetDate,
      time: '09:00',
      status: 'scheduled',
      title: '',
      customerName: '',
      phone: '',
      email: '',
      vehicleModel: '',
      plate: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  // Render Calendar Header
  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-yellow flex items-center gap-3">
            <CalendarIcon className="w-8 h-8" />
            AGENDA
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {format(currentDate, "MMMM yyyy", { locale: ptBR }).toUpperCase()}
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button 
            onClick={prevPeriod}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 text-xs font-bold uppercase text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            {format(currentDate, "MMMM", { locale: ptBR })}
          </button>
          <button 
            onClick={nextPeriod}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchAppointments}
            disabled={isLoading}
            className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-brand-yellow transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => handleNewAppointment()}
            className="bg-brand-yellow text-black px-4 py-2 rounded-lg font-bold hover:bg-[#fcd61e] transition-colors flex items-center gap-2 shadow-lg shadow-brand-yellow/20"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Novo Agendamento</span>
          </button>
        </div>
      </div>
    );
  };

  // Render Days of Week
  const renderDays = () => {
    const dateFormat = "EEEE";
    const days = [];
    let startDate = startOfWeek(currentDate, { locale: ptBR });

    for (let i = 0; i < 7; i++) {
      const currentDay = addDays(startDate, i);
      const isWeekend = currentDay.getDay() === 0 || currentDay.getDay() === 6;
      
      days.push(
        <div 
          key={i} 
          className={`text-center text-xs font-bold uppercase py-4 tracking-wider ${isWeekend ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}
        >
          {format(currentDay, dateFormat, { locale: ptBR })}
        </div>
      );
    }

    return <div className="grid grid-cols-7 mb-2 border-b border-zinc-200 dark:border-zinc-800">{days}</div>;
  };

  // Render Cells
  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { locale: ptBR });
    const endDate = endOfWeek(monthEnd, { locale: ptBR });

    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        
        // Filter appointments for this day
        const dayAppointments = appointments.filter(app => isSameDay(app.date, day));
        const isSelected = isSameDay(day, selectedDate);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isTodayDate = isToday(day);

        days.push(
          <div
            key={day.toString()}
            className={`
              min-h-[120px] p-2 border border-zinc-200/50 dark:border-zinc-800/50 relative group transition-colors
              ${!isCurrentMonth ? "bg-zinc-100/50 dark:bg-zinc-900/20 text-zinc-400 dark:text-zinc-500" : "bg-white dark:bg-[#1C1C1E] text-zinc-700 dark:text-zinc-200"}
              ${isSelected ? "ring-2 ring-brand-yellow ring-inset z-10" : ""}
              hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer
            `}
            onClick={() => onDateClick(cloneDay)}
          >
            <div className="flex justify-between items-start mb-2">
                <span className={`
                    text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                    ${isTodayDate ? "bg-brand-yellow text-black" : ""}
                `}>
                    {formattedDate}
                </span>
                {dayAppointments.length > 0 && (
                    <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300 font-mono">
                        {dayAppointments.length}
                    </span>
                )}
            </div>
            
            <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {dayAppointments.map(app => (
                    <div key={app.id} className="text-[10px] bg-zinc-100 dark:bg-zinc-800/80 p-1.5 rounded border-l-2 border-brand-yellow truncate hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" title={`${app.time} - ${app.title}`}>
                        <span className="font-bold text-zinc-900 dark:text-zinc-200 mr-1">{app.time}</span>
                        <span className="text-zinc-600 dark:text-zinc-300">{app.title}</span>
                    </div>
                ))}
            </div>

            {/* Add Button on Hover */}
            <button 
                onClick={(e) => { e.stopPropagation(); handleNewAppointment(cloneDay); }}
                className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-brand-yellow hover:text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            >
                <Plus className="w-3 h-3" />
            </button>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">{rows}</div>;
  };

  // Render Selected Day Details
  const renderSelectedDayDetails = () => {
    const dayAppointments = appointments
        .filter(app => isSameDay(app.date, selectedDate))
        .sort((a, b) => a.time.localeCompare(b.time));

    return (
        <div className="mt-8">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-brand-yellow" />
                        Agendamentos
                    </h3>
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-mono">
                        {dayAppointments.length} compromissos
                    </span>
                </div>

                {dayAppointments.length > 0 ? (
                    <div className="space-y-4">
                        {dayAppointments.map(app => (
                            <div 
                                key={app.id} 
                                onClick={() => handleEditClick(app)}
                                className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-brand-yellow/30 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 cursor-pointer"
                            >
                                <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-1 min-w-[80px]">
                                    <span className="text-xl font-black text-zinc-900 dark:text-white">{app.time}</span>
                                    <div className={`w-3 h-3 rounded-full ${app.status === 'completed' ? 'bg-green-500' : app.status === 'cancelled' ? 'bg-red-500' : 'bg-brand-yellow'}`} />
                                </div>
                                
                                <div className="flex-1">
                                    <h4 className="font-black text-zinc-900 dark:text-white text-xl uppercase tracking-tight">
                                        {app.vehicleModel || 'Veículo não informado'}
                                    </h4>
                                    <p className="text-brand-yellow font-bold text-sm mt-0.5">{app.title}</p>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-zinc-400" />
                                            <span className="font-medium">{app.customerName}</span>
                                        </div>
                                        {app.plate && (
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-zinc-400" />
                                                <span className={`font-mono uppercase ${blurPlates ? 'blur-plate' : ''}`}>{app.plate ? app.plate.toUpperCase() : ''}</span>
                                            </div>
                                        )}
                                        {app.notes && (
                                            <div className="flex items-start gap-2 w-full mt-2 bg-zinc-100 dark:bg-zinc-800/50 p-3 rounded-lg">
                                                <AlertCircle className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                                <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">{app.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleChegouAoPatio(app); }}
                                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-brand-yellow text-black hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                                        title="Chegou ao Pátio"
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                        CHEGOU AO PÁTIO
                                    </button>
                                    
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); exportToGoogleCalendar(app); }}
                                        className="p-2.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                        title="Exportar para Google Agenda"
                                    >
                                        <ExternalLink className="w-5 h-5" />
                                    </button>

                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleEditClick(app); }}
                                        className="p-2.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-brand-yellow dark:hover:text-brand-yellow hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                                        title="Editar Agendamento"
                                    >
                                        <Edit2 className="w-5 h-5" />
                                    </button>

                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAppointment(app.id);
                                        }}
                                        className="p-2.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">
                        <Clock className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-500 dark:text-zinc-400">Nenhum agendamento local.</p>
                    </div>
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-24 animate-in fade-in duration-500">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
      {renderSelectedDayDetails()}

      {/* Modal Chegou ao Pátio — recepção preenchida com dados do agendamento */}
      <ReceptionModal
        isOpen={receptionModalData !== null}
        initialData={receptionModalData}
        blurPlates={blurPlates}
        onClose={() => { setReceptionModalData(null); setReceptionSourceAppointmentId(null); }}
        onSuccess={async () => {
          if (receptionSourceAppointmentId) {
            try {
              await deleteAppointment(receptionSourceAppointmentId);
            } catch (err) {
              console.error("Erro ao remover agendamento após criar ficha", err);
            }
            setReceptionSourceAppointmentId(null);
          }
          await fetchAppointments();
        }}
      />

      {/* Modal Novo Agendamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
            <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-md max-h-[90vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] flex flex-col animate-modal-sheet">
                <div className="p-6 border-b border-zinc-200/60 dark:border-white/[0.08] flex justify-between items-center bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                        {isEditing ? 'Editar Agendamento' : 'Novo Agendamento'}
                    </h2>
                    <button onClick={() => { 
                        setIsModalOpen(false); 
                        setIsEditing(false);
                        setNewAppointment({
                            date: selectedDate,
                            time: '09:00',
                            status: 'scheduled',
                            title: '',
                            customerName: '',
                            phone: '',
                            email: '',
                            vehicleModel: '',
                            plate: '',
                            notes: ''
                        });
                    }} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="overflow-y-auto custom-scrollbar">
                    <form onSubmit={handleAddAppointment} className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Título do Serviço</label>
                            <input 
                                type="text" 
                                placeholder="Ex: Revisão Geral"
                                autoComplete="off"
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                value={newAppointment.title}
                                onChange={e => setNewAppointment({...newAppointment, title: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Data</label>
                                <input 
                                    type="date" 
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                    value={newAppointment.date ? format(newAppointment.date, 'yyyy-MM-dd') : ''}
                                    onChange={e => setNewAppointment({...newAppointment, date: parseISO(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Horário</label>
                                <input 
                                    type="time" 
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                    value={newAppointment.time}
                                    onChange={e => setNewAppointment({...newAppointment, time: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Cliente</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input 
                                    type="text" 
                                    placeholder="Nome do Cliente"
                                    autoComplete="off"
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                    value={newAppointment.customerName}
                                    onChange={e => setNewAppointment({...newAppointment, customerName: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Telefone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input 
                                        type="tel" 
                                        placeholder="(00) 00000-0000"
                                        autoComplete="off"
                                        className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                        value={newAppointment.phone || ''}
                                        onChange={e => setNewAppointment({...newAppointment, phone: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">E-mail</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input 
                                        type="email" 
                                        placeholder="email@exemplo.com"
                                        autoComplete="off"
                                        className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                        value={newAppointment.email || ''}
                                        onChange={e => setNewAppointment({...newAppointment, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Veículo</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Modelo"
                                        autoComplete="off"
                                        className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow"
                                        value={newAppointment.vehicleModel}
                                        onChange={e => setNewAppointment({...newAppointment, vehicleModel: e.target.value})}
                                    />
                                </div>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Placa"
                                        autoComplete="off"
                                        className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 pl-10 pr-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow uppercase"
                                        value={newAppointment.plate ? newAppointment.plate.toUpperCase() : ''}
                                        onChange={e => setNewAppointment({...newAppointment, plate: e.target.value.toUpperCase()})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Observações</label>
                            <textarea 
                                placeholder="Detalhes adicionais..."
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-brand-yellow min-h-[80px]"
                                value={newAppointment.notes}
                                onChange={e => setNewAppointment({...newAppointment, notes: e.target.value})}
                            />
                        </div>

                        <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-[#1C1C1E] pb-2">
                            <button 
                                type="button" 
                                onClick={() => { 
                                    setIsModalOpen(false); 
                                    setIsEditing(false);
                                    setNewAppointment({
                                        date: selectedDate,
                                        time: '09:00',
                                        status: 'scheduled',
                                        title: '',
                                        customerName: '',
                                        phone: '',
                                        email: '',
                                        vehicleModel: '',
                                        plate: '',
                                        notes: ''
                                    });
                                }}
                                className="px-4 py-2 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className="px-6 py-2 bg-brand-yellow text-black rounded-lg font-bold hover:bg-[#fcd61e] transition-colors shadow-lg shadow-brand-yellow/20"
                            >
                                {isEditing ? 'Salvar Alterações' : 'Agendar'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
