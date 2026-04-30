BEGIN;

CREATE TABLE IF NOT EXISTS tarjetas_credito (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  dia_cierre_default SMALLINT NOT NULL CHECK (dia_cierre_default BETWEEN 1 AND 31),
  dia_vencimiento_default SMALLINT CHECK (dia_vencimiento_default BETWEEN 1 AND 31),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hogar_id, nombre)
);

CREATE TABLE IF NOT EXISTS cierres_tarjeta (
  id BIGSERIAL PRIMARY KEY,
  tarjeta_id BIGINT NOT NULL REFERENCES tarjetas_credito(id) ON DELETE CASCADE,
  ciclo VARCHAR(7) NOT NULL,
  fecha_cierre DATE NOT NULL,
  fecha_vencimiento DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto'
    CHECK (estado IN ('abierto', 'cerrado')),
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarjeta_id, ciclo)
);

ALTER TABLE cierres_tarjeta
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE cierres_tarjeta
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS consumos_tarjeta (
  id BIGSERIAL PRIMARY KEY,
  tarjeta_id BIGINT NOT NULL REFERENCES tarjetas_credito(id) ON DELETE CASCADE,
  cierre_id BIGINT REFERENCES cierres_tarjeta(id) ON DELETE SET NULL,
  ciclo_asignado VARCHAR(7),
  fecha_compra DATE NOT NULL,
  descripcion VARCHAR(180) NOT NULL,
  categoria VARCHAR(80),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  monto_total NUMERIC(14,2) NOT NULL CHECK (monto_total > 0),
  cantidad_cuotas SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad_cuotas >= 1),
  monto_cuota NUMERIC(14,2) NOT NULL CHECK (monto_cuota > 0),
  cuota_inicial SMALLINT NOT NULL DEFAULT 1 CHECK (cuota_inicial >= 1),
  repite_mes_siguiente BOOLEAN NOT NULL DEFAULT FALSE,
  titular VARCHAR(120),
  observaciones TEXT,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  eliminado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cierre_id IS NOT NULL OR ciclo_asignado IS NOT NULL)
);

ALTER TABLE consumos_tarjeta
  ADD COLUMN IF NOT EXISTS repite_mes_siguiente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tarjetas_credito_hogar
  ON tarjetas_credito (hogar_id, activa);

CREATE INDEX IF NOT EXISTS idx_cierres_tarjeta_tarjeta_ciclo
  ON cierres_tarjeta (tarjeta_id, ciclo);

CREATE INDEX IF NOT EXISTS idx_consumos_tarjeta_cierre
  ON consumos_tarjeta (cierre_id);

CREATE INDEX IF NOT EXISTS idx_consumos_tarjeta_tarjeta_fecha
  ON consumos_tarjeta (tarjeta_id, fecha_compra);

COMMIT;
