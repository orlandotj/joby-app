
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { CalendarCheck, Save, Clock, AlertTriangle, PlusCircle, X, Repeat, Bell, CheckSquare, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DocsRequiredDialog from '@/components/DocsRequiredDialog'

const daysOfWeek = [
  { id: 'monday', label: 'Segunda' },
  { id: 'tuesday', label: 'Terça' },
  { id: 'wednesday', label: 'Quarta' },
  { id: 'thursday', label: 'Quinta' },
  { id: 'friday', label: 'Sexta' },
  { id: 'saturday', label: 'Sábado' },
  { id: 'sunday', label: 'Domingo' },
];

const ProfessionalAvailability = () => {
  const { toast } = useToast();
  const { user, updateUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const hasCanOfferFlag = !!user && Object.prototype.hasOwnProperty.call(user, 'can_offer_service')
  const canOffer = hasCanOfferFlag ? user?.can_offer_service === true : true

  const [docsDialogOpen, setDocsDialogOpen] = useState(false)

  const initialAvailability = user?.availability || {
    monday: { start: "09:00", end: "18:00", enabled: true, breaks: [{start: "12:00", end: "13:00"}] },
    tuesday: { start: "09:00", end: "18:00", enabled: true, breaks: [] },
    wednesday: { start: "09:00", end: "18:00", enabled: true, breaks: [] },
    thursday: { start: "09:00", end: "18:00", enabled: true, breaks: [] },
    friday: { start: "09:00", end: "18:00", enabled: true, breaks: [] },
    saturday: { start: "", end: "", enabled: false, breaks: [] },
    sunday: { start: "", end: "", enabled: false, breaks: [] },
    blockedDates: ["2025-07-20"], // Example
    minTimeBetweenServices: 60,
    autoAcceptBookings: false,
    lastConfirmed: null, // Store timestamp of last weekly confirmation
  };

  const [availability, setAvailability] = useState(initialAvailability);
  const [blockedDateInput, setBlockedDateInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showWeeklyConfirmReminder, setShowWeeklyConfirmReminder] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      toast({ title: "Acesso Negado", description: "Você precisa estar logado para acessar esta página.", variant: "destructive" });
      navigate('/login');
    } else if (user) {
      setAvailability(user.availability || initialAvailability);
      if (hasCanOfferFlag && !canOffer) {
        setDocsDialogOpen(true)
      }
      // Check if weekly confirmation is due
      const lastConfirmedDate = user.availability?.lastConfirmed ? new Date(user.availability.lastConfirmed) : null;
      if (!lastConfirmedDate || (new Date().getTime() - lastConfirmedDate.getTime() > 7 * 24 * 60 * 60 * 1000)) {
        setShowWeeklyConfirmReminder(true);
      }
    }
  }, [user, authLoading, navigate, toast]);

  const handleDayChange = (dayId, field, value) => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setAvailability(prev => ({
      ...prev,
      [dayId]: {
        ...prev[dayId],
        [field]: value,
      }
    }));
  };
  
  const handleBreakChange = (dayId, breakIndex, field, value) => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setAvailability(prev => {
      const dayData = { ...prev[dayId] };
      dayData.breaks[breakIndex][field] = value;
      return { ...prev, [dayId]: dayData };
    });
  };

  const addBreak = (dayId) => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setAvailability(prev => {
      const dayData = { ...prev[dayId] };
      if (!dayData.breaks) dayData.breaks = [];
      dayData.breaks.push({ start: "", end: "" });
      return { ...prev, [dayId]: dayData };
    });
  };

  const removeBreak = (dayId, breakIndex) => {
     if (hasCanOfferFlag && !canOffer) {
       setDocsDialogOpen(true)
       return
     }
     setAvailability(prev => {
      const dayData = { ...prev[dayId] };
      dayData.breaks.splice(breakIndex, 1);
      return { ...prev, [dayId]: dayData };
    });
  };

  const handleBlockedDateAdd = () => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    if (blockedDateInput && !availability.blockedDates.includes(blockedDateInput)) {
      setAvailability(prev => ({
        ...prev,
        blockedDates: [...prev.blockedDates, blockedDateInput].sort()
      }));
      setBlockedDateInput('');
      toast({title: "Data Bloqueada", description: `Data ${new Date(blockedDateInput + 'T00:00:00').toLocaleDateString('pt-BR')} adicionada às suas exceções.`});
    } else if (availability.blockedDates.includes(blockedDateInput)) {
        toast({ title: "Data já bloqueada", description: "Esta data já está na lista.", variant: "default" });
    }
  };

  const handleBlockedDateRemove = (dateToRemove) => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setAvailability(prev => ({
      ...prev,
      blockedDates: prev.blockedDates.filter(date => date !== dateToRemove)
    }));
     toast({title: "Data Desbloqueada", description: `Data ${new Date(dateToRemove + 'T00:00:00').toLocaleDateString('pt-BR')} removida das exceções.`});
  };

  const handleGeneralSettingChange = (field, value) => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setAvailability(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveChanges = () => {
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }
    setIsLoading(true);
    const updatedAvailability = {...availability, lastConfirmed: new Date().toISOString() };
    setTimeout(() => {
      updateUser({ ...user, availability: updatedAvailability }); 
      setAvailability(updatedAvailability); // Ensure local state also has lastConfirmed
      setShowWeeklyConfirmReminder(false); // Hide reminder after saving
      toast({ title: "Disponibilidade Salva!", description: "Sua agenda foi atualizada com sucesso.", variant: "success" });
      setIsLoading(false);
    }, 1000);
  };

  const handleConfirmWeeklyAgenda = () => {
    handleSaveChanges(); // Same as saving, but explicitly confirms agenda
    toast({ title: "Agenda Confirmada!", description: "Obrigado por confirmar sua disponibilidade semanal.", variant: "success" });
  };
  
  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          className="w-12 h-12 rounded-full joby-gradient"
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <DocsRequiredDialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen} />
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-4 px-2 sm:px-4 max-w-4xl"
    >
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <CalendarCheck size={32} className="text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Meus Horários e Disponibilidade</h1>
        </div>
        <p className="text-muted-foreground">Defina seus horários de trabalho, folgas, intervalos e preferências de agendamento. Mantenha sua agenda atualizada para receber mais clientes!</p>
      </header>

      {showWeeklyConfirmReminder && (
        <Card className="mb-6 shadow-md bg-primary/10 border-primary/30">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Bell size={20} className="text-primary" />
                    <CardTitle className="text-primary">Confirme sua Agenda Semanal</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-primary/90 mb-3">
                    Para garantir que os clientes vejam seus horários corretos, por favor, revise e confirme sua disponibilidade para a próxima semana.
                </p>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleConfirmWeeklyAgenda} className="gap-2 joby-gradient text-primary-foreground">
                    <CheckSquare size={18}/> Confirmar Agenda Agora
                </Button>
            </CardFooter>
        </Card>
      )}

      <Card className="mb-6 shadow-md">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
                <CardTitle>Horários Semanais</CardTitle>
                <CardDescription>Defina os horários e intervalos para cada dia. <Tooltip delayDuration={100}><TooltipTrigger asChild><Info size={14} className="inline cursor-help text-muted-foreground/70 ml-1"/></TooltipTrigger><TooltipContent><p>Horários de início/fim definem sua janela de trabalho. Intervalos são períodos não disponíveis dentro dessa janela.</p></TooltipContent></Tooltip></CardDescription>
            </div>
             <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
                <Repeat size={14} /> Repetir para Todos Iguais
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {daysOfWeek.map(day => (
            <div key={day.id} className="p-4 border rounded-lg bg-muted/20 relative">
              <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[120px_1fr_auto] items-center gap-x-4 gap-y-3">
                <Label htmlFor={`${day.id}-enabled`} className="font-semibold text-md text-foreground self-start pt-1.5">{day.label}</Label>
                
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label htmlFor={`${day.id}-start`} className="text-xs text-muted-foreground">Início</Label>
                        <Input
                          id={`${day.id}-start`}
                          type="time"
                          value={availability[day.id]?.start || ""}
                          onChange={(e) => handleDayChange(day.id, 'start', e.target.value)}
                          disabled={!availability[day.id]?.enabled}
                          className="h-9 text-sm"
                        />
                    </div>
                     <div>
                        <Label htmlFor={`${day.id}-end`} className="text-xs text-muted-foreground">Término</Label>
                        <Input
                          id={`${day.id}-end`}
                          type="time"
                          value={availability[day.id]?.end || ""}
                          onChange={(e) => handleDayChange(day.id, 'end', e.target.value)}
                          disabled={!availability[day.id]?.enabled}
                          className="h-9 text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 justify-self-end self-start pt-1.5">
                   <Label htmlFor={`${day.id}-enabled`} className="text-xs sr-only sm:not-sr-only text-muted-foreground">Disponível</Label>
                  <Switch
                    id={`${day.id}-enabled`}
                    checked={availability[day.id]?.enabled || false}
                    onCheckedChange={(checked) => handleDayChange(day.id, 'enabled', checked)}
                  />
                </div>
                
                {/* Breaks section */}
                {availability[day.id]?.enabled && (
                    <div className="col-span-full sm:col-start-2 sm:col-span-1 mt-2 space-y-2">
                        {availability[day.id]?.breaks?.map((brk, index) => (
                             <div key={index} className="flex items-center gap-2 pl-1">
                                <Label className="text-xs text-muted-foreground whitespace-nowrap">Intervalo {index+1}:</Label>
                                <Input type="time" value={brk.start} onChange={e => handleBreakChange(day.id, index, 'start', e.target.value)} className="h-8 text-xs w-24"/>
                                <span className="text-xs text-muted-foreground">-</span>
                                <Input type="time" value={brk.end} onChange={e => handleBreakChange(day.id, index, 'end', e.target.value)} className="h-8 text-xs w-24"/>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeBreak(day.id, index)}><X size={14}/></Button>
                             </div>
                        ))}
                        <Button variant="outline" size="xs" className="gap-1 text-xs" onClick={() => addBreak(day.id)}>
                            <PlusCircle size={12}/> Adicionar Intervalo
                        </Button>
                    </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Exceções / Datas Bloqueadas</CardTitle>
            <CardDescription>Adicione dias específicos em que você não estará disponível (férias, feriados, eventos pessoais, etc.).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input 
                type="date" 
                value={blockedDateInput} 
                onChange={(e) => setBlockedDateInput(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-9"
              />
              <Button onClick={handleBlockedDateAdd} variant="outline" size="sm" className="gap-1"><PlusCircle size={16}/>Adicionar</Button>
            </div>
            {availability.blockedDates.length > 0 ? (
              <ul className="space-y-1.5 text-sm max-h-36 overflow-y-auto pr-1 scrollbar-hide">
                {availability.blockedDates.map(date => (
                  <li key={date} className="flex justify-between items-center p-2 bg-muted/40 rounded-md text-muted-foreground hover:bg-muted/60">
                    {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    <Tooltip delayDuration={100}><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-70 hover:opacity-100" onClick={() => handleBlockedDateRemove(date)}><X size={16}/></Button>
                    </TooltipTrigger><TooltipContent><p>Remover bloqueio</p></TooltipContent></Tooltip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md bg-muted/20">Nenhuma data bloqueada adicionada.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Preferências de Agendamento</CardTitle>
            <CardDescription>Ajustes globais para seus agendamentos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="minTimeBetweenServices">Tempo Mínimo Entre Serviços <Tooltip delayDuration={100}><TooltipTrigger asChild><Info size={14} className="inline cursor-help text-muted-foreground/70 ml-1"/></TooltipTrigger><TooltipContent><p>Define um intervalo automático entre o fim de um serviço e o início do próximo.</p></TooltipContent></Tooltip></Label>
              <Input
                id="minTimeBetweenServices"
                type="number"
                value={availability.minTimeBetweenServices}
                onChange={(e) => handleGeneralSettingChange('minTimeBetweenServices', parseInt(e.target.value, 10) || 0)}
                min="0"
                step="15"
                className="h-9"
              />
              <p className="text-xs text-muted-foreground mt-1">Em minutos. Ex: 30 para meia hora de intervalo.</p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <Label htmlFor="autoAcceptBookings" className="flex flex-col">
                <span>Aceitar Agendamentos Automaticamente</span>
                <span className="text-xs text-muted-foreground">Se desativado, você precisará aprovar cada solicitação manualmente.</span>
              </Label>
              <Switch
                id="autoAcceptBookings"
                checked={availability.autoAcceptBookings}
                onCheckedChange={(checked) => handleGeneralSettingChange('autoAcceptBookings', checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-700 mb-6 flex items-start gap-3">
        <Info size={28} className="mt-0.5 shrink-0 text-blue-600" />
        <div>
            <h4 className="font-semibold mb-1">Dica JOBY:</h4>
            <p>Manter sua disponibilidade precisa e atualizada é fundamental para uma boa reputação na plataforma. Clientes valorizam profissionais organizados! Revise seus horários e exceções regularmente.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSaveChanges} disabled={isLoading} className="joby-gradient text-primary-foreground gap-2 px-6 py-3 text-base">
          {isLoading ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
          {isLoading ? "Salvando..." : "Salvar Disponibilidade"}
        </Button>
      </div>
    </motion.div>
    </TooltipProvider>
  );
};

export default ProfessionalAvailability;
