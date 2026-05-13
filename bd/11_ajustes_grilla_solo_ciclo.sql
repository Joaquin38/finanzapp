BEGIN;

UPDATE ajustes_gastos_fijos
SET ciclo_hasta_aplicacion = TO_CHAR(fecha_aplicacion, 'YYYY-MM')
WHERE ciclo_hasta_aplicacion IS NULL
  AND nota ILIKE 'Ajuste desde grilla para ciclo %';

COMMIT;
