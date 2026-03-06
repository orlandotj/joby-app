
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Briefcase, CalendarDays, Clock, MapPin as MapPinIcon, DollarSign, CreditCard, Banknote, WalletCards, AlertCircle, CheckCircle2, Hourglass, Info, Send, UserCheck } from 'lucide-react';
import BookingCalendar from './BookingCalendar';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { normalizePriceUnit } from '@/lib/priceUnit';
import { log } from '@/lib/logger';

const isMissingColumnError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('column') && msg.includes('does not exist');
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const BookingModal = ({ isOpen, setIsOpen, professional }) => {
  const { toast } = useToast();
  const { user: clientUser } = useAuth(); 

  const [step, setStep] = useState(1);
  const [serviceType, setServiceType] = useState('hourly'); 
  const [serviceLocation, setServiceLocation] = useState('');
  const [availableServices, setAvailableServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [estimatedDays, setEstimatedDays] = useState(1);
  const [eventBudget, setEventBudget] = useState('');
  const [emergencyBudget, setEmergencyBudget] = useState('300'); // Novo estado para valor editável da emergência
  const [jobDescription, setJobDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [temporarilyReservedSlot, setTemporarilyReservedSlot] = useState(null); // { date: Date, time: string }
  const [bookingStatus, setBookingStatus] = useState('idle'); // idle, pending_approval, approved, rejected

  const platformFeeRate = 0.10; 
  const professionalHourlyRate = professional?.hourlyRate || 50;
  const professionalDailyRate = professional?.dailyRate || 300;
  // const emergencyFixedRate = 300; // Valor fixo para contratação por emergência removido
  const autoAcceptBookings = professional?.availability?.autoAcceptBookings || false;
  const approvalTimeoutHours = 24; // Professional has 24h to respond

  const selectedService = availableServices.find((s) => String(s.id) === String(selectedServiceId)) || null;

  const getDerivedServiceType = () => {
    if (!selectedService) return serviceType;
    const unit = normalizePriceUnit(selectedService.price_unit);
    if (unit === 'hora') return 'hourly';
    if (unit === 'dia') return 'daily';
    return 'event';
  };

  const calculateTotal = () => {
    let basePrice = 0;

    if (selectedService) {
      const unit = normalizePriceUnit(selectedService.price_unit);
      const price = Number(selectedService.price) || 0;

      if (unit === 'hora') {
        basePrice = price * Math.max(1, Number(estimatedHours) || 1);
      } else if (unit === 'dia') {
        basePrice = price * Math.max(1, Number(estimatedDays) || 1);
      } else {
        basePrice = price;
      }
    } else {
      // Fallback (caso o profissional não tenha serviços carregados)
      if (serviceType === 'hourly') {
        basePrice = professionalHourlyRate * estimatedHours;
      } else if (serviceType === 'daily') {
        basePrice = professionalDailyRate * estimatedDays;
      } else if (serviceType === 'event') {
        basePrice = parseFloat(eventBudget) || 0;
      } else if (serviceType === 'emergency') {
        basePrice = parseFloat(emergencyBudget) || 0;
      }
    }

    const fee = basePrice * platformFeeRate;
    return { basePrice, fee, total: basePrice + fee };
  };

  const { basePrice, fee, total } = calculateTotal();

  useEffect(() => {
    let timer;
    if (isOpen) {
      // Reset state when modal opens
      setStep(1);
      setServiceType('hourly');
      setServiceLocation(clientUser?.location || ''); 
      setAvailableServices([]);
      setSelectedServiceId('');
      setSelectedDate(null);
      setSelectedTime('');
      setEstimatedHours(1);
      setEstimatedDays(1);
      setEventBudget('');
      setEmergencyBudget('300'); // Resetar valor da emergência ao abrir modal
      setJobDescription('');
      setPaymentMethod('');
      setTemporarilyReservedSlot(null);
      setBookingStatus('idle');
    } else {
      // Clear reservation and timeout when modal closes
      setTemporarilyReservedSlot(null);
      if (timer) clearTimeout(timer);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, professional, clientUser]);

  useEffect(() => {
    let cancelled = false;

    const loadServices = async () => {
      if (!isOpen || !professional?.id) return;

      setServicesLoading(true);
      try {
        const { data, error } = await supabase
          .from('services')
          .select('id, title, price, price_unit, is_active')
          .eq('user_id', professional.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const list = data || [];
        setAvailableServices(list);
        if (list.length > 0) {
          setSelectedServiceId(String(list[0].id));
          const unit = normalizePriceUnit(list[0].price_unit);
          setServiceType(unit === 'hora' ? 'hourly' : unit === 'dia' ? 'daily' : 'event');
        }
      } catch (e) {
        if (cancelled) return;
        setAvailableServices([]);
        toast({
          title: 'Não foi possível carregar serviços',
          description: String(e?.message || 'Tente novamente.'),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    };

    loadServices();
    return () => {
      cancelled = true;
    };
  }, [isOpen, professional?.id, toast]);

  useEffect(() => {
    if (!selectedService) return;
    const derived = getDerivedServiceType();
    setServiceType(derived);
  }, [selectedServiceId]);

  // Temporary slot reservation timeout
  useEffect(() => {
    let slotReservationTimer;
    if (temporarilyReservedSlot) {
      slotReservationTimer = setTimeout(() => {
        setTemporarilyReservedSlot(null);
        // Optionally, inform user that their temporary hold expired if they haven't moved to next step
        // toast({ title: "Reserva Expirada", description: "O horário selecionado foi liberado.", variant: "default" });
      }, 3 * 60 * 1000); // 3 minutes hold
    }
    return () => clearTimeout(slotReservationTimer);
  }, [temporarilyReservedSlot]);

  // Professional approval timeout
  useEffect(() => {
    let approvalTimer;
    if (bookingStatus === 'pending_approval' && !autoAcceptBookings) {
      approvalTimer = setTimeout(() => {
        setBookingStatus('rejected');
        toast({
          title: "Solicitação Expirada",
          description: `O profissional não respondeu em ${approvalTimeoutHours}h. O horário foi liberado.`,
          variant: "destructive",
          duration: 7000,
        });
      }, approvalTimeoutHours * 60 * 60 * 1000);
    }
    return () => clearTimeout(approvalTimer);
  }, [bookingStatus, autoAcceptBookings]);


  const handleTemporarilyReserveSlot = (date, time) => {
    setTemporarilyReservedSlot({ date, time });
    // toast({ title: "Horário Pré-reservado!", description: `O horário ${time} está reservado para você por alguns minutos.`, duration: 3000});
  };

  const handleNextStep = () => {
    if (step === 1 && (!serviceLocation || !selectedServiceId)) {
      toast({ title: "Campos obrigatórios", description: "Por favor, selecione o serviço e informe o local.", variant: "destructive" });
      return;
    }
    if (step === 2 && (!selectedDate || !selectedTime)) {
      toast({ title: "Data e Hora", description: "Por favor, selecione uma data e horário válidos.", variant: "destructive" });
      return;
    }
    if (step === 2 && getDerivedServiceType() === 'hourly' && estimatedHours < 1) {
      toast({ title: "Horas Estimadas", description: "Por favor, informe um número válido de horas.", variant: "destructive" });
      return;
    }
    if (step === 2 && getDerivedServiceType() === 'daily' && estimatedDays < 1) {
      toast({ title: "Dias Estimados", description: "Por favor, informe um número válido de dias.", variant: "destructive" });
      return;
    }
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    if (bookingStatus !== 'idle' && bookingStatus !== 'approved' && bookingStatus !== 'rejected') {
        // Prevent going back if booking process is advanced
        return;
    }
    setStep(prev => prev - 1);
  }

  const handleSubmitWorkRequest = () => {
    if (!paymentMethod) {
      toast({ title: "Pagamento", description: "Por favor, selecione um método de pagamento.", variant: "destructive" });
      return;
    }

    if (!clientUser?.id) {
      toast({ title: 'Login necessário', description: 'Você precisa estar logado para contratar.', variant: 'destructive' });
      return;
    }

    if (!professional?.id) {
      toast({ title: 'Profissional inválido', description: 'Não foi possível identificar o profissional.', variant: 'destructive' });
      return;
    }

    if (!selectedServiceId) {
      toast({ title: 'Selecione um serviço', description: 'Este profissional precisa ter ao menos 1 serviço ativo.', variant: 'destructive' });
      return;
    }

    if (!selectedDate || !selectedTime) {
      toast({ title: 'Data e Hora', description: 'Selecione uma data e um horário.', variant: 'destructive' });
      return;
    }

    const submit = async () => {
      try {
        const dateISO = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
        const nextStatus = autoAcceptBookings ? 'accepted' : 'pending';

        const notesParts = [];
        if (jobDescription?.trim()) notesParts.push(jobDescription.trim());
        if (paymentMethod) notesParts.push(`Pagamento: ${paymentMethod}`);
        const notes = notesParts.length ? notesParts.join('\n') : null;

        const payload = {
          professional_id: professional.id,
          client_id: clientUser.id,
          service_id: selectedServiceId,
          status: nextStatus,
          scheduled_date: dateISO,
          scheduled_time: selectedTime,
          duration: dateISO ? 1 : null,
          notes,
          location: serviceLocation || null,
        };

        const attempts = [
          { ...payload, total_price: total },
          payload,
          { ...payload, total_price: total, location: undefined },
        ];

        let inserted = null;
        let lastError = null;

        for (const row of attempts) {
          const clean = { ...row };
          // Evitar mandar undefined pro PostgREST
          Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);

          const res = await supabase.from('bookings').insert([clean]).select('id').single();
          if (!res.error) {
            inserted = res.data;
            lastError = null;
            break;
          }
          lastError = res.error;
          if (!isMissingColumnError(res.error)) break;
        }

        if (lastError) throw lastError;

        if (autoAcceptBookings) {
          setBookingStatus('approved');
          toast({
            title: 'Solicitação aprovada!',
            description: 'Serviço confirmado. Você pode acompanhar em Meus Serviços.',
            variant: 'success',
            duration: 7000,
          });
        } else {
          setBookingStatus('pending_approval');
          toast({
            title: 'Solicitação enviada!',
            description: 'Aguardando resposta do profissional. Você pode acompanhar em Meus Serviços.',
            duration: 7000,
          });
        }

        // fecha o modal após enviar
        setIsOpen(false);
      } catch (e) {
        log.error('BOOKING', 'Erro ao criar booking:', e);
        toast({
          title: 'Erro ao enviar solicitação',
          description: String(e?.message || 'Não foi possível enviar agora.'),
          variant: 'destructive',
        });
      }
    };

    submit();
  };
  
  const handleCloseModal = () => {
    setIsOpen(false);
  }


  if (!professional) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={cn(
          "sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] flex flex-col",
          bookingStatus === 'pending_confirmation' && "lg:max-w-md" // Smaller for status screens
      )}>
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Briefcase /> Contratar {professional.name}
          </DialogTitle>
          { bookingStatus === 'idle' && (
             <DialogDescription>
                Siga os passos para agendar o serviço com {professional.profession}.
             </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-grow overflow-y-auto p-1 pr-3 space-y-6">
          {bookingStatus === 'idle' && (
            <>
              {step === 1 && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div>
                    <Label htmlFor="serviceId">Serviço</Label>
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger id="serviceId" disabled={servicesLoading}>
                        <SelectValue placeholder={servicesLoading ? 'Carregando…' : 'Selecione o serviço'} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableServices.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            <div className="flex flex-col">
                              <span>{s.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatCurrency(Number(s.price) || 0)} / {normalizePriceUnit(s.price_unit)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!servicesLoading && availableServices.length === 0 && (
                      <p className="text-xs text-destructive mt-1">
                        Este profissional não tem serviços ativos no momento.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="serviceType">Tipo de Cobrança</Label>
                    <Select value={serviceType} onValueChange={setServiceType}>
                      <SelectTrigger id="serviceType" disabled={!!selectedService}>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    <SelectContent>
                      {getDerivedServiceType() === 'hourly' && (
                        <SelectItem value="hourly">
                          <div className="flex flex-col">
                            <span>Por Hora</span>
                            <span className="text-xs text-muted-foreground">
                              {selectedService ? `${formatCurrency(Number(selectedService.price) || 0)}/hora` : `R$ ${professionalHourlyRate}/hora`}
                            </span>
                          </div>
                        </SelectItem>
                      )}
                      {getDerivedServiceType() === 'daily' && (
                        <SelectItem value="daily">
                          <div className="flex flex-col">
                            <span>Por Diária</span>
                            <span className="text-xs text-muted-foreground">
                              {selectedService ? `${formatCurrency(Number(selectedService.price) || 0)}/dia` : `R$ ${professionalDailyRate}/dia`}
                            </span>
                          </div>
                        </SelectItem>
                      )}
                      {getDerivedServiceType() === 'event' && (
                        <SelectItem value="event">
                          <div className="flex flex-col">
                            <span>Preço fixo</span>
                            <span className="text-xs text-muted-foreground">
                              {selectedService ? formatCurrency(Number(selectedService.price) || 0) : 'Valor negociado'}
                            </span>
                          </div>
                        </SelectItem>
                      )}
                    </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="serviceLocation">Local do Serviço</Label>
                    <div className="flex items-center gap-2">
                        <MapPinIcon className="text-muted-foreground" />
                        <Input 
                            id="serviceLocation" 
                            value={serviceLocation} 
                            onChange={(e) => setServiceLocation(e.target.value)} 
                            placeholder="Endereço completo ou bairro" 
                        />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="jobDescription">Descrição do Serviço (opcional)</Label>
                    <Textarea 
                        id="jobDescription" 
                        value={jobDescription} 
                        onChange={(e) => setJobDescription(e.target.value)} 
                        placeholder="Descreva o que você precisa. Ex: Instalar 3 tomadas e 1 ventilador de teto." 
                        rows={3}
                    />
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                        <Label>Data e Horário</Label>
                        <BookingCalendar 
                            professionalId={professional.id} 
                            selectedDate={selectedDate}
                            onDateSelect={setSelectedDate}
                            selectedTime={selectedTime}
                            onTimeSelect={setSelectedTime}
                            professionalAvailability={professional.availability} 
                            temporarilyReservedSlot={temporarilyReservedSlot}
                            onTemporarilyReserveSlot={handleTemporarilyReserveSlot}
                        />
                         <p className="text-xs text-muted-foreground mt-1.5 p-1 bg-primary/5 rounded-sm border border-primary/10">
                            <Info size={12} className="inline mr-1 mb-0.5 text-primary"/>
                            Horários selecionados são reservados por alguns minutos.
                         </p>
                    </div>
                    <div className="mt-0 md:mt-[26px]"> {/* Align with calendar title */}
                      {getDerivedServiceType() === 'hourly' && (
                        <div>
                          <Label htmlFor="estimatedHours">Horas Estimadas</Label>
                          <Input 
                            id="estimatedHours" 
                            type="number" 
                            value={estimatedHours} 
                            onChange={(e) => setEstimatedHours(Math.max(1, parseInt(e.target.value, 10)))} 
                            min="1"
                            placeholder="Ex: 3"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Tempo estimado de trabalho.</p>
                        </div>
                      )}
                      
                      {getDerivedServiceType() === 'daily' && (
                        <div>
                          <Label htmlFor="estimatedDays">Dias Estimados</Label>
                          <Input 
                            id="estimatedDays" 
                            type="number" 
                            value={estimatedDays} 
                            onChange={(e) => setEstimatedDays(Math.max(1, parseInt(e.target.value, 10)))} 
                            min="1"
                            placeholder="Ex: 2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Quantos dias de trabalho.</p>
                        </div>
                      )}

                      {getDerivedServiceType() === 'event' && selectedService && (
                        <div className="p-3 bg-muted/30 rounded-md text-sm">
                          <p className="text-muted-foreground">
                            <Info size={14} className="inline mr-1 mb-0.5" />
                            Este serviço tem preço fixo.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <h3 className="text-lg font-semibold">Revisão do Agendamento</h3>
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 space-y-2 text-sm">
                      <p><strong>Profissional:</strong> {professional.name} ({professional.profession})</p>
                      <p><strong>Serviço:</strong> {selectedService?.title || 'Serviço'}</p>
                      <p><strong>Tipo de Cobrança:</strong> {getDerivedServiceType() === 'hourly' ? 'Por Hora' : getDerivedServiceType() === 'daily' ? 'Diária' : 'Preço fixo'}</p>
                      <p><strong>Local:</strong> {serviceLocation}</p>
                      <p><strong>Data:</strong> {selectedDate ? new Date(selectedDate).toLocaleDateString('pt-BR') : 'N/A'} às {selectedTime}</p>
                      {getDerivedServiceType() === 'hourly' && <p><strong>Duração Estimada:</strong> {estimatedHours} hora(s)</p>}
                      {getDerivedServiceType() === 'daily' && <p><strong>Dias Estimados:</strong> {estimatedDays} dia(s)</p>}
                      {jobDescription && <p><strong>Descrição:</strong> {jobDescription}</p>}
                    </CardContent>
                  </Card>
                  
                  <h3 className="text-lg font-semibold mt-4">Resumo do Pagamento</h3>
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 space-y-1 text-sm">
                        <div className="flex justify-between"><span>Valor do Serviço:</span> <span>{formatCurrency(basePrice)}</span></div>
                        <div className="flex justify-between"><span>Taxa da Plataforma ({platformFeeRate*100}%):</span> <span>{formatCurrency(fee)}</span></div>
                        <hr className="my-1"/>
                        <div className="flex justify-between font-bold text-base"><span>Total a Pagar:</span> <span className="text-primary">{formatCurrency(total)}</span></div>
                    </CardContent>
                  </Card>

                  <div>
                    <Label htmlFor="paymentMethod">Método de Pagamento</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger id="paymentMethod">
                        <SelectValue placeholder="Selecione o método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="joby_balance"><WalletCards className="inline mr-2 h-4 w-4" />Saldo JOBY ({formatCurrency(clientUser?.walletBalance || 0)})</SelectItem>
                        <SelectItem value="pix"><Banknote className="inline mr-2 h-4 w-4" />PIX</SelectItem>
                        <SelectItem value="credit_card"><CreditCard className="inline mr-2 h-4 w-4" />Cartão de Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                     {paymentMethod === 'joby_balance' && (clientUser?.walletBalance || 0) < total && (
                        <p className="text-xs text-destructive mt-1">Saldo insuficiente. Adicione fundos à sua carteira ou escolha outro método.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </>
          )}

          {bookingStatus === 'pending_approval' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 flex flex-col items-center">
                <UserCheck size={48} className="text-primary animate-pulse mb-4" />
                <h3 className="text-xl font-semibold mb-2">Solicitação Enviada</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                    Sua solicitação de trabalho foi enviada para {professional.name}.
                    O profissional tem {approvalTimeoutHours}h para aprovar ou recusar.
                </p>
                <div className="mt-4 p-3 bg-blue-50 rounded-md text-sm text-blue-700">
                  <Info size={16} className="inline mr-1" />
                  Você será notificado assim que houver uma resposta.
                </div>
            </motion.div>
          )}

          {bookingStatus === 'approved' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 flex flex-col items-center">
                <CheckCircle2 size={48} className="text-green-500 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Solicitação Aprovada!</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                    {professional.name} aprovou sua solicitação! O serviço está confirmado.
                </p>
                <div className="mt-4 p-3 bg-green-50 rounded-md text-sm text-green-700">
                  <CheckCircle2 size={16} className="inline mr-1" />
                  O chat está disponível e o cronômetro pode ser ativado no dia do serviço.
                </div>
            </motion.div>
          )}
          
          {bookingStatus === 'rejected' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 flex flex-col items-center">
                <AlertCircle size={48} className="text-destructive mb-4" />
                <h3 className="text-xl font-semibold mb-2">Solicitação Recusada</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                    {professional.name} não pôde aceitar sua solicitação. O horário foi liberado.
                    Tente escolher outro horário ou profissional.
                </p>
            </motion.div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t mt-auto">
            {bookingStatus === 'idle' && step > 1 && <Button variant="outline" onClick={handlePrevStep}>Voltar</Button>}
            {bookingStatus === 'idle' && step < 3 && <Button onClick={handleNextStep} className="joby-gradient text-primary-foreground">Próximo</Button>}
            {bookingStatus === 'idle' && step === 3 && (
              <Button 
                onClick={handleSubmitWorkRequest} 
                className="joby-gradient text-primary-foreground gap-2" 
                disabled={paymentMethod === 'joby_balance' && (clientUser?.walletBalance || 0) < total}
              >
                <Send size={16} />
                Enviar Solicitação
              </Button>
            )}
            {(bookingStatus === 'approved' || bookingStatus === 'rejected' || bookingStatus === 'pending_approval') && 
                <Button onClick={handleCloseModal} className="w-full">Fechar</Button>
            }
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingModal;
