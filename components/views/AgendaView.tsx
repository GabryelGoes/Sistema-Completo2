import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Car,
  AlertCircle,
  X,
  RefreshCw,
  ArrowRight,
  FileText,
  Edit2,
  ExternalLink,
  Trash2,
  Phone,
  Mail,
  Sparkles,
  BookUser,
  PenLine,
  Search,
  Loader2,
} from 'lucide-react';
import {
  agendaModalInsetCard,
  agendaModalInput,
  agendaModalShell,
  iosModalClose,
  iosLabel,
  iosPageGlass,
  iosModalInsetCard,
  resolveIosModalOverlayClass,
} from '../ui/iosModalStyles';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { IosModalHeader } from '../ui/IosModalHeader';
import { Customer, Appointment } from '../../types';
import {
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getCustomers,
  getServiceOrders,
  type ApiCustomer,
  type ServiceOrderListItem,
} from '../../services/apiService';
import { useRegisterModalOpen } from '../ui/ModalLayerContext';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import {
  formatAgendaPeriodLabel,
  navigatePeriod,
  readStoredAgendaView,
  storeAgendaView,
  type AgendaViewMode,
} from '../../utils/agendaViews';
import {
  AgendaDesktopMonthGrid,
  AgendaMiniMonth,
  AgendaScheduleList,
  AgendaSidebarDayList,
  AgendaTimeGrid,
  AgendaViewSwitcher,
} from './agenda/AgendaDesktopViews';

interface AgendaViewProps {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  blurPlates?: boolean;
  /** Com KeepAlive: pausa refresh do modal de detalhe fora desta aba. */
  isAgendaTabActive?: boolean;
  /** Abre a aba Recepção em tela cheia com os dados do agendamento (fluxo “Chegou ao pátio”). */
  onChegouAoPatioNavigateToReception?: (customer: Customer, appointmentId: string) => void;
  /** Após gesto voltar da Recepção: reabrir o modal de detalhe deste agendamento (uma vez). */
  pendingDetailAppointmentId?: string | null;
  onPendingDetailAppointmentConsumed?: () => void;
}

const OTHER_VEHICLE_KEY = '__other__';

type AgendaRegisteredVehicle = {
  key: string;
  customerId: string;
  displayModel: string;
  plate: string;
};

function formatVehicleLabelFromOrder(o: ServiceOrderListItem): string {
  const brand = (o.vehicle_brand ?? '').toString().trim();
  const model = (o.vehicle_model ?? '').toString().trim();
  const parts = [brand, model].filter(Boolean);
  return parts.length ? parts.join(' ') : model || 'Veículo';
}

/** Veículos distintos por cliente a partir das OS (tipo veículo). */
function vehiclesByCustomerFromOrders(orders: ServiceOrderListItem[]): Map<string, AgendaRegisteredVehicle[]> {
  const map = new Map<string, AgendaRegisteredVehicle[]>();
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.order_type === 'module') continue;
    const cid = o.customer_id;
    if (!cid) continue;
    const plate = (o.plate ?? '').toString().trim().toUpperCase();
    const displayModel = formatVehicleLabelFromOrder(o);
    const dk = `${cid}::${plate}::${displayModel}`;
    if (seen.has(dk)) continue;
    seen.add(dk);
    const row: AgendaRegisteredVehicle = { key: dk, customerId: cid, displayModel, plate };
    const arr = map.get(cid) ?? [];
    arr.push(row);
    map.set(cid, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.plate.localeCompare(b.plate) || a.displayModel.localeCompare(b.displayModel));
  }
  return map;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  appointments,
  setAppointments,
  blurPlates = false,
  isAgendaTabActive = true,
  onChegouAoPatioNavigateToReception,
  pendingDetailAppointmentId = null,
  onPendingDetailAppointmentConsumed,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<AgendaViewMode>(() => readStoredAgendaView());
  const desktopShell = useDesktopShellLayout();
  const [isModalOpen, setIsModalOpen] = useState(false);
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
  /** Modal somente leitura ao tocar no veículo no calendário (ou na lista do dia). */
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);

  const [agendaPickerMode, setAgendaPickerMode] = useState<'registered' | 'manual'>('registered');
  const [pickerCustomers, setPickerCustomers] = useState<ApiCustomer[]>([]);
  const [pickerOrders, setPickerOrders] = useState<ServiceOrderListItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [registeredCustomerId, setRegisteredCustomerId] = useState('');
  const [registeredVehicleKey, setRegisteredVehicleKey] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  useRegisterModalOpen(!!detailAppointment || isModalOpen);

  useEffect(() => {
    if (!pendingDetailAppointmentId || !onPendingDetailAppointmentConsumed) return;
    const app = appointments.find((a) => a.id === pendingDetailAppointmentId);
    if (app) setDetailAppointment(app);
    onPendingDetailAppointmentConsumed();
  }, [pendingDetailAppointmentId, appointments, onPendingDetailAppointmentConsumed]);

  const vehiclesByCustomer = useMemo(() => vehiclesByCustomerFromOrders(pickerOrders), [pickerOrders]);

  const filteredPickerCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const list = [...pickerCustomers].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    if (!q) return list;
    const digits = q.replace(/\D/g, '');
    return list.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if ((c.email ?? '').toLowerCase().includes(q)) return true;
      if (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
      return false;
    });
  }, [pickerCustomers, customerSearch]);

  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    setPickerLoading(true);
    void (async () => {
      try {
        const [cust, orders] = await Promise.all([getCustomers(), getServiceOrders(undefined, 'vehicle')]);
        if (cancelled) return;
        setPickerCustomers(cust);
        setPickerOrders(orders);
      } catch {
        if (!cancelled) {
          setPickerCustomers([]);
          setPickerOrders([]);
          setAgendaPickerMode('manual');
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const resetAgendaPicker = useCallback(() => {
    setAgendaPickerMode('registered');
    setRegisteredCustomerId('');
    setRegisteredVehicleKey('');
    setCustomerSearch('');
  }, []);

  const applyRegisteredCustomer = useCallback(
    (customer: ApiCustomer) => {
      setRegisteredCustomerId(customer.id);
      const vehs = vehiclesByCustomer.get(customer.id) ?? [];
      if (vehs.length > 0) {
        const v = vehs[0];
        setRegisteredVehicleKey(v.key);
        setNewAppointment((prev) => ({
          ...prev,
          customerName: customer.name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          vehicleModel: v.displayModel,
          plate: v.plate,
        }));
      } else {
        setRegisteredVehicleKey(OTHER_VEHICLE_KEY);
        setNewAppointment((prev) => ({
          ...prev,
          customerName: customer.name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          vehicleModel: '',
          plate: '',
        }));
      }
    },
    [vehiclesByCustomer]
  );

  const applyRegisteredVehicle = useCallback((customer: ApiCustomer, v: AgendaRegisteredVehicle | 'other') => {
    if (v === 'other') {
      setRegisteredVehicleKey(OTHER_VEHICLE_KEY);
      setNewAppointment((prev) => ({
        ...prev,
        customerName: customer.name,
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        vehicleModel: '',
        plate: '',
      }));
      return;
    }
    setRegisteredVehicleKey(v.key);
    setNewAppointment((prev) => ({
      ...prev,
      customerName: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      vehicleModel: v.displayModel,
      plate: v.plate,
    }));
  }, []);

  const selectedPickerCustomer = useMemo(
    () => pickerCustomers.find((c) => c.id === registeredCustomerId) ?? null,
    [pickerCustomers, registeredCustomerId]
  );

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
    setDetailAppointment(null);
    const date = app.date instanceof Date ? app.date : (app.date ? new Date(app.date) : new Date());
    setNewAppointment({ ...app, date });
    setIsEditing(true);
    setAgendaPickerMode('manual');
    setRegisteredCustomerId('');
    setRegisteredVehicleKey('');
    setCustomerSearch('');
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

  /** Atualiza a lista sem overlay de carregamento (ex.: modal de detalhe aberto). */
  const refreshAppointmentsSilent = useCallback(async () => {
    try {
      const list = await getAppointments();
      setAppointments(list);
      return list;
    } catch (err) {
      console.error("Falha ao atualizar agendamentos", err);
      return null;
    }
  }, [setAppointments]);

  useEffect(() => {
    fetchAppointments();
  }, []);

  useEffect(() => {
    if (!detailAppointment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDetailAppointment(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailAppointment]);

  /** Mantém o modal de detalhe alinhado aos dados da API enquanto estiver aberto (≥60s). */
  useEffect(() => {
    if (!detailAppointment || !isAgendaTabActive) return;
    const detailId = detailAppointment.id;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const list = await refreshAppointmentsSilent();
      if (!list) return;
      setDetailAppointment((prev) => {
        if (!prev || prev.id !== detailId) return prev;
        const found = list.find((a) => a.id === detailId);
        return found ?? null;
      });
    };
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [detailAppointment?.id, refreshAppointmentsSilent, isAgendaTabActive]);

  // Load appointments from localStorage on mount (Removed as it's now in App.tsx)
  // Save appointments to localStorage whenever they change (Removed as it's now in App.tsx)

  const nextPeriod = () => {
    setCurrentDate((d) => navigatePeriod(viewMode, d, 1));
  };

  const prevPeriod = () => {
    setCurrentDate((d) => navigatePeriod(viewMode, d, -1));
  };

  const handleViewModeChange = (mode: AgendaViewMode) => {
    setViewMode(mode);
    storeAgendaView(mode);
    if (mode === 'day') {
      setCurrentDate(selectedDate);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const onDateClick = (day: Date) => {
    setSelectedDate(day);
    if (desktopShell && viewMode === 'month') {
      setCurrentDate(day);
    }
    if (desktopShell && viewMode === 'day') {
      setCurrentDate(day);
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    const date = newAppointment.date || selectedDate;
    const time = newAppointment.time || '09:00';

    if (!isEditing && agendaPickerMode === 'registered') {
      if (!registeredCustomerId) {
        alert('Selecione um cliente na lista.');
        return;
      }
      const vm = (newAppointment.vehicleModel || '').trim();
      if (!vm) {
        alert('Escolha um veículo já atendido na oficina ou toque em «Outro veículo» e informe o modelo.');
        return;
      }
    }

    setIsLoading(true);
    try {
      const resolvedCustomerName =
        !isEditing && agendaPickerMode === 'registered' && selectedPickerCustomer
          ? selectedPickerCustomer.name
          : newAppointment.customerName || 'Cliente não informado';

      if (isEditing && newAppointment.id) {
        await updateAppointment(newAppointment.id, {
          title: newAppointment.title || 'Sem título',
          customerName: resolvedCustomerName,
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
          customerName: resolvedCustomerName,
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
    resetAgendaPicker();
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
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) return;
    try {
      await deleteAppointment(id);
      setDetailAppointment((d) => (d?.id === id ? null : d));
      await fetchAppointments();
    } catch (err) {
      console.error("Erro ao excluir agendamento", err);
      alert(err instanceof Error ? err.message : "Erro ao excluir agendamento.");
    }
  };

  const handleChegouAoPatio = (app: Appointment) => {
    if (!onChegouAoPatioNavigateToReception) return;
    const customerData: Customer = {
      name: app.customerName ?? '',
      phone: app.phone ?? '',
      email: app.email ?? '',
      cpf: '',
      cep: '',
      address: '',
      addressNumber: '',
      vehicleModel: app.vehicleModel ?? '',
      vehicleBrand: '',
      plate: app.plate ?? '',
      vehicleColor: '',
      vehicleYear: '',
      vehicleEngineInfo: '',
      mileageKm: '',
      issueDescription: [app.title, app.notes].filter(Boolean).join('\n') || 'Agendamento',
      trelloCardId: app.trelloCardId,
    };
    setDetailAppointment(null);
    onChegouAoPatioNavigateToReception?.(customerData, app.id);
  };

  const handleNewAppointment = (date?: Date) => {
    resetAgendaPicker();
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
      notes: '',
    });
    setIsModalOpen(true);
  };

  // Render Calendar Header
  const renderHeader = () => {
    return (
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6 lg:mb-8">
        <div className="app-view-page-chrome flex items-center gap-3 sm:gap-4 min-w-0 ml-[8%]">
          <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
            <img src="/icons/agenda-ios.png" alt="" className="h-full w-full object-cover" />
          </IosAccentIconSquircle>
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Agenda
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-red-500 shrink-0" strokeWidth={2} />
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
            className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-[0.98] transition-all"
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
              ${isSelected ? 'ring-2 ring-red-500/45 ring-inset z-10' : ''}
              hover:bg-white/80 dark:hover:bg-white/[0.06] cursor-pointer
            `}
            onClick={() => onDateClick(cloneDay)}
          >
            <div className="flex justify-between items-start mb-2">
              <span
                className={`
                    text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                    ${isTodayDate ? 'bg-red-500 text-white shadow-md shadow-red-500/35' : ''}
                `}
              >
                {formattedDate}
              </span>
              {dayAppointments.length > 0 && (
                <span className="text-[10px] bg-zinc-300/95 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-zinc-800 dark:text-zinc-300 font-mono font-semibold">
                  {dayAppointments.length}
                </span>
              )}
            </div>

            <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
              {dayAppointments.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailAppointment(app);
                  }}
                  className="w-full text-left text-[10px] bg-zinc-200/90 dark:bg-white/[0.06] p-1.5 rounded-lg border-l-2 border-red-500/80 truncate hover:bg-zinc-300/85 dark:hover:bg-white/10 transition-colors shadow-sm cursor-pointer"
                  title={`${app.time} — ${app.vehicleModel || app.title}`}
                >
                  <span className="font-bold text-zinc-950 dark:text-zinc-200 mr-1">{app.time}</span>
                  <span className="text-zinc-800 dark:text-zinc-300">{app.title}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNewAppointment(cloneDay);
              }}
              className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 hover:bg-red-500 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
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
        <div className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 bg-gradient-to-br from-red-500/20 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 w-48 h-48 bg-gradient-to-br from-red-500/15 to-transparent rounded-full blur-3xl opacity-50" />
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
                <div className="pointer-events-none absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-red-500/15 to-transparent rounded-full blur-2xl" />
                <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div className="min-w-0">
                      <h3 className="text-[17px] sm:text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2.5">
                        <span className="shrink-0">
                          <IosAccentIconSquircle variant="row" strokeWidth={2}>
                            <img src="/icons/agenda-ios.png" alt="" className="h-full w-full object-cover" />
                          </IosAccentIconSquircle>
                        </span>
                        <span className="leading-tight">
                          Agendamentos do dia
                          <span className="block text-[13px] font-normal text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-red-500 shrink-0" strokeWidth={2} />
                            Veículos agendados para esta data
                          </span>
                        </span>
                      </h3>
                    </div>
                    <span className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium tabular-nums px-3 py-1.5 rounded-full bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] self-start sm:self-center shrink-0">
                        {dayAppointments.length} {dayAppointments.length === 1 ? 'veículo' : 'veículos'}
                    </span>
                </div>

                {dayAppointments.length > 0 ? (
                    <div className="space-y-3 sm:space-y-4">
                        {dayAppointments.map((app) => {
                          const statusDone = app.status === 'completed';
                          const statusCancelled = app.status === 'cancelled';
                          const statusLabel = statusDone ? 'Concluído' : statusCancelled ? 'Cancelado' : 'Agendado';
                          return (
                            <div
                              key={app.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setDetailAppointment(app)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setDetailAppointment(app);
                                }
                              }}
                              className={`group ${iosModalInsetCard} overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] active:scale-[0.995] border-zinc-200/80 dark:border-white/[0.1]`}
                            >
                              <div className="p-4 sm:p-5">
                                <div className="flex gap-2 sm:gap-4">
                                  <div className="flex flex-col items-center gap-2 shrink-0">
                                    <div className="rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-50/90 dark:from-white/[0.09] dark:to-white/[0.04] border border-zinc-200/70 dark:border-white/[0.1] px-3 py-2 min-w-[4.75rem] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-none">
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400 block leading-none mb-1">
                                        Horário
                                      </span>
                                      <span className="text-lg font-semibold text-zinc-900 dark:text-white tabular-nums tracking-tight">
                                        {app.time}
                                      </span>
                                    </div>
                                    <span
                                      className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
                                      title={statusLabel}
                                    >
                                      <span
                                        className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${
                                          statusDone ? 'bg-emerald-500' : statusCancelled ? 'bg-rose-700' : 'bg-red-500'
                                        }`}
                                      />
                                      {statusLabel}
                                    </span>
                                  </div>

                                  <div className="flex-1 min-w-0 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-0.5">
                                          Veículo
                                        </p>
                                        <h4 className="font-vehicle text-[17px] sm:text-[19px] font-semibold text-zinc-900 dark:text-white tracking-tight leading-snug">
                                          {app.vehicleModel || 'Veículo não informado'}
                                        </h4>
                                        <p className="text-[15px] font-medium text-red-500 mt-0.5 truncate">
                                          {app.title}
                                        </p>
                                      </div>
                                      <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-red-500 shrink-0 mt-0.5 transition-colors" aria-hidden />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100/90 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] px-3 py-1.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-200 max-w-full">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200/80 dark:bg-white/10 shrink-0">
                                          <User className="w-3.5 h-3.5 text-zinc-600" />
                                        </span>
                                        <span className="truncate">{app.customerName}</span>
                                      </span>
                                      {app.plate ? (
                                        <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100/90 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 font-mono uppercase max-w-full">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200/80 dark:bg-white/10 shrink-0">
                                            <Car className="w-3.5 h-3.5 text-zinc-600" />
                                          </span>
                                          <span className={`truncate ${blurPlates ? 'blur-plate' : ''}`}>
                                            {app.plate.toUpperCase()}
                                          </span>
                                        </span>
                                      ) : null}
                                    </div>

                                    {app.notes ? (
                                      <div className={`${iosModalInsetCard} p-3 sm:p-3.5`}>
                                        <div className="flex items-start gap-2.5">
                                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                                            <AlertCircle className="w-4 h-4 text-red-500" />
                                          </span>
                                          <p className="text-[13px] sm:text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                                            {app.notes}
                                          </p>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-black/20 px-3 py-3 sm:px-4 sm:py-3.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleChegouAoPatio(app);
                                  }}
                                  className="flex-1 min-w-[140px] sm:flex-initial rounded-2xl bg-red-500 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                  title="Chegou ao Pátio"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                  Chegou ao pátio
                                </button>

                                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      exportToGoogleCalendar(app);
                                    }}
                                    className="p-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/10 text-zinc-600 hover:bg-red-500/15 hover:text-red-500 transition-colors"
                                    title="Exportar para Google Agenda"
                                  >
                                    <ExternalLink className="w-5 h-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditClick(app);
                                    }}
                                    className="p-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/10 text-zinc-600 hover:bg-zinc-200/80 dark:hover:bg-white/15 transition-colors"
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
                                    className="p-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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

  const modalOverlayClass = resolveIosModalOverlayClass(desktopShell);

  const renderDesktopShell = () => (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 px-4 py-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="rounded-lg border border-zinc-200/90 bg-white px-3 py-1.5 text-[13px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Hoje
          </button>
          <div className="flex items-center rounded-lg border border-zinc-200/90 bg-white dark:border-white/[0.1] dark:bg-zinc-900">
            <button
              type="button"
              onClick={prevPeriod}
              className="rounded-l-lg p-2 text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              aria-label="Período anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={nextPeriod}
              className="rounded-r-lg p-2 text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              aria-label="Próximo período"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <h2 className="min-w-0 truncate text-[15px] font-bold capitalize text-zinc-900 dark:text-white sm:text-[17px]">
            {formatAgendaPeriodLabel(viewMode, currentDate)}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgendaViewSwitcher mode={viewMode} onModeChange={handleViewModeChange} />
          <button
            type="button"
            onClick={fetchAppointments}
            disabled={isLoading}
            className="rounded-lg border border-zinc-200/90 bg-white p-2 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-300"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => handleNewAppointment()}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-red-600"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-[480px] flex-col">
          {viewMode === 'month' ? (
            <AgendaDesktopMonthGrid
              currentDate={currentDate}
              selectedDate={selectedDate}
              appointments={appointments}
              onSelectDay={onDateClick}
              onNewAppointment={handleNewAppointment}
              onSelectAppointment={setDetailAppointment}
            />
          ) : null}
          {viewMode === 'week' || viewMode === 'day' ? (
            <AgendaTimeGrid
              mode={viewMode === 'day' ? 'day' : 'week'}
              anchorDate={currentDate}
              appointments={appointments}
              selectedDate={selectedDate}
              onSelectDay={onDateClick}
              onSelectAppointment={setDetailAppointment}
            />
          ) : null}
          {viewMode === 'schedule' ? (
            <AgendaScheduleList
              anchorDate={currentDate}
              appointments={appointments}
              onSelectAppointment={setDetailAppointment}
            />
          ) : null}
        </div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <AgendaMiniMonth
            currentDate={currentDate}
            selectedDate={selectedDate}
            appointments={appointments}
            onSelectDay={(day) => {
              onDateClick(day);
              if (viewMode === 'week') setCurrentDate(day);
            }}
            onMonthChange={setCurrentDate}
          />
          <AgendaSidebarDayList
            selectedDate={selectedDate}
            appointments={appointments}
            onSelectAppointment={setDetailAppointment}
            onNewAppointment={() => handleNewAppointment(selectedDate)}
          />
        </aside>
      </div>
    </div>
  );

  return (
    <div className="min-h-full w-full relative overflow-x-hidden">
      {!desktopShell ? (
        <>
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-200/90 via-zinc-100 to-zinc-200/85 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-35 dark:opacity-25 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(239,68,68,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(248,113,113,0.12),transparent),radial-gradient(ellipse_50%_35%_at_0%_100%,rgba(244,63,94,0.1),transparent)]" />
      <div className="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[2px]" />
    <div className="relative z-0 w-full max-w-none mx-auto pb-24 md:pb-28 pt-3 md:pt-6 px-3 sm:px-4 md:px-6 animate-in fade-in duration-500">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
      {renderSelectedDayDetails()}
    </div>
        </>
      ) : (
        renderDesktopShell()
      )}

      {/* Modal detalhe do agendamento (calendário ou lista do dia) */}
      {detailAppointment && (
        <div
          className={modalOverlayClass}
          onClick={() => setDetailAppointment(null)}
        >
          <div
            className={`${agendaModalShell} w-full max-w-lg md:max-w-3xl xl:max-w-4xl max-h-[92vh] overflow-y-auto`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDetailAppointment(null)}
              className={iosModalClose}
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
              <IosModalHeader
                icon={<img src="/icons/agenda-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
                title="Veículo agendado"
                subtitle={(() => {
                  const d =
                    detailAppointment.date instanceof Date
                      ? detailAppointment.date
                      : new Date(detailAppointment.date);
                  return `${format(d, "EEEE, d 'de' MMMM yyyy", { locale: ptBR })} · ${detailAppointment.time}`;
                })()}
                gradientClass="from-red-500 to-zinc-900"
              />
            </div>
            <div className="px-6 sm:px-8 pb-8 space-y-5">
              {(() => {
                const app = detailAppointment;
                const statusDone = app.status === 'completed';
                const statusCancelled = app.status === 'cancelled';
                const statusLabel = statusDone ? 'Concluído' : statusCancelled ? 'Cancelado' : 'Agendado';
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                          statusDone
                            ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                            :                           statusCancelled
                              ? 'border-red-500/40 text-red-700 dark:text-red-400'
                              : 'border-red-500/40 text-red-500'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            statusDone ? 'bg-emerald-500' : statusCancelled ? 'bg-rose-700' : 'bg-red-500'
                          }`}
                        />
                        {statusLabel}
                      </span>
                    </div>

                    <div className={`${agendaModalInsetCard} p-4 sm:p-5 space-y-4`}>
                      <div>
                        <p className={iosLabel}>Serviço</p>
                        <p id="agenda-detail-title" className="text-[17px] font-semibold text-zinc-900 dark:text-white">
                          {app.title || 'Sem título'}
                        </p>
                      </div>
                      <div>
                        <p className={iosLabel}>Veículo</p>
                        <p className="font-vehicle text-[16px] font-medium text-zinc-800 dark:text-zinc-100">
                          {app.vehicleModel || '—'}
                        </p>
                        {app.plate ? (
                          <p className={`text-[15px] font-mono font-semibold text-zinc-700 dark:text-zinc-200 mt-1 ${blurPlates ? 'blur-plate' : ''}`}>
                            {app.plate.toUpperCase()}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className={iosLabel}>Cliente</p>
                        <p className="text-[15px] text-zinc-800 dark:text-zinc-100">{app.customerName}</p>
                        {app.phone ? (
                          <a href={`tel:${app.phone}`} className="text-[14px] text-red-500 hover:underline mt-1 block">
                            {app.phone}
                          </a>
                        ) : null}
                        {app.email ? (
                          <a href={`mailto:${app.email}`} className="text-[14px] text-red-500 hover:underline mt-0.5 block break-all">
                            {app.email}
                          </a>
                        ) : null}
                      </div>
                      {app.notes ? (
                        <div>
                          <p className={iosLabel}>Observações</p>
                          <p className="text-[14px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                            {app.notes}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleChegouAoPatio(app);
                          setDetailAppointment(null);
                        }}
                        className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-white shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-[0.98] transition-all"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Chegou ao pátio
                      </button>
                      <div className="flex flex-wrap gap-2 sm:ml-auto">
                        <button
                          type="button"
                          onClick={() => exportToGoogleCalendar(app)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200/80 dark:border-white/[0.12] px-4 py-3 text-[14px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/10"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Google Agenda
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditClick(app)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-[14px] font-semibold text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAppointment(app.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 text-[14px] font-medium hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Agendamento */}
      {isModalOpen && (
        <div className={`${modalOverlayClass} animate-modal-backdrop`}>
            <div className={`${agendaModalShell} w-full max-w-md md:max-w-3xl xl:max-w-4xl max-h-[90vh] animate-modal-sheet`}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditing(false);
                    resetAgendaPicker();
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
                    icon={<img src="/icons/agenda-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
                    title={isEditing ? 'Editar agendamento' : 'Novo agendamento'}
                    subtitle="Cliente cadastrado ou manual, veículo e horário"
                    gradientClass="from-red-500 to-zinc-900"
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
                                className={agendaModalInput}
                                value={newAppointment.title}
                                onChange={e => setNewAppointment({...newAppointment, title: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={iosLabel}>Data</label>
                                <input 
                                    type="date" 
                                    className={agendaModalInput}
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
                                    className={agendaModalInput}
                                    value={newAppointment.time}
                                    onChange={e => setNewAppointment({...newAppointment, time: e.target.value})}
                                />
                            </div>
                        </div>

                        {!isEditing ? (
                          <div className="flex rounded-2xl border border-zinc-200/80 bg-zinc-100 p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-zinc-900/40 dark:shadow-none">
                            <button
                              type="button"
                              onClick={() => setAgendaPickerMode('registered')}
                              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-colors ${
                                agendaPickerMode === 'registered'
                                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              <BookUser className="h-4 w-4 shrink-0" />
                              Cliente cadastrado
                            </button>
                            <button
                              type="button"
                              onClick={() => setAgendaPickerMode('manual')}
                              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-colors ${
                                agendaPickerMode === 'manual'
                                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              <PenLine className="h-4 w-4 shrink-0" />
                              Digitar manual
                            </button>
                          </div>
                        ) : null}

                        {!isEditing && agendaPickerMode === 'registered' ? (
                          <div className="space-y-4">
                            {pickerLoading ? (
                              <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500 dark:text-zinc-400">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Carregando clientes…
                              </div>
                            ) : pickerCustomers.length === 0 ? (
                              <p className="rounded-2xl border border-dashed border-zinc-300/80 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/[0.12] dark:text-zinc-400">
                                Nenhum cliente cadastrado. Use «Digitar manual» ou cadastre o cliente na Recepção.
                              </p>
                            ) : (
                              <>
                                <div>
                                  <label className={iosLabel}>Buscar cliente</label>
                                  <div className="relative">
                                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                    <input
                                      type="search"
                                      className={`${agendaModalInput} pl-10`}
                                      placeholder="Nome, telefone ou e-mail"
                                      value={customerSearch}
                                      onChange={(e) => setCustomerSearch(e.target.value)}
                                      autoComplete="off"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className={iosLabel}>Cliente</label>
                                  <div className={`${agendaModalInsetCard} max-h-52 overflow-y-auto p-1.5`}>
                                    {filteredPickerCustomers.length === 0 ? (
                                      <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                        Nenhum resultado.
                                      </p>
                                    ) : (
                                      filteredPickerCustomers.map((c) => (
                                        <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => applyRegisteredCustomer(c)}
                                          className={`flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors ${
                                            registeredCustomerId === c.id
                                              ? 'bg-red-500/12 font-semibold text-red-800 dark:text-red-200'
                                              : 'text-zinc-900 hover:bg-zinc-100/80 dark:text-white dark:hover:bg-white/[0.06]'
                                          }`}
                                        >
                                          <span>{c.name}</span>
                                          {c.phone ? (
                                            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                              {c.phone}
                                            </span>
                                          ) : null}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                                {registeredCustomerId && selectedPickerCustomer ? (
                                  <div className="space-y-4">
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                      <div>
                                        <p className={iosLabel}>Cliente selecionado</p>
                                        <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                                          {selectedPickerCustomer.name}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        className="shrink-0 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                                        onClick={() => {
                                          setRegisteredCustomerId('');
                                          setRegisteredVehicleKey('');
                                          setNewAppointment((prev) => ({
                                            ...prev,
                                            customerName: '',
                                            phone: '',
                                            email: '',
                                            vehicleModel: '',
                                            plate: '',
                                          }));
                                        }}
                                      >
                                        Trocar cliente
                                      </button>
                                    </div>
                                    <div>
                                      <label className={iosLabel}>Veículo</label>
                                      <p className="mb-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                                        Escolha um carro já atendido na oficina ou outro veículo deste mesmo cliente.
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {(vehiclesByCustomer.get(registeredCustomerId) ?? []).map((v) => (
                                          <button
                                            key={v.key}
                                            type="button"
                                            onClick={() => applyRegisteredVehicle(selectedPickerCustomer, v)}
                                            className={`max-w-[200px] rounded-2xl border px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                                              registeredVehicleKey === v.key
                                                ? 'border-red-500/50 bg-red-500/10 text-zinc-900 dark:text-white'
                                                : 'border-zinc-200/80 bg-white/70 hover:border-red-300/60 dark:border-white/[0.08] dark:bg-zinc-900/50'
                                            }`}
                                          >
                                            <span className="font-mono text-[11px] font-semibold uppercase text-red-600 dark:text-red-400">
                                              {v.plate || '—'}
                                            </span>
                                            <span className="mt-0.5 block font-vehicle text-[13px] leading-snug text-zinc-800 dark:text-zinc-100">
                                              {v.displayModel}
                                            </span>
                                          </button>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => applyRegisteredVehicle(selectedPickerCustomer, 'other')}
                                          className={`rounded-2xl border px-3 py-2 text-[12px] font-semibold transition-colors ${
                                            registeredVehicleKey === OTHER_VEHICLE_KEY
                                              ? 'border-red-500/50 bg-red-500/10 text-zinc-900 dark:text-white'
                                              : 'border-dashed border-zinc-300/90 text-zinc-600 hover:border-red-400/50 dark:border-white/[0.15] dark:text-zinc-300'
                                          }`}
                                        >
                                          + Outro veículo
                                        </button>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                      <div>
                                        <label className={iosLabel}>Telefone</label>
                                        <div className="relative">
                                          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                          <input
                                            type="tel"
                                            placeholder="(00) 00000-0000"
                                            autoComplete="off"
                                            className={`${agendaModalInput} pl-10`}
                                            value={newAppointment.phone || ''}
                                            onChange={(e) =>
                                              setNewAppointment({ ...newAppointment, phone: e.target.value })
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className={iosLabel}>E-mail</label>
                                        <div className="relative">
                                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                          <input
                                            type="email"
                                            placeholder="email@exemplo.com"
                                            autoComplete="off"
                                            className={`${agendaModalInput} pl-10`}
                                            value={newAppointment.email || ''}
                                            onChange={(e) =>
                                              setNewAppointment({ ...newAppointment, email: e.target.value })
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    {registeredVehicleKey === OTHER_VEHICLE_KEY ? (
                                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                          <label className={iosLabel}>Modelo do veículo</label>
                                          <div className="relative">
                                            <Car className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                            <input
                                              type="text"
                                              placeholder="Ex.: Civic LXR"
                                              autoComplete="off"
                                              className={`${agendaModalInput} pl-10`}
                                              value={newAppointment.vehicleModel}
                                              onChange={(e) =>
                                                setNewAppointment({
                                                  ...newAppointment,
                                                  vehicleModel: e.target.value,
                                                })
                                              }
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className={iosLabel}>Placa</label>
                                          <div className="relative">
                                            <FileText className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                            <input
                                              type="text"
                                              placeholder="ABC1D23"
                                              autoComplete="off"
                                              className={`${agendaModalInput} pl-10 uppercase`}
                                              value={(newAppointment.plate || '').toUpperCase()}
                                              onChange={(e) =>
                                                setNewAppointment({
                                                  ...newAppointment,
                                                  plate: e.target.value.toUpperCase(),
                                                })
                                              }
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className={iosLabel}>Cliente</label>
                              <div className="relative">
                                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                <input
                                  type="text"
                                  placeholder="Nome do cliente"
                                  autoComplete="off"
                                  className={`${agendaModalInput} pl-10`}
                                  value={newAppointment.customerName}
                                  onChange={(e) =>
                                    setNewAppointment({ ...newAppointment, customerName: e.target.value })
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className={iosLabel}>Telefone</label>
                                <div className="relative">
                                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                  <input
                                    type="tel"
                                    placeholder="(00) 00000-0000"
                                    autoComplete="off"
                                    className={`${agendaModalInput} pl-10`}
                                    value={newAppointment.phone || ''}
                                    onChange={(e) =>
                                      setNewAppointment({ ...newAppointment, phone: e.target.value })
                                    }
                                  />
                                </div>
                              </div>
                              <div>
                                <label className={iosLabel}>E-mail</label>
                                <div className="relative">
                                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                  <input
                                    type="email"
                                    placeholder="email@exemplo.com"
                                    autoComplete="off"
                                    className={`${agendaModalInput} pl-10`}
                                    value={newAppointment.email || ''}
                                    onChange={(e) =>
                                      setNewAppointment({ ...newAppointment, email: e.target.value })
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className={iosLabel}>Veículo</label>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                  <Car className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                  <input
                                    type="text"
                                    placeholder="Modelo"
                                    autoComplete="off"
                                    className={`${agendaModalInput} pl-10`}
                                    value={newAppointment.vehicleModel}
                                    onChange={(e) =>
                                      setNewAppointment({ ...newAppointment, vehicleModel: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="relative">
                                  <FileText className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                  <input
                                    type="text"
                                    placeholder="Placa"
                                    autoComplete="off"
                                    className={`${agendaModalInput} pl-10 uppercase`}
                                    value={newAppointment.plate ? newAppointment.plate.toUpperCase() : ''}
                                    onChange={(e) =>
                                      setNewAppointment({
                                        ...newAppointment,
                                        plate: e.target.value.toUpperCase(),
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <div>
                            <label className={iosLabel}>Observações</label>
                            <textarea 
                                placeholder="Detalhes adicionais..."
                                className={`${agendaModalInput} min-h-[88px] resize-y py-3`}
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
                                    resetAgendaPicker();
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
                                className="rounded-2xl bg-red-500 px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-[0.98] transition-all"
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
  );
};
