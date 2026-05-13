BEGIN;

UPDATE tarjetas_credito tc
SET nombre = 'Tarjeta MercadoPago',
    actualizado_en = NOW()
WHERE LOWER(tc.nombre) = LOWER('Tarjeta principal')
  AND NOT EXISTS (
    SELECT 1
    FROM tarjetas_credito existente
    WHERE existente.hogar_id = tc.hogar_id
      AND LOWER(existente.nombre) = LOWER('Tarjeta MercadoPago')
  );

COMMIT;
