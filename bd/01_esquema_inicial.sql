BEGIN;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  correo VARCHAR(160) NOT NULL UNIQUE,
  clave_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  rol_global VARCHAR(30) NOT NULL DEFAULT 'hogar_member'
    CHECK (rol_global IN ('superadmin', 'hogar_admin', 'hogar_member')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hogares_usuarios (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  rol VARCHAR(30) NOT NULL DEFAULT 'hogar_member'
    CHECK (rol IN ('superadmin', 'hogar_admin', 'hogar_member')),
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hogar_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS cuentas (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  nombre VARCHAR(120) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  moneda_base VARCHAR(3) NOT NULL CHECK (moneda_base IN ('ARS', 'USD')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tipos_movimiento (
  id SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

INSERT INTO tipos_movimiento (codigo, nombre)
VALUES
  ('ingreso', 'Ingreso'),
  ('egreso', 'Egreso'),
  ('ahorro', 'Ahorro')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS categorias (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  nombre VARCHAR(80) NOT NULL,
  tipo_movimiento_id SMALLINT NOT NULL REFERENCES tipos_movimiento(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hogar_id, nombre, tipo_movimiento_id)
);

CREATE TABLE IF NOT EXISTS etiquetas (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  nombre VARCHAR(60) NOT NULL,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hogar_id, nombre)
);

CREATE TABLE IF NOT EXISTS cotizaciones_dolar (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  fuente VARCHAR(40) NOT NULL,
  compra NUMERIC(14,4),
  venta NUMERIC(14,4) NOT NULL,
  moneda_origen VARCHAR(3) NOT NULL DEFAULT 'USD',
  moneda_destino VARCHAR(3) NOT NULL DEFAULT 'ARS',
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, fuente)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  cuenta_id BIGINT REFERENCES cuentas(id),
  tipo_movimiento_id SMALLINT NOT NULL REFERENCES tipos_movimiento(id),
  categoria_id BIGINT REFERENCES categorias(id),
  fecha DATE NOT NULL,
  descripcion TEXT,
  moneda_original VARCHAR(3) NOT NULL CHECK (moneda_original IN ('ARS', 'USD')),
  monto_original NUMERIC(14,2) NOT NULL CHECK (monto_original > 0),
  cotizacion_aplicada NUMERIC(14,4),
  monto_ars NUMERIC(14,2) NOT NULL CHECK (monto_ars > 0),
  usa_ahorro BOOLEAN NOT NULL DEFAULT FALSE,
  estado_egreso VARCHAR(20) CHECK (estado_egreso IN ('pendiente', 'pagado')),
  estado_ingreso VARCHAR(20) CHECK (estado_ingreso IN ('proyectado', 'registrado')),
  clasificacion_movimiento VARCHAR(30) NOT NULL DEFAULT 'normal'
    CHECK (clasificacion_movimiento IN ('normal', 'ajuste_cierre', 'saldo_inicial')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  eliminado_en TIMESTAMPTZ,
  creado_por_usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  eliminado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_etiquetas (
  movimiento_id BIGINT NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  etiqueta_id BIGINT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (movimiento_id, etiqueta_id)
);

CREATE TABLE IF NOT EXISTS gastos_fijos (
  id BIGSERIAL PRIMARY KEY,
  hogar_id BIGINT NOT NULL REFERENCES hogares(id),
  categoria_id BIGINT NOT NULL REFERENCES categorias(id),
  descripcion VARCHAR(160) NOT NULL,
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  monto_base NUMERIC(14,2) NOT NULL CHECK (monto_base > 0),
  dia_vencimiento SMALLINT CHECK (dia_vencimiento BETWEEN 1 AND 31),
  activo_desde_ciclo VARCHAR(7) NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
  activo_hasta_ciclo VARCHAR(7),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ajustes_gastos_fijos (
  id BIGSERIAL PRIMARY KEY,
  gasto_fijo_id BIGINT NOT NULL REFERENCES gastos_fijos(id) ON DELETE CASCADE,
  fecha_aplicacion DATE NOT NULL,
  ciclo_hasta_aplicacion VARCHAR(7),
  tipo_ajuste VARCHAR(20) NOT NULL CHECK (tipo_ajuste IN ('porcentaje', 'monto_fijo')),
  valor NUMERIC(14,4) NOT NULL,
  nota VARCHAR(255),
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hogares (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estados_gastos_fijos_ciclo (
  id BIGSERIAL PRIMARY KEY,
  gasto_fijo_id BIGINT NOT NULL REFERENCES gastos_fijos(id) ON DELETE CASCADE,
  ciclo VARCHAR(7) NOT NULL,
  estado_egreso VARCHAR(20) CHECK (estado_egreso IN ('pendiente', 'pagado')),
  estado_ingreso VARCHAR(20) CHECK (estado_ingreso IN ('proyectado', 'registrado')),
  creado_por_usuario_id BIGINT REFERENCES usuarios(id),
  actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gasto_fijo_id, ciclo)
);

CREATE TABLE IF NOT EXISTS valores_ipc (
  id BIGSERIAL PRIMARY KEY,
  periodo VARCHAR(7) NOT NULL,
  valor NUMERIC(10,4) NOT NULL,
  fuente VARCHAR(80) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo, fuente)
);

CREATE INDEX IF NOT EXISTS idx_movimientos_hogar_fecha
  ON movimientos (hogar_id, fecha);

CREATE INDEX IF NOT EXISTS idx_movimientos_tipo_fecha
  ON movimientos (tipo_movimiento_id, fecha);

CREATE INDEX IF NOT EXISTS idx_hogares_usuarios_usuario
  ON hogares_usuarios (usuario_id);

CREATE INDEX IF NOT EXISTS idx_hogares_usuarios_hogar
  ON hogares_usuarios (hogar_id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha_fuente
  ON cotizaciones_dolar (fecha, fuente);

COMMIT;
