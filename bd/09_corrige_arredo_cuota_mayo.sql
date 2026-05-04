BEGIN;

WITH candidatos AS (
  SELECT
    ct.id,
    ct.ciclo_asignado,
    ct.cuota_inicial,
    ct.cantidad_cuotas,
    (
      (CAST(SUBSTRING('2026-05' FROM 1 FOR 4) AS INTEGER) - CAST(SUBSTRING(ct.ciclo_asignado FROM 1 FOR 4) AS INTEGER)) * 12
      + (CAST(SUBSTRING('2026-05' FROM 6 FOR 2) AS INTEGER) - CAST(SUBSTRING(ct.ciclo_asignado FROM 6 FOR 2) AS INTEGER))
    ) AS meses_hasta_mayo
  FROM consumos_tarjeta ct
  WHERE UPPER(ct.descripcion) LIKE '%ARREDO%'
    AND ct.cantidad_cuotas = 12
),
objetivo AS (
  SELECT id
  FROM candidatos
  WHERE meses_hasta_mayo >= 0
    AND cuota_inicial + meses_hasta_mayo = 3
    AND cuota_inicial < cantidad_cuotas
)
UPDATE consumos_tarjeta ct
SET cuota_inicial = ct.cuota_inicial + 1,
    actualizado_en = NOW()
FROM objetivo
WHERE ct.id = objetivo.id;

COMMIT;
