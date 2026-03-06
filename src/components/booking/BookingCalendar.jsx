
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addMonths, subMonths, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isBefore, parseISO, getDay, addDays, setHours, setMinutes, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/lib/supabaseClient';

const BookingCalendar = ({ 
  professionalId, 
  selectedDate, 
  onDateSelect, 
  selectedTime, 
  onTimeSelect, 
  professionalAvailability,
  temporarilyReservedSlot, // { date: Date, time: string }
  onTemporarilyReserveSlot // (date: Date, time: string) => void
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableTimes, setAvailableTimes] = useState([]);
  const [bookedTimes, setBookedTimes] = useState([]);
  
  const {
    monday, tuesday, wednesday, thursday, friday, saturday, sunday,
    blockedDates = [],
    minTimeBetweenServices = 60, 
  } = professionalAvailability || {};

  const dayOfWeekConfig = [sunday, monday, tuesday, wednesday, thursday, friday, saturday];

  useEffect(() => {
    let cancelled = false;

    const loadBookedTimes = async () => {
      if (!professionalId || !selectedDate) {
        setBookedTimes([]);
        return;
      }

      try {
        const dateISO = format(selectedDate, 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('bookings')
          .select('scheduled_time,status')
          .eq('professional_id', professionalId)
          .eq('scheduled_date', dateISO)
          .in('status', ['pending', 'accepted'])
          .not('scheduled_time', 'is', null);

        if (error) throw error;
        if (cancelled) return;

        const taken = (data || [])
          .map((b) => (b?.scheduled_time == null ? '' : String(b.scheduled_time)))
          .filter(Boolean);

        setBookedTimes(taken);
      } catch (e) {
        if (!cancelled) setBookedTimes([]);
      }
    };

    loadBookedTimes();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, professionalId]);

  const generateTimeSlots = (date) => {
    if (!date) return [];
    
    const dayIndex = getDay(date);
    const dayConfig = dayOfWeekConfig[dayIndex];

    if (!dayConfig || !dayConfig.enabled || !dayConfig.start || !dayConfig.end) {
      return [];
    }

    const slots = [];
    // Ensure times are parsed correctly for the selected date, not a dummy date
    let currentTime = setMinutes(setHours(new Date(date), parseInt(dayConfig.start.split(':')[0], 10)), parseInt(dayConfig.start.split(':')[1], 10));
    const endTime = setMinutes(setHours(new Date(date), parseInt(dayConfig.end.split(':')[0], 10)), parseInt(dayConfig.end.split(':')[1], 10));
    
    while (isBefore(currentTime, endTime)) {
      const timeStr = format(currentTime, 'HH:mm');
      const isBooked = bookedTimes.includes(timeStr);

      if (!isBooked) {
        slots.push(timeStr);
      }
      currentTime = new Date(currentTime.getTime() + minTimeBetweenServices * 60000);
    }
    return slots;
  };
  
  useEffect(() => {
    if (selectedDate) {
      const newTimes = generateTimeSlots(selectedDate);
      setAvailableTimes(newTimes);
      // If previously selected time is not in new available times, reset it
      if (selectedTime && !newTimes.includes(selectedTime)) {
        onTimeSelect(''); 
      }
    } else {
      setAvailableTimes([]);
      onTimeSelect(''); // Reset time if date is deselected
    }
  }, [selectedDate, professionalId, professionalAvailability, bookedTimes]);

  const handleTimeSelect = (time) => {
    onTimeSelect(time);
    if (selectedDate) {
      onTemporarilyReserveSlot(selectedDate, time);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center py-2 px-1">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    );
  };

  const renderDaysOfWeek = () => {
    const daysHeader = [];
    const startDate = startOfWeek(currentMonth, { locale: ptBR });
    for (let i = 0; i < 7; i++) {
      daysHeader.push(
        <div key={i} className="text-center text-xs font-medium text-muted-foreground">
          {format(addDays(startDate, i), 'EE', { locale: ptBR }).charAt(0).toUpperCase()}
        </div>
      );
    }
    return <div className="grid grid-cols-7 gap-1 mb-1">{daysHeader}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calendarStartDate = startOfWeek(monthStart, { locale: ptBR });
    const calendarEndDate = endOfWeek(monthEnd, { locale: ptBR });

    const daysInCalendar = eachDayOfInterval({ start: calendarStartDate, end: calendarEndDate });
    const today = new Date();

    return (
      <div className="grid grid-cols-7 gap-1">
        {daysInCalendar.map((day) => {
          const dayConfig = dayOfWeekConfig[getDay(day)];
          const isDayOfWeekEnabled = dayConfig && dayConfig.enabled && dayConfig.start && dayConfig.end;
          
          const isBlockedByProf = blockedDates.some(blockedDateISO => 
            isSameDay(parseISO(blockedDateISO), day)
          );

          const isPast = isBefore(day, today) && !isSameDay(day, today);
          const isDisabled = !isSameMonth(day, monthStart) || isBlockedByProf || !isDayOfWeekEnabled || isPast;

          return (
            <Button
              key={day.toString()}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 text-xs p-0 rounded-full",
                !isSameMonth(day, monthStart) && "text-muted-foreground/30 invisible", // Make days of other months less visible
                isSameDay(day, selectedDate) && "bg-primary text-primary-foreground hover:bg-primary/90",
                isSameDay(day, today) && !isSameDay(day, selectedDate) && !isDisabled && "border border-primary/50",
                isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent line-through",
                !isDisabled && "hover:bg-accent"
              )}
              onClick={() => !isDisabled && onDateSelect(day)}
              disabled={isDisabled}
            >
              {format(day, 'd')}
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Card className="shadow-sm w-full">
        <CardContent className="p-2">
          {renderHeader()}
          {renderDaysOfWeek()}
          {renderCells()}
          {selectedDate && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium mb-1.5 text-center">
                Horários disponíveis para {format(selectedDate, 'dd/MM/yyyy', {locale: ptBR})}:
              </p>
              {availableTimes.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-hide">
                  {availableTimes.map(time => {
                    const isTempReserved = temporarilyReservedSlot && 
                                          isSameDay(temporarilyReservedSlot.date, selectedDate) && 
                                          temporarilyReservedSlot.time === time &&
                                          selectedTime !== time; // Don't mark as reserved if it's the current selection
                    
                    const buttonContent = (
                        <>
                          {time}
                          {isTempReserved && (
                            <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Info size={10} className="ml-1 text-yellow-600"/>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs p-1">
                                    <p>Reservado temporariamente</p>
                                </TooltipContent>
                            </Tooltip>
                          )}
                        </>
                    );

                    return (
                      <Button
                        key={time}
                        variant={selectedTime === time ? "default" : "outline"}
                        size="sm"
                        className={cn("text-xs h-7", isTempReserved && "opacity-60 border-yellow-500")}
                        onClick={() => !isTempReserved && handleTimeSelect(time)}
                        disabled={isTempReserved}
                      >
                        {buttonContent}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhum horário disponível para esta data.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default BookingCalendar;
