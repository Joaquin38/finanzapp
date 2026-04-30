BEGIN;

ALTER TABLE hogares ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE hogares ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE hogares_usuarios ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE hogares_usuarios ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cotizaciones_dolar ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cotizaciones_dolar ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS eliminado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE gastos_fijos ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE gastos_fijos ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE ajustes_gastos_fijos ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE ajustes_gastos_fijos ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE estados_gastos_fijos_ciclo ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE estados_gastos_fijos_ciclo ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE tarjetas_credito ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE tarjetas_credito ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cierres_tarjeta ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE cierres_tarjeta ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE consumos_tarjeta ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE consumos_tarjeta ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
ALTER TABLE consumos_tarjeta ADD COLUMN IF NOT EXISTS eliminado_por_usuario_id BIGINT REFERENCES usuarios(id);
DO $$
BEGIN
  IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
    ALTER TABLE cierres_ciclo ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
  END IF;
END $$;

UPDATE hogares SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE hogares_usuarios SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE cuentas SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE categorias SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE etiquetas SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE cotizaciones_dolar SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE movimientos SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE gastos_fijos SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE ajustes_gastos_fijos SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE estados_gastos_fijos_ciclo SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE tarjetas_credito SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE cierres_tarjeta SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
UPDATE consumos_tarjeta SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, 1), actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1) WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL;
DO $$
BEGIN
  IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
    UPDATE cierres_ciclo
    SET actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, 1)
    WHERE actualizado_por_usuario_id IS NULL;
  END IF;
END $$;

COMMIT;
