ALTER TABLE estados_gastos_fijos_ciclo
ADD COLUMN IF NOT EXISTS fecha_estado DATE;

ALTER TABLE estados_gastos_fijos_ciclo
ADD COLUMN IF NOT EXISTS fecha_realizacion DATE;

UPDATE estados_gastos_fijos_ciclo
SET fecha_estado = COALESCE(fecha_estado, actualizado_en::date, creado_en::date)
WHERE fecha_estado IS NULL;

UPDATE estados_gastos_fijos_ciclo
SET fecha_realizacion = COALESCE(fecha_realizacion, actualizado_en::date, creado_en::date)
WHERE fecha_realizacion IS NULL
  AND (estado_egreso = 'pagado' OR estado_ingreso = 'registrado');
