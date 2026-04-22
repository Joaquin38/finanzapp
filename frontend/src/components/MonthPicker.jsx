import { useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = [
  { value: '01', short: 'ene', label: 'Enero' },
  { value: '02', short: 'feb', label: 'Febrero' },
  { value: '03', short: 'mar', label: 'Marzo' },
  { value: '04', short: 'abr', label: 'Abril' },
  { value: '05', short: 'may', label: 'Mayo' },
  { value: '06', short: 'jun', label: 'Junio' },
  { value: '07', short: 'jul', label: 'Julio' },
  { value: '08', short: 'ago', label: 'Agosto' },
  { value: '09', short: 'sept', label: 'Septiembre' },
  { value: '10', short: 'oct', label: 'Octubre' },
  { value: '11', short: 'nov', label: 'Noviembre' },
  { value: '12', short: 'dic', label: 'Diciembre' }
];

function getCurrentCycle() {
  return new Date().toISOString().slice(0, 7);
}

function parseCycle(cycle) {
  const match = String(cycle || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2];
  if (!Number.isInteger(year) || !MONTHS.some((item) => item.value === month)) return null;
  return { year, month };
}

function formatCycleLabel(cycle, emptyLabel) {
  const parsed = parseCycle(cycle);
  if (!parsed) return emptyLabel;
  const month = MONTHS.find((item) => item.value === parsed.month);
  return `${month?.label || parsed.month} ${parsed.year}`;
}

export default function MonthPicker({
  label,
  value,
  onChange,
  min,
  allowClear = false,
  emptyLabel = 'Seleccionar ciclo',
  clearLabel = 'Borrar',
  className = ''
}) {
  const parsedValue = parseCycle(value);
  const parsedMin = parseCycle(min);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsedValue?.year || parsedMin?.year || new Date().getFullYear());
  const pickerRef = useRef(null);

  useEffect(() => {
    if (parsedValue?.year) setViewYear(parsedValue.year);
  }, [parsedValue?.year]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const monthOptions = useMemo(
    () =>
      MONTHS.map((month) => {
        const cycle = `${viewYear}-${month.value}`;
        const disabled = parsedMin ? cycle < min : false;
        const active = value === cycle;
        return { ...month, cycle, disabled, active };
      }),
    [min, parsedMin, value, viewYear]
  );

  const selectMonth = (cycle) => {
    onChange?.(cycle);
    setOpen(false);
  };

  const selectCurrentCycle = () => {
    const current = getCurrentCycle();
    if (parsedMin && current < min) return;
    onChange?.(current);
    setOpen(false);
  };

  return (
    <div className={`month-picker-field ${className}`.trim()}>
      {label && <span className="month-picker-label">{label}</span>}
      <div className="month-picker" ref={pickerRef}>
        <button
          type="button"
          className={`month-picker-trigger ${open ? 'is-open' : ''} ${!value ? 'is-empty' : ''}`}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span>{formatCycleLabel(value, emptyLabel)}</span>
          <i aria-hidden="true" />
        </button>

        {open && (
          <div className="month-picker-popover" role="dialog" aria-label={label || 'Seleccionar ciclo'}>
            <div className="month-picker-header">
              <button type="button" className="month-picker-nav" onClick={() => setViewYear((year) => year - 1)} aria-label="Anio anterior">
                &lt;
              </button>
              <strong>{viewYear}</strong>
              <button type="button" className="month-picker-nav" onClick={() => setViewYear((year) => year + 1)} aria-label="Anio siguiente">
                &gt;
              </button>
            </div>

            <div className="month-picker-grid">
              {monthOptions.map((month) => (
                <button
                  key={month.value}
                  type="button"
                  className={`month-picker-month ${month.active ? 'is-active' : ''}`}
                  disabled={month.disabled}
                  onClick={() => selectMonth(month.cycle)}
                >
                  {month.short}
                </button>
              ))}
            </div>

            <div className="month-picker-footer">
              {allowClear && (
                <button type="button" className="month-picker-link" onClick={() => selectMonth('')}>
                  {clearLabel}
                </button>
              )}
              <button type="button" className="month-picker-link" onClick={selectCurrentCycle} disabled={parsedMin && getCurrentCycle() < min}>
                Este mes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
