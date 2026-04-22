BEGIN;

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS estado_egreso VARCHAR(20),
  ADD COLUMN IF NOT EXISTS estado_ingreso VARCHAR(20);

UPDATE movimientos m
SET estado_egreso = COALESCE(m.estado_egreso, 'pendiente')
WHERE m.tipo_movimiento_id = (
  SELECT id FROM tipos_movimiento WHERE codigo = 'egreso' LIMIT 1
);

UPDATE movimientos m
SET estado_ingreso = COALESCE(m.estado_ingreso, 'registrado')
WHERE m.tipo_movimiento_id = (
  SELECT id FROM tipos_movimiento WHERE codigo = 'ingreso' LIMIT 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_movimientos_estado_egreso'
  ) THEN
    ALTER TABLE movimientos
      ADD CONSTRAINT chk_movimientos_estado_egreso
      CHECK (estado_egreso IS NULL OR estado_egreso IN ('pendiente', 'pagado'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_movimientos_estado_ingreso'
  ) THEN
    ALTER TABLE movimientos
      ADD CONSTRAINT chk_movimientos_estado_ingreso
      CHECK (estado_ingreso IS NULL OR estado_ingreso IN ('proyectado', 'registrado'));
  END IF;
END $$;

COMMIT;
