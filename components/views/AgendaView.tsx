import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, Car, AlertCircle, X, CalendarDays, RefreshCw, ArrowRight, FileText, Edit2, ExternalLink, Trash2, Phone, Mail, Sparkles } from 'lucide-react';
import { iosModalShell, iosModalClose, iosLabel, iosPageGlass, iosInput, iosPrimaryButton } from '../ui/iosModalStyles';
import { IosModalHeader } from '../ui/IosModalHeader';
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
    const date = app.date instanceof Date ? app.date : (app.date ? new Date(app.date) : new Date());
    setNewAppointment({ ...app, date });
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
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6 lg:mb-8">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/95 to-indigo-600 shadow-lg shadow-indigo-500/25 ring-1 ring-white/20 dark:ring-white/10">
            <CalendarIcon className="w-7 h-7 text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Agenda
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-amber-500/90 shrink-0" strokeWidth={2} />
              <span>{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-0.5 p-1 rounded-2xl bg-zinc-200/90 dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/[0.08] backdrop-blur-xl shadow-inner">
            <button
              type="button"
              onClick={prevPeriod}
              className="p-2 rounded-[0.85rem] text-zinc-600 dark:text-zinc-300 hover:bg-white/90 dark:hover:bg-white/10 transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="px-3 sm:px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              {format(currentDate, 'MMMM', { locale: ptBR })}
            </button>
            <button
              type="button"
              onClick={nextPeriod}
              className="p-2 rounded-[0.85rem] text-zinc-600 dark:text-zinc-300 hover:bg-white/90 dark:hover:bg-white/10 transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAppointments}
            disabled={isLoading}
            className="p-2.5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.1] bg-white/60 dark:bg-white/[0.05] backdrop-blur-md text-zinc-600 dark:text-zinc-300 hover:bg-white/90 dark:hover:bg-white/10 transition-all disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => handleNewAppointment()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#007AFF] text-white font-semibold text-[15px] shadow-lg shadow-blue-500/25 hover:opacity-95 active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Novo agendamento</span>
          </button>
        </div>
      </header>
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

    return (
      <div className="grid grid-cols-7 mb-2 border-b border-zinc-200/60 dark:border-white/[0.08] pb-1">{days}</div>
    );
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
              min-h-[120px] p-2 border border-zinc-200/40 dark:border-white/[0.06] relative group transition-colors
              ${
                !isCurrentMonth
                  ? 'bg-zinc-100/40 dark:bg-zinc-950/30 text-zinc-400 dark:text-zinc-500'
                  : 'bg-white/50 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-200 backdrop-blur-[2px]'
              }
              ${isSelected ? 'ring-2 ring-[#007AFF]/45 ring-inset z-10' : ''}
              hover:bg-white/80 dark:hover:bg-white/[0.06] cursor-pointer
            `}
            onClick={() => onDateClick(cloneDay)}
          >
            <div className="flex justify-between items-start mb-2">
              <span
                className={`
                    text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                    ${isTodayDate ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30' : ''}
                `}
              >
                {formattedDate}
              </span>
              {dayAppointments.length > 0 && (
                <span className="text-[10px] bg-zinc-200/90 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-zinc-600 dark:text-zinc-300 font-mono font-semibold">
                  {dayAppointments.length}
                </span>
              )}
            </div>

            <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
              {dayAppointments.map((app) => (
                <div
                  key={app.id}
                  className="text-[10px] bg-white/70 dark:bg-white/[0.06] p-1.5 rounded-lg border-l-2 border-[#007AFF]/70 truncate hover:bg-white dark:hover:bg-white/10 transition-colors shadow-sm"
                  title={`${app.time} - ${app.title}`}
                >
                  <span className="font-bold text-zinc-900 dark:text-zinc-200 mr-1">{app.time}</span>
                  <span className="text-zinc-600 dark:text-zinc-300">{app.title}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNewAppointment(cloneDay);
              }}
              className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-[#007AFF] hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
              aria-label="Novo agendamento neste dia"
            >
              <Plus className="w-3.5 h-3.5" />
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
    return (
      <div className={`${iosPageGlass} overflow-hidden relative`}>
        <div className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 bg-gradient-to-br from-sky-400/20 to-indigo-600/10 rounded-full blur-3xl opacity-70" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 w-48 h-48 bg-gradient-to-br from-amber-400/12 to-orange-500/5 rounded-full blur-3xl opacity-50" />
        <div className="relative z-10 rounded-[inherit] overflow-hidden">{rows}</div>
      </div>
    );
  };

  // Render Selected Day Details
  const renderSelectedDayDetails = () => {
    const dayAppointments = appointments
        .filter(app => isSameDay(app.date, selectedDate))
        .sort((a, b) => a.time.localeCompare(b.time));

    return (
        <div className="mt-8">
            <div className={`${iosPageGlass} p-6 sm:p-8 relative overflow-hidden`}>
                <div className="pointer-events-none absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-indigo-400/10 to-transparent rounded-full blur-2xl" />
                <div className="relative z-10">
                <div className="flex items-center justify-between mb-6 gap-3">
                    <h3 className="text-[17px] sm:text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-indigo-500/20">
                          <CalendarDays className="w-5 h-5 text-white" strokeWidth={2} />
                        </span>
                        Agendamentos do dia
                    </h3>
                    <span className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium tabular-nums px-3 py-1 rounded-full bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08]">
                        {dayAppointments.length} {dayAppointments.length === 1 ? 'compromisso' : 'compromissos'}
                    </span>
                </div>

                {dayAppointments.length > 0 ? (
                    <div className="space-y-4">
                        {dayAppointments.map(app => (
                            <div 
                                key={app.id} 
                                onClick={() => handleEditClick(app)}
                                className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-md border border-zinc-200/70 dark:border-white/[0.08] rounded-[22px] p-5 hover:border-[#007AFF]/35 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 cursor-pointer shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)]"
                            >
                                <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-1 min-w-[80px]">
                                    <span className="text-xl font-bold text-zinc-900 dark:text-white tabular-nums">{app.time}</span>
                                    <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${app.status === 'completed' ? 'bg-emerald-500' : app.status === 'cancelled' ? 'bg-red-500' : 'bg-[#007AFF]'}`} />
                                </div>
                                
                                <div className="flex-1">
                                    <h4 className="font-black text-zinc-900 dark:text-white text-xl uppercase tracking-tight">
                                        {app.vehicleModel || 'Veículo não informado'}
                                    </h4>
                                    <p className="text-[#007AFF] dark:text-sky-400 font-semibold text-sm mt-0.5">{app.title}</p>
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
                                            <div className="flex items-start gap-2 w-full mt-2 bg-zinc-50/90 dark:bg-white/[0.04] p-3 rounded-2xl border border-zinc-200/50 dark:border-white/[0.06]">
                                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">{app.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-zinc-200/60 dark:border-white/[0.08]">
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleChegouAoPatio(app); }}
                                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-amber-400 text-zinc-950 hover:bg-amber-300 transition-all flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wide shadow-md shadow-amber-500/20 active:scale-[0.98]"
                                        title="Chegou ao Pátio"
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                        Chegou ao pátio
                                    </button>
                                    
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); exportToGoogleCalendar(app); }}
                                        className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-[#007AFF]/15 hover:text-[#007AFF] transition-colors"
                                        title="Exportar para Google Agenda"
                                    >
                                        <ExternalLink className="w-5 h-5" />
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleEditClick(app); }}
                                        className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-white/15 transition-colors"
                                        title="Editar agendamento"
                                    >
                                        <Edit2 className="w-5 h-5" />
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAppointment(app.id);
                                        }}
                                        className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-14 border border-dashed border-zinc-300/80 dark:border-white/[0.1] rounded-[22px] bg-zinc-50/50 dark:bg-white/[0.02]">
                        <Clock className="w-12 h-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-3 opacity-80" />
                        <p className="text-zinc-500 dark:text-zinc-400 text-[15px]">Nenhum agendamento neste dia.</p>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="min-h-[min(100dvh,100%)] w-full bg-gradient-to-b from-zinc-100/95 via-white/85 to-zinc-100/70 dark:from-zinc-950 dark:via-zinc-950/98 dark:to-zinc-900/90">
    <div className="w-full max-w-6xl mx-auto pb-24 md:pb-28 pt-3 md:pt-8 px-4 md:px-6 animate-in fade-in duration-500">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 animate-modal-backdrop">
            <div className={`${iosModalShell} w-full max-w-md max-h-[90vh] animate-modal-sheet`}>
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
                      notes: '',
                    });
                  }}
                  className={iosModalClose}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
                  <IosModalHeader
                    icon={<CalendarIcon className="w-6 h-6 text-white" strokeWidth={2.2} />}
                    title={isEditing ? 'Editar agendamento' : 'Novo agendamento'}
                    subtitle="Serviço, cliente, veículo e horário"
                    gradientClass="from-sky-500 to-indigo-600"
                  />
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <form onSubmit={handleAddAppointment} className="p-6 sm:px-8 space-y-4 pb-8">
                        <div>
                            <label className={iosLabel}>Título do serviço</label>
                            <input 
                                type="text" 
                                placeholder="Ex.: Revisão geral"
                                autoComplete="off"
                                className={iosInput}
                                value={newAppointment.title}
                                onChange={e => setNewAppointment({...newAppointment, title: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={iosLabel}>Data</label>
                                <input 
                                    type="date" 
                                    className={iosInput}
                                    value={(() => {
                                      const d = newAppointment.date;
                                      if (!d) return format(selectedDate, 'yyyy-MM-dd');
                                      const date = d instanceof Date ? d : new Date(d);
                                      return isNaN(date.getTime()) ? format(selectedDate, 'yyyy-MM-dd') : format(date, 'yyyy-MM-dd');
                                    })()}
                                    onChange={e => setNewAppointment({...newAppointment, date: parseISO(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className={iosLabel}>Horário</label>
                                <input 
                                    type="time" 
                                    className={iosInput}
                                    value={newAppointment.time}
                                    onChange={e => setNewAppointment({...newAppointment, time: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={iosLabel}>Cliente</label>
                            <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                                <input 
                                    type="text" 
                                    placeholder="Nome do cliente"
                                    autoComplete="off"
                                    className={`${iosInput} pl-10`}
                                    value={newAppointment.customerName}
                                    onChange={e => setNewAppointment({...newAppointment, customerName: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={iosLabel}>Telefone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                                    <input 
                                        type="tel" 
                                        placeholder="(00) 00000-0000"
                                        autoComplete="off"
                                        className={`${iosInput} pl-10`}
                                        value={newAppointment.phone || ''}
                                        onChange={e => setNewAppointment({...newAppointment, phone: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={iosLabel}>E-mail</label>
                                <div className="relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                                    <input 
                                        type="email" 
                                        placeholder="email@exemplo.com"
                                        autoComplete="off"
                                        className={`${iosInput} pl-10`}
                                        value={newAppointment.email || ''}
                                        onChange={e => setNewAppointment({...newAppointment, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className={iosLabel}>Veículo</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        placeholder="Modelo"
                                        autoComplete="off"
                                        className={`${iosInput} pl-10`}
                                        value={newAppointment.vehicleModel}
                                        onChange={e => setNewAppointment({...newAppointment, vehicleModel: e.target.value})}
                                    />
                                </div>
                                <div className="relative">
                                    <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        placeholder="Placa"
                                        autoComplete="off"
                                        className={`${iosInput} pl-10 uppercase`}
                                        value={newAppointment.plate ? newAppointment.plate.toUpperCase() : ''}
                                        onChange={e => setNewAppointment({...newAppointment, plate: e.target.value.toUpperCase()})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className={iosLabel}>Observações</label>
                            <textarea 
                                placeholder="Detalhes adicionais..."
                                className={`${iosInput} min-h-[88px] resize-y py-3`}
                                value={newAppointment.notes}
                                onChange={e => setNewAppointment({...newAppointment, notes: e.target.value})}
                            />
                        </div>

                        <div className="pt-2 flex justify-end gap-3 border-t border-zinc-200/50 dark:border-white/[0.06] mt-2">
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
                                className="px-5 py-3 rounded-2xl text-[15px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className={`${iosPrimaryButton} px-8`}
                            >
                                {isEditing ? 'Salvar alterações' : 'Agendar'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
    </div>
  );
};
