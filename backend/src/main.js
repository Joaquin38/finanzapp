const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

function envFlag(value) {
  return ['1', 'true', 'yes', 'require'].includes(String(value || '').toLowerCase());
}

const sslConfig = envFlag(process.env.DB_SSL) ? { rejectUnauthorized: false } : undefined;
const dbSchema = process.env.DB_SCHEMA || 'public';
const dbOptions = `-c search_path=${dbSchema}`;
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig,
        max: Number(process.env.DB_POOL_MAX || 5),
        options: dbOptions
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'finanzas_db',
        user: process.env.DB_USER || 'finanzas',
        password: process.env.DB_PASSWORD || 'finanzas_dev',
        ssl: sslConfig,
        max: Number(process.env.DB_POOL_MAX || 10),
        options: dbOptions
      }
);

function getSafeSchemaName(schema) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema || '') ? schema : 'public';
}

async function setSearchPath(client) {
  await client.query(`SET search_path TO ${getSafeSchemaName(dbSchema)}`);
}

const poolConnect = pool.connect.bind(pool);
pool.connect = async (...args) => {
  const client = await poolConnect(...args);
  await setSearchPath(client);
  return client;
};

pool.query = async (...args) => {
  const client = await pool.connect();
  try {
    return await client.query(...args);
  } finally {
    client.release();
  }
};
const COTIZACIONES_API_PUBLICA = 'https://dolarapi.com/v1/dolares/oficial';
const AUTH_SECRET = process.env.AUTH_SECRET || 'finanzas-app-dev-secret';
const ROLES_HOGAR = ['superadmin', 'hogar_admin', 'hogar_member'];
const ROLES_GESTION_HOGAR = ['hogar_admin', 'hogar_member'];
const HOGAR_COLON_260_ID = 1;
const USUARIO_JOAQUIN_ID = 1;
const USUARIO_SOFIA_ID = 2;
const CATEGORIAS_BASE = [
  { nombre: 'Reintegros', tipoMovimiento: 'ingreso' },
  { nombre: 'Ajuste de cierre', tipoMovimiento: 'ingreso' },
  { nombre: 'Arrastre de cierre', tipoMovimiento: 'ingreso' },
  { nombre: 'Alimentos', tipoMovimiento: 'egreso' },
  { nombre: 'Carniceria', tipoMovimiento: 'egreso' },
  { nombre: 'Polleria', tipoMovimiento: 'egreso' },
  { nombre: 'Verduleria', tipoMovimiento: 'egreso' },
  { nombre: 'Supermercado', tipoMovimiento: 'egreso' },
  { nombre: 'Vivienda', tipoMovimiento: 'egreso' },
  { nombre: 'Servicios', tipoMovimiento: 'egreso' },
  { nombre: 'Transporte', tipoMovimiento: 'egreso' },
  { nombre: 'Salud', tipoMovimiento: 'egreso' },
  { nombre: 'Tarjeta', tipoMovimiento: 'egreso' },
  { nombre: 'Prestamos', tipoMovimiento: 'egreso' },
  { nombre: 'Mascotas', tipoMovimiento: 'egreso' },
  { nombre: 'Ocio', tipoMovimiento: 'egreso' },
  { nombre: 'Ajuste de cierre', tipoMovimiento: 'egreso' },
  { nombre: 'Arrastre de cierre', tipoMovimiento: 'egreso' },
  { nombre: 'Ahorro', tipoMovimiento: 'ahorro' },
  { nombre: 'Otros', tipoMovimiento: 'egreso' }
];

function parseFecha(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

function esNumeroPositivo(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function resolveCiclo(ciclo, desde) {
  if (ciclo && /^\d{4}-\d{2}$/.test(ciclo)) return ciclo;
  if (desde) return String(desde).slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function cicloEsValido(ciclo) {
  return /^\d{4}-\d{2}$/.test(ciclo || '');
}

function finDeCiclo(ciclo) {
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  return new Date(anio, mes, 0);
}

function cicloAnterior(ciclo) {
  if (!cicloEsValido(ciclo)) return null;
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const fecha = new Date(Number(anioTexto), Number(mesTexto) - 1, 1);
  fecha.setMonth(fecha.getMonth() - 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function aplicarAjustes(montoBase, ajustes) {
  return ajustes.reduce((acc, ajuste) => {
    if (ajuste.tipo_ajuste === 'porcentaje') {
      return acc * (1 + Number(ajuste.valor) / 100);
    }
    return acc + Number(ajuste.valor);
  }, Number(montoBase));
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function firmarToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verificarToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expected) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function passwordValida(password, claveHash) {
  if (!password || !claveHash) return false;
  if (String(claveHash).startsWith('pbkdf2$')) {
    const [, digest, iterationsText, salt, storedHash] = String(claveHash).split('$');
    const iterations = Number(iterationsText);
    if (!digest || !iterations || !salt || !storedHash) return false;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, digest).toString('base64url');
    const storedBuffer = Buffer.from(storedHash);
    const hashBuffer = Buffer.from(hash);
    return storedBuffer.length === hashBuffer.length && crypto.timingSafeEqual(storedBuffer, hashBuffer);
  }
  if (password === claveHash) return true;
  return claveHash === 'demo_hash' && password === 'demo';
}

function hashPassword(password) {
  const digest = 'sha256';
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, digest).toString('base64url');
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

function normalizarRolHogar(rol) {
  if (rol === 'admin') return 'hogar_admin';
  if (rol === 'miembro' || rol === 'member') return 'hogar_member';
  return ROLES_HOGAR.includes(rol) ? rol : 'hogar_member';
}

function usuarioTieneAccesoHogar(usuario, hogarId) {
  if (!usuario || !hogarId) return false;
  if (usuario.rol_global === 'superadmin') return true;
  if (Number(usuario.hogar_id) === Number(hogarId)) return true;
  return (usuario.hogares || []).some((hogar) => Number(hogar.id) === Number(hogarId));
}

function rolUsuarioEnHogar(usuario, hogarId) {
  if (!usuario || !hogarId) return null;
  if (usuario.rol_global === 'superadmin') return 'superadmin';
  const hogar = (usuario.hogares || []).find((item) => Number(item.id) === Number(hogarId));
  if (hogar) return normalizarRolHogar(hogar.rol);
  if (Number(usuario.hogar_id) === Number(hogarId)) return normalizarRolHogar(usuario.rol);
  return null;
}

function puedeGestionarHogar(usuario, hogarId) {
  const rol = rolUsuarioEnHogar(usuario, hogarId);
  return rol === 'superadmin' || rol === 'hogar_admin';
}

function puedeOperarHogar(usuario, hogarId) {
  return Boolean(rolUsuarioEnHogar(usuario, hogarId));
}

function exigirGestionHogar(req, res, next) {
  const hogarId = Number(req.query.hogar_id || req.body?.hogar_id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (!puedeGestionarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
  }

  return next();
}

function exigirSuperadmin(req, res, next) {
  if (req.usuario?.rol_global !== 'superadmin') {
    return res.status(403).json({ error: 'Solo superadmin puede realizar esta accion' });
  }

  return next();
}

async function contarAdminsHogar(hogarId) {
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM hogares_usuarios
    WHERE hogar_id = $1
      AND rol = 'hogar_admin'
    `,
    [hogarId]
  );
  return Number(rows[0]?.total || 0);
}

function esPatchEstadoMovimiento(payload) {
  const keys = Object.keys(payload || {});
  if (keys.length === 0) return false;
  return keys.every((key) => ['estado_egreso', 'estado_ingreso'].includes(key));
}

async function cargarUsuarioSesion(usuarioId, hogarIdPreferido = null) {
  const { rows } = await pool.query(
    `
    SELECT u.id, u.correo, u.nombre, u.rol_global
    FROM usuarios u
    WHERE u.id = $1 AND u.activo = true
    LIMIT 1
    `,
    [usuarioId]
  );
  const usuario = rows[0];
  if (!usuario) return null;

  const { rows: hogaresRows } = await pool.query(
    `
    SELECT h.id, h.nombre, hu.rol
    FROM hogares_usuarios hu
    JOIN hogares h ON h.id = hu.hogar_id
    WHERE hu.usuario_id = $1
    ORDER BY h.id ASC
    `,
    [usuario.id]
  );
  const hogares = hogaresRows.map((hogar) => ({
    id: Number(hogar.id),
    nombre: hogar.nombre,
    rol: normalizarRolHogar(hogar.rol)
  }));
  const hogarActivo =
    hogares.find((hogar) => Number(hogar.id) === Number(hogarIdPreferido)) ||
    hogares[0] ||
    null;

  return {
    id: Number(usuario.id),
    email: usuario.correo,
    nombre: usuario.nombre,
    rol_global: normalizarRolHogar(usuario.rol_global),
    hogar_id: hogarActivo?.id || null,
    hogar_nombre: hogarActivo?.nombre || null,
    rol: hogarActivo?.rol || normalizarRolHogar(usuario.rol_global),
    hogares
  };
}

function validarAccesoHogar(req, res, next) {
  const hogarId = Number(req.query.hogar_id || req.body?.hogar_id);

  if (!hogarId) {
    return next();
  }

  if (!usuarioTieneAccesoHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes acceso a este hogar' });
  }

  return next();
}

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = verificarToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Sesión inválida o vencida' });
  }

  try {
    const usuario = await cargarUsuarioSesion(payload.id, payload.hogar_id);
    if (!usuario) {
      return res.status(401).json({ error: 'Sesion invalida o vencida' });
    }

    req.usuario = usuario;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Error validando sesion', detalle: error.message });
  }
}

async function asegurarColumnasEstadoMovimientos() {
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS usa_ahorro BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS estado_egreso VARCHAR(20)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS estado_ingreso VARCHAR(20)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS clase_especial VARCHAR(30)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS clasificacion_movimiento VARCHAR(30) NOT NULL DEFAULT 'normal'
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS referencia_ciclo_cierre VARCHAR(7)
  `);
  await pool.query(`
    UPDATE movimientos
    SET clasificacion_movimiento = CASE
      WHEN clase_especial = 'ajuste_cierre' THEN 'ajuste_cierre'
      WHEN clase_especial = 'arrastre_cierre' THEN 'saldo_inicial'
      ELSE 'normal'
    END
    WHERE clasificacion_movimiento IS NULL
       OR clasificacion_movimiento = ''
  `);
}

async function asegurarModeloMultiHogar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hogares (
      id BIGSERIAL PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hogares_usuarios (
      id BIGSERIAL PRIMARY KEY,
      hogar_id BIGINT NOT NULL REFERENCES hogares(id),
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
      rol VARCHAR(30) NOT NULL DEFAULT 'hogar_member',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hogar_id, usuario_id)
    )
  `);
  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS rol_global VARCHAR(30) NOT NULL DEFAULT 'hogar_member'
  `);
  await pool.query(`
    ALTER TABLE hogares_usuarios
    ALTER COLUMN rol SET DEFAULT 'hogar_member'
  `);
  await pool.query(`
    UPDATE hogares_usuarios
    SET rol = CASE
      WHEN rol = 'admin' THEN 'hogar_admin'
      WHEN rol IN ('miembro', 'member') THEN 'hogar_member'
      WHEN rol IN ('superadmin', 'hogar_admin', 'hogar_member') THEN rol
      ELSE 'hogar_member'
    END
    WHERE rol NOT IN ('superadmin', 'hogar_admin', 'hogar_member')
  `);
  await pool.query(`
    UPDATE usuarios
    SET rol_global = CASE
      WHEN rol_global IN ('superadmin', 'hogar_admin', 'hogar_member') THEN rol_global
      ELSE 'hogar_member'
    END
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'usuarios_rol_global_check'
      ) THEN
        ALTER TABLE usuarios
        ADD CONSTRAINT usuarios_rol_global_check
        CHECK (rol_global IN ('superadmin', 'hogar_admin', 'hogar_member'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'hogares_usuarios_rol_check'
      ) THEN
        ALTER TABLE hogares_usuarios
        ADD CONSTRAINT hogares_usuarios_rol_check
        CHECK (rol IN ('superadmin', 'hogar_admin', 'hogar_member'));
      END IF;
    END $$;
  `);
}

async function asegurarDatosColon260() {
  await asegurarModeloMultiHogar();

  await pool.query(
    `
    INSERT INTO hogares (id, nombre)
    VALUES ($1, 'Colon 260')
    ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre
    `,
    [HOGAR_COLON_260_ID]
  );

  await pool.query(
    `
    INSERT INTO usuarios (id, correo, clave_hash, nombre, rol_global, activo)
    VALUES
      ($1, 'joaco544@gmail.com', $3, 'Joaquin Diaz', 'superadmin', true),
      ($2, 'sofiacepeda56@gmail.com', $4, 'Sofia Cepeda', 'hogar_member', true)
    ON CONFLICT (id) DO UPDATE
    SET correo = EXCLUDED.correo,
        nombre = EXCLUDED.nombre,
        rol_global = EXCLUDED.rol_global,
        activo = true
    `,
    [USUARIO_JOAQUIN_ID, USUARIO_SOFIA_ID, hashPassword('prueba'), hashPassword('prueba')]
  );

  await pool.query(
    `
    INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol)
    VALUES
      ($1, $2, 'hogar_admin'),
      ($1, $3, 'hogar_member')
    ON CONFLICT (hogar_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol
    `,
    [HOGAR_COLON_260_ID, USUARIO_JOAQUIN_ID, USUARIO_SOFIA_ID]
  );
  await pool.query(`SELECT setval(pg_get_serial_sequence('hogares', 'id'), GREATEST((SELECT MAX(id) FROM hogares), 1), true)`);
  await pool.query(`SELECT setval(pg_get_serial_sequence('usuarios', 'id'), GREATEST((SELECT MAX(id) FROM usuarios), 1), true)`);

  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS hogar_id BIGINT
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT
  `);
  await pool.query(`
    ALTER TABLE gastos_fijos
    ADD COLUMN IF NOT EXISTS hogar_id BIGINT
  `);

  await pool.query('UPDATE cuentas SET hogar_id = $1 WHERE hogar_id IS DISTINCT FROM $1', [HOGAR_COLON_260_ID]);
  await pool.query('UPDATE categorias SET hogar_id = $1 WHERE hogar_id IS DISTINCT FROM $1', [HOGAR_COLON_260_ID]);
  await pool.query('UPDATE etiquetas SET hogar_id = $1 WHERE hogar_id IS DISTINCT FROM $1', [HOGAR_COLON_260_ID]);
  await pool.query(
    `
    UPDATE movimientos
    SET hogar_id = $1,
        creado_por_usuario_id = CASE
          WHEN creado_por_usuario_id IN ($2, $3) THEN creado_por_usuario_id
          ELSE $2
        END
    WHERE hogar_id IS DISTINCT FROM $1
       OR creado_por_usuario_id IS NULL
       OR creado_por_usuario_id NOT IN ($2, $3)
    `,
    [HOGAR_COLON_260_ID, USUARIO_JOAQUIN_ID, USUARIO_SOFIA_ID]
  );
  await pool.query('UPDATE gastos_fijos SET hogar_id = $1 WHERE hogar_id IS DISTINCT FROM $1', [HOGAR_COLON_260_ID]);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
        UPDATE cierres_ciclo
        SET hogar_id = ${HOGAR_COLON_260_ID},
            creado_por_usuario_id = CASE
              WHEN creado_por_usuario_id IN (${USUARIO_JOAQUIN_ID}, ${USUARIO_SOFIA_ID}) THEN creado_por_usuario_id
              ELSE ${USUARIO_JOAQUIN_ID}
            END
        WHERE hogar_id IS DISTINCT FROM ${HOGAR_COLON_260_ID}
           OR creado_por_usuario_id IS NULL
           OR creado_por_usuario_id NOT IN (${USUARIO_JOAQUIN_ID}, ${USUARIO_SOFIA_ID});
      END IF;
    END $$;
  `);
}

async function asegurarCierresCiclo() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cierres_ciclo (
      id BIGSERIAL PRIMARY KEY,
      hogar_id BIGINT NOT NULL REFERENCES hogares(id),
      ciclo VARCHAR(7) NOT NULL,
      balance_calculado NUMERIC(14,2) NOT NULL,
      saldo_real_final NUMERIC(14,2) NOT NULL,
      diferencia NUMERIC(14,2) NOT NULL DEFAULT 0,
      genera_saldo_inicial BOOLEAN NOT NULL DEFAULT TRUE,
      creado_por_usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hogar_id, ciclo)
    )
  `);
}

function siguienteCiclo(ciclo) {
  if (!cicloEsValido(ciclo)) return null;
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const fecha = new Date(Number(anioTexto), Number(mesTexto), 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

async function asegurarEstadosGastosFijosPorCiclo() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estados_gastos_fijos_ciclo (
      id BIGSERIAL PRIMARY KEY,
      gasto_fijo_id BIGINT NOT NULL REFERENCES gastos_fijos(id) ON DELETE CASCADE,
      ciclo VARCHAR(7) NOT NULL,
      estado_egreso VARCHAR(20) CHECK (estado_egreso IN ('pendiente', 'pagado')),
      estado_ingreso VARCHAR(20) CHECK (estado_ingreso IN ('proyectado', 'registrado')),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (gasto_fijo_id, ciclo)
    )
  `);
}

async function asegurarVigenciaGastosFijos() {
  await pool.query(`
    ALTER TABLE gastos_fijos
    ADD COLUMN IF NOT EXISTS activo_desde_ciclo VARCHAR(7) NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  `);
  await pool.query(`
    ALTER TABLE gastos_fijos
    ADD COLUMN IF NOT EXISTS activo_hasta_ciclo VARCHAR(7)
  `);
}

async function asegurarAlcanceAjustesGastosFijos() {
  await pool.query(`
    ALTER TABLE ajustes_gastos_fijos
    ADD COLUMN IF NOT EXISTS ciclo_hasta_aplicacion VARCHAR(7)
  `);
}

async function asegurarCategoriasBase(hogarId) {
  const { rows: tiposRows } = await pool.query('SELECT id, codigo FROM tipos_movimiento');
  const tipoIdPorCodigo = new Map(tiposRows.map((row) => [row.codigo, Number(row.id)]));

  const categoriasBaseConTipo = CATEGORIAS_BASE.map((categoria) => ({
    nombre: categoria.nombre,
    tipoMovimientoId: tipoIdPorCodigo.get(categoria.tipoMovimiento)
  })).filter((categoria) => categoria.tipoMovimientoId);

  if (categoriasBaseConTipo.length === 0) {
    return;
  }

  await pool.query(
    `
    INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id)
    SELECT $1, categoria.nombre, categoria.tipo_movimiento_id
    FROM UNNEST($2::text[], $3::smallint[]) AS categoria(nombre, tipo_movimiento_id)
    ON CONFLICT (hogar_id, nombre, tipo_movimiento_id) DO NOTHING
    `,
    [
      hogarId,
      categoriasBaseConTipo.map((categoria) => categoria.nombre),
      categoriasBaseConTipo.map((categoria) => categoria.tipoMovimientoId)
    ]
  );
}

async function sincronizarCotizacionesDesdeApiPublicaLegacy() {
  const response = await fetch(COTIZACIONES_API_PUBLICA);
  if (!response.ok) {
    throw new Error(`API pública respondió ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('La API pública no devolvió cotizaciones');
  }

  const cotizaciones = payload
    .filter((item) => item?.casa && Number(item?.venta) > 0)
    .map((item) => {
      const fechaBase = item.fechaActualizacion || item.fecha || new Date().toISOString();
      const fecha = String(fechaBase).slice(0, 10);

      return {
        fecha,
        fuente: String(item.casa).toLowerCase(),
        compra: item.compra ? Number(item.compra) : null,
        venta: Number(item.venta)
      };
    });

  for (const coti of cotizaciones) {
    await pool.query(
      `
      INSERT INTO cotizaciones_dolar (fecha, fuente, compra, venta)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (fecha, fuente)
      DO UPDATE SET compra = EXCLUDED.compra, venta = EXCLUDED.venta
      `,
      [coti.fecha, coti.fuente, coti.compra, coti.venta]
    );
  }
}

app.get('/salud', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true, servicio: 'finanzas-backend', db: 'ok' });
  } catch (error) {
    res.status(500).json({ ok: false, servicio: 'finanzas-backend', db: 'error', detalle: error.message });
  }
});
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son obligatorios' });
  }

  try {
    await asegurarDatosColon260();

    const { rows } = await pool.query(
      `
      SELECT u.id, u.correo, u.clave_hash, u.nombre, u.rol_global
      FROM usuarios u
      WHERE LOWER(u.correo) = LOWER($1)
        AND u.activo = true
      LIMIT 1
      `,
      [email]
    );

    const usuario = rows[0];
    if (!usuario || !passwordValida(password, usuario.clave_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const { rows: hogaresRows } = await pool.query(
      `
      SELECT h.id, h.nombre, hu.rol
      FROM hogares_usuarios hu
      JOIN hogares h ON h.id = hu.hogar_id
      WHERE hu.usuario_id = $1
      ORDER BY h.id ASC
      `,
      [usuario.id]
    );
    const hogares = hogaresRows.map((hogar) => ({
      id: Number(hogar.id),
      nombre: hogar.nombre,
      rol: normalizarRolHogar(hogar.rol)
    }));
    const hogarActivo = hogares[0] || null;

    const sessionUser = {
      id: Number(usuario.id),
      email: usuario.correo,
      nombre: usuario.nombre,
      rol_global: normalizarRolHogar(usuario.rol_global),
      hogar_id: hogarActivo?.id || null,
      hogar_nombre: hogarActivo?.nombre || null,
      rol: hogarActivo?.rol || normalizarRolHogar(usuario.rol_global),
      hogares
    };
    const token = firmarToken({ ...sessionUser, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });

    return res.status(200).json({ token, usuario: sessionUser });
  } catch (error) {
    return res.status(500).json({ error: 'Error iniciando sesión', detalle: error.message });
  }
});

app.get('/auth/me', autenticar, async (req, res) => {
  try {
    await asegurarDatosColon260();

    const { rows } = await pool.query(
      `
      SELECT u.id, u.correo, u.nombre, u.rol_global
      FROM usuarios u
      WHERE u.id = $1 AND u.activo = true
      LIMIT 1
      `,
      [req.usuario.id]
    );
    const usuario = rows[0];
    if (!usuario) {
      return res.status(401).json({ error: 'Sesion invalida o vencida' });
    }

    const { rows: hogaresRows } = await pool.query(
      `
      SELECT h.id, h.nombre, hu.rol
      FROM hogares_usuarios hu
      JOIN hogares h ON h.id = hu.hogar_id
      WHERE hu.usuario_id = $1
      ORDER BY h.id ASC
      `,
      [usuario.id]
    );
    const hogares = hogaresRows.map((hogar) => ({
      id: Number(hogar.id),
      nombre: hogar.nombre,
      rol: normalizarRolHogar(hogar.rol)
    }));
    const hogarActivo =
      hogares.find((hogar) => Number(hogar.id) === Number(req.usuario.hogar_id)) ||
      hogares[0] ||
      null;

    return res.status(200).json({
      usuario: {
        id: Number(usuario.id),
        email: usuario.correo,
        nombre: usuario.nombre,
        rol_global: normalizarRolHogar(usuario.rol_global),
        hogar_id: hogarActivo?.id || null,
        hogar_nombre: hogarActivo?.nombre || null,
        rol: hogarActivo?.rol || normalizarRolHogar(usuario.rol_global),
        hogares
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando sesion', detalle: error.message });
  }
});

app.get('/hogares', autenticar, async (req, res) => {
  try {
    if (req.usuario.rol_global === 'superadmin') {
      const { rows } = await pool.query('SELECT id, nombre FROM hogares ORDER BY nombre ASC');
      return res.status(200).json({
        total: rows.length,
        items: rows.map((hogar) => ({ ...hogar, id: Number(hogar.id), rol: 'superadmin' }))
      });
    }

    return res.status(200).json({
      total: req.usuario.hogares?.length || 0,
      items: req.usuario.hogares || []
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando hogares', detalle: error.message });
  }
});

app.get('/admin/hogares', autenticar, exigirSuperadmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        h.id,
        h.nombre,
        h.creado_en,
        COUNT(hu.usuario_id)::int AS usuarios_vinculados
      FROM hogares h
      LEFT JOIN hogares_usuarios hu ON hu.hogar_id = h.id
      GROUP BY h.id, h.nombre, h.creado_en
      ORDER BY h.nombre ASC
      `
    );
    return res.status(200).json({ total: rows.length, items: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando hogares', detalle: error.message });
  }
});

app.post('/admin/hogares', autenticar, exigirSuperadmin, async (req, res) => {
  const { nombre } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'nombre es obligatorio' });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO hogares (nombre)
      VALUES ($1)
      RETURNING id, nombre, creado_en
      `,
      [String(nombre).trim()]
    );
    return res.status(201).json({ ok: true, hogar: { ...rows[0], id: Number(rows[0].id) } });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando hogar', detalle: error.message });
  }
});

app.patch('/admin/hogares/:id', autenticar, exigirSuperadmin, async (req, res) => {
  const hogarId = Number(req.params.id);
  const { nombre } = req.body;

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'nombre es obligatorio' });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE hogares
      SET nombre = $1
      WHERE id = $2
      RETURNING id, nombre, creado_en
      `,
      [String(nombre).trim(), hogarId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Hogar no encontrado' });
    }

    return res.status(200).json({ ok: true, hogar: { ...rows[0], id: Number(rows[0].id) } });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando hogar', detalle: error.message });
  }
});

app.get('/admin/usuarios', autenticar, exigirSuperadmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.correo,
        u.nombre,
        u.rol_global,
        u.activo,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', h.id, 'nombre', h.nombre, 'rol', hu.rol)
            ORDER BY h.nombre
          ) FILTER (WHERE h.id IS NOT NULL),
          '[]'
        ) AS hogares
      FROM usuarios u
      LEFT JOIN hogares_usuarios hu ON hu.usuario_id = u.id
      LEFT JOIN hogares h ON h.id = hu.hogar_id
      GROUP BY u.id, u.correo, u.nombre, u.rol_global, u.activo
      ORDER BY u.nombre ASC
      `
    );
    return res.status(200).json({
      total: rows.length,
      items: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        hogares: (row.hogares || []).map((hogar) => ({ ...hogar, id: Number(hogar.id) }))
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando usuarios', detalle: error.message });
  }
});

app.post('/admin/usuarios', autenticar, exigirSuperadmin, async (req, res) => {
  const { email, nombre, password, hogar_id, rol } = req.body;
  const correoNormalizado = String(email || '').trim().toLowerCase();
  const nombreNormalizado = String(nombre || correoNormalizado.split('@')[0] || 'Usuario').trim();
  const passwordFinal = String(password || '').trim();
  const hogarId = Number(hogar_id);
  const rolNormalizado = normalizarRolHogar(rol || 'hogar_member');

  if (!correoNormalizado || !passwordFinal || !hogarId) {
    return res.status(400).json({ error: 'email, password y hogar_id son obligatorios' });
  }

  if (!ROLES_HOGAR.includes(rolNormalizado)) {
    return res.status(400).json({ error: 'rol invalido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hogarExiste = await client.query('SELECT id FROM hogares WHERE id = $1', [hogarId]);
    if (hogarExiste.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hogar no encontrado' });
    }

    const usuarioExistente = await client.query(
      `
      SELECT id, correo, nombre, activo
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
      LIMIT 1
      `,
      [correoNormalizado]
    );

    let usuario = usuarioExistente.rows[0];
    if (usuario && !usuario.activo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El usuario existe pero esta inactivo' });
    }

    if (!usuario) {
      const creado = await client.query(
        `
        INSERT INTO usuarios (correo, clave_hash, nombre, rol_global, activo)
        VALUES ($1, $2, $3, 'hogar_member', true)
        RETURNING id, correo, nombre, activo
        `,
        [correoNormalizado, hashPassword(passwordFinal), nombreNormalizado]
      );
      usuario = creado.rows[0];
    }

    await client.query(
      `
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol)
      VALUES ($1, $2, $3)
      ON CONFLICT (hogar_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol
      `,
      [hogarId, usuario.id, rolNormalizado]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      ok: true,
      usuario: { id: Number(usuario.id), correo: usuario.correo, nombre: usuario.nombre, activo: usuario.activo }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error creando usuario', detalle: error.message });
  } finally {
    client.release();
  }
});

app.post('/admin/hogares/:id/usuarios', autenticar, exigirSuperadmin, async (req, res) => {
  const hogarId = Number(req.params.id);
  const { usuario_id, rol } = req.body;
  const usuarioId = Number(usuario_id);
  const rolNormalizado = normalizarRolHogar(rol);

  if (!hogarId || !usuarioId) {
    return res.status(400).json({ error: 'hogar_id y usuario_id son obligatorios' });
  }

  if (!ROLES_HOGAR.includes(rolNormalizado)) {
    return res.status(400).json({ error: 'rol invalido' });
  }

  try {
    const hogarExiste = await pool.query('SELECT id FROM hogares WHERE id = $1', [hogarId]);
    if (hogarExiste.rows.length === 0) {
      return res.status(404).json({ error: 'Hogar no encontrado' });
    }

    const usuarioExiste = await pool.query('SELECT id FROM usuarios WHERE id = $1 AND activo = true', [usuarioId]);
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol)
      VALUES ($1, $2, $3)
      ON CONFLICT (hogar_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuarioId, rolNormalizado]
    );

    return res.status(200).json({ ok: true, vinculo: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error vinculando usuario al hogar', detalle: error.message });
  }
});

app.get('/hogares/:id/miembros', autenticar, async (req, res) => {
  const hogarId = Number(req.params.id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (!puedeGestionarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.correo,
        u.nombre,
        u.activo,
        hu.rol,
        hu.creado_en
      FROM hogares_usuarios hu
      JOIN usuarios u ON u.id = hu.usuario_id
      WHERE hu.hogar_id = $1
      ORDER BY
        CASE WHEN hu.rol = 'hogar_admin' THEN 0 ELSE 1 END,
        u.nombre ASC
      `,
      [hogarId]
    );

    return res.status(200).json({
      total: rows.length,
      items: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        rol: normalizarRolHogar(row.rol)
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando miembros del hogar', detalle: error.message });
  }
});

app.post('/hogares/:id/miembros', autenticar, async (req, res) => {
  const hogarId = Number(req.params.id);
  const { email, nombre, password, rol } = req.body;
  const rolNormalizado = normalizarRolHogar(rol || 'hogar_member');
  const correoNormalizado = String(email || '').trim().toLowerCase();

  if (!hogarId || !correoNormalizado) {
    return res.status(400).json({ error: 'hogar_id y email son obligatorios' });
  }

  if (!ROLES_GESTION_HOGAR.includes(rolNormalizado)) {
    return res.status(400).json({ error: 'rol invalido para miembros del hogar' });
  }

  if (!puedeGestionarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const usuarioExistente = await client.query(
      `
      SELECT id, correo, nombre, activo
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
      LIMIT 1
      `,
      [correoNormalizado]
    );

    let usuario = usuarioExistente.rows[0];
    if (usuario && !usuario.activo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El usuario existe pero esta inactivo' });
    }

    if (!usuario) {
      const nombreFinal = String(nombre || correoNormalizado.split('@')[0] || 'Usuario').trim();
      const passwordFinal = String(password || '').trim();

      if (!passwordFinal) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'password es obligatorio para crear un usuario nuevo' });
      }

      const creado = await client.query(
        `
        INSERT INTO usuarios (correo, clave_hash, nombre, rol_global, activo)
        VALUES ($1, $2, $3, 'hogar_member', true)
        RETURNING id, correo, nombre, activo
        `,
        [correoNormalizado, hashPassword(passwordFinal), nombreFinal]
      );
      usuario = creado.rows[0];
    }

    if (Number(usuario.id) === Number(req.usuario.id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No podes modificar tu propio rol desde esta pantalla' });
    }

    const { rows } = await client.query(
      `
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol)
      VALUES ($1, $2, $3)
      ON CONFLICT (hogar_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuario.id, rolNormalizado]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      miembro: {
        id: Number(usuario.id),
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: rows[0].rol
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error agregando miembro al hogar', detalle: error.message });
  } finally {
    client.release();
  }
});

app.patch('/hogares/:id/miembros/:usuarioId', autenticar, async (req, res) => {
  const hogarId = Number(req.params.id);
  const usuarioId = Number(req.params.usuarioId);
  const rolNormalizado = normalizarRolHogar(req.body?.rol);

  if (!hogarId || !usuarioId) {
    return res.status(400).json({ error: 'hogar_id y usuario_id son obligatorios' });
  }

  if (!ROLES_GESTION_HOGAR.includes(rolNormalizado)) {
    return res.status(400).json({ error: 'rol invalido para miembros del hogar' });
  }

  if (!puedeGestionarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
  }

  if (Number(req.usuario.id) === usuarioId) {
    return res.status(400).json({ error: 'No podes cambiar tu propio rol desde esta pantalla' });
  }

  try {
    const actual = await pool.query(
      'SELECT rol FROM hogares_usuarios WHERE hogar_id = $1 AND usuario_id = $2',
      [hogarId, usuarioId]
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({ error: 'Miembro no encontrado en este hogar' });
    }

    if (actual.rows[0].rol === 'hogar_admin' && rolNormalizado !== 'hogar_admin') {
      const admins = await contarAdminsHogar(hogarId);
      if (admins <= 1) {
        return res.status(400).json({ error: 'El hogar debe conservar al menos un admin' });
      }
    }

    const { rows } = await pool.query(
      `
      UPDATE hogares_usuarios
      SET rol = $3
      WHERE hogar_id = $1
        AND usuario_id = $2
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuarioId, rolNormalizado]
    );

    return res.status(200).json({ ok: true, miembro: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando rol del miembro', detalle: error.message });
  }
});

app.delete('/hogares/:id/miembros/:usuarioId', autenticar, async (req, res) => {
  const hogarId = Number(req.params.id);
  const usuarioId = Number(req.params.usuarioId);

  if (!hogarId || !usuarioId) {
    return res.status(400).json({ error: 'hogar_id y usuario_id son obligatorios' });
  }

  if (!puedeGestionarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
  }

  if (Number(req.usuario.id) === usuarioId) {
    return res.status(400).json({ error: 'No podes quitar tu propio usuario del hogar' });
  }

  try {
    const actual = await pool.query(
      'SELECT rol FROM hogares_usuarios WHERE hogar_id = $1 AND usuario_id = $2',
      [hogarId, usuarioId]
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({ error: 'Miembro no encontrado en este hogar' });
    }

    if (actual.rows[0].rol === 'hogar_admin') {
      const admins = await contarAdminsHogar(hogarId);
      if (admins <= 1) {
        return res.status(400).json({ error: 'El hogar debe conservar al menos un admin' });
      }
    }

    await pool.query('DELETE FROM hogares_usuarios WHERE hogar_id = $1 AND usuario_id = $2', [hogarId, usuarioId]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Error quitando miembro del hogar', detalle: error.message });
  }
});

async function sincronizarCotizacionesDesdeApiPublica() {
  const response = await fetch(COTIZACIONES_API_PUBLICA);
  if (!response.ok) {
    throw new Error(`API pÃºblica respondiÃ³ ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || Number(payload?.venta) <= 0) {
    throw new Error('La API pÃºblica no devolviÃ³ una cotizaciÃ³n oficial vÃ¡lida');
  }

  const fechaBase = payload.fechaActualizacion || payload.fecha || new Date().toISOString();
  const fecha = String(fechaBase).slice(0, 10);
  const compra = payload.compra ? Number(payload.compra) : null;
  const venta = Number(payload.venta);

  await pool.query(
    `
    INSERT INTO cotizaciones_dolar (fecha, fuente, compra, venta)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (fecha, fuente)
    DO UPDATE SET compra = EXCLUDED.compra, venta = EXCLUDED.venta
    `,
    [fecha, 'oficial', compra, venta]
  );
}

app.use(autenticar);
app.use(validarAccesoHogar);

app.get('/movimientos', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const desde = parseFecha(req.query.desde);
  const hasta = parseFecha(req.query.hasta);
  const incluirEliminados = String(req.query.incluir_eliminados || 'false') === 'true';

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if ((req.query.desde && !desde) || (req.query.hasta && !hasta)) {
    return res.status(400).json({ error: 'desde/hasta deben tener formato YYYY-MM-DD' });
  }

  try {
    await asegurarColumnasEstadoMovimientos();

    const params = [hogarId];
    const filtros = ['m.hogar_id = $1'];

    if (!incluirEliminados) {
      filtros.push('m.activo = true');
    }

    if (desde) {
      params.push(desde);
      filtros.push(`m.fecha >= $${params.length}`);
    }

    if (hasta) {
      params.push(hasta);
      filtros.push(`m.fecha <= $${params.length}`);
    }

    let rows = [];
    try {
      const query = `
        SELECT
          m.id,
          m.fecha,
          m.descripcion,
          m.moneda_original,
          m.monto_original,
          m.cotizacion_aplicada,
          m.monto_ars,
          m.usa_ahorro,
          m.estado_egreso,
          m.estado_ingreso,
          COALESCE(
            m.clasificacion_movimiento,
            CASE
              WHEN m.clase_especial = 'ajuste_cierre' THEN 'ajuste_cierre'
              WHEN m.clase_especial = 'arrastre_cierre' THEN 'saldo_inicial'
              ELSE 'normal'
            END,
            'normal'
          ) AS clasificacion_movimiento,
          m.activo,
          m.eliminado_en,
          m.creado_por_usuario_id,
          u.nombre AS creado_por_usuario_nombre,
          tm.codigo AS tipo_movimiento,
          c.nombre AS categoria
        FROM movimientos m
        JOIN tipos_movimiento tm ON tm.id = m.tipo_movimiento_id
        LEFT JOIN categorias c ON c.id = m.categoria_id
        LEFT JOIN usuarios u ON u.id = m.creado_por_usuario_id
        WHERE ${filtros.join(' AND ')}
        ORDER BY m.fecha DESC, m.id DESC
      `;
      const result = await pool.query(query, params);
      rows = result.rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;
      const queryFallback = `
        SELECT
          m.id,
          m.fecha,
          m.descripcion,
          m.moneda_original,
          m.monto_original,
          m.cotizacion_aplicada,
          m.monto_ars,
          false AS usa_ahorro,
          NULL::VARCHAR AS estado_egreso,
          NULL::VARCHAR AS estado_ingreso,
          'normal'::VARCHAR AS clasificacion_movimiento,
          m.activo,
          m.eliminado_en,
          m.creado_por_usuario_id,
          u.nombre AS creado_por_usuario_nombre,
          tm.codigo AS tipo_movimiento,
          c.nombre AS categoria
        FROM movimientos m
        JOIN tipos_movimiento tm ON tm.id = m.tipo_movimiento_id
        LEFT JOIN categorias c ON c.id = m.categoria_id
        LEFT JOIN usuarios u ON u.id = m.creado_por_usuario_id
        WHERE ${filtros.join(' AND ')}
        ORDER BY m.fecha DESC, m.id DESC
      `;
      const resultFallback = await pool.query(queryFallback, params);
      rows = resultFallback.rows;
    }
    return res.status(200).json({ total: rows.length, items: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando movimientos', detalle: error.message });
  }
});

app.post('/movimientos', async (req, res) => {
  const {
    hogar_id,
    cuenta_id,
    tipo_movimiento_id,
    categoria_id,
    fecha,
    descripcion,
    moneda_original,
    monto_original,
    cotizacion_aplicada,
    monto_ars,
    usa_ahorro,
    estado_egreso,
    estado_ingreso,
    clasificacion_movimiento,
    creado_por_usuario_id
  } = req.body;
  const creadorId = Number(req.usuario?.id || creado_por_usuario_id);

  if (!hogar_id || !tipo_movimiento_id || !fecha || !moneda_original || !monto_original || !monto_ars || !creadorId) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: hogar_id, tipo_movimiento_id, fecha, moneda_original y monto'
    });
  }

  if (!['ARS', 'USD'].includes(moneda_original)) {
    return res.status(400).json({ error: 'moneda_original debe ser ARS o USD' });
  }

  if (!parseFecha(fecha)) {
    return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
  }

  if (!esNumeroPositivo(monto_original) || !esNumeroPositivo(monto_ars)) {
    return res.status(400).json({ error: 'monto_original y monto_ars deben ser mayores a 0' });
  }

  try {
    await asegurarColumnasEstadoMovimientos();

    const estadoEgresoFinal =
      Number(tipo_movimiento_id) === 2 ? (estado_egreso || 'pendiente') : null;
    const estadoIngresoFinal =
      Number(tipo_movimiento_id) === 1 ? (estado_ingreso || 'registrado') : null;

    if (clasificacion_movimiento && !['normal', 'ajuste_cierre', 'saldo_inicial'].includes(clasificacion_movimiento)) {
      return res.status(400).json({ error: "clasificacion_movimiento debe ser 'normal', 'ajuste_cierre' o 'saldo_inicial'" });
    }

    if (!puedeOperarHogar(req.usuario, Number(hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para operar en este hogar' });
    }

    if (categoria_id) {
      const { rows: categoriaRows } = await pool.query(
        `
        SELECT tipo_movimiento_id
        FROM categorias
        WHERE id = $1 AND hogar_id = $2
        `,
        [categoria_id, hogar_id]
      );

      if (categoriaRows.length === 0) {
        return res.status(400).json({ error: 'La categoria no existe para este hogar' });
      }

      if (categoriaRows.length > 0 && Number(categoriaRows[0].tipo_movimiento_id) !== Number(tipo_movimiento_id)) {
        return res.status(400).json({ error: 'La categoría no corresponde al tipo de movimiento seleccionado' });
      }
    }

    let rows = [];
    try {
      const query = `
        INSERT INTO movimientos (
          hogar_id,
          cuenta_id,
          tipo_movimiento_id,
          categoria_id,
          fecha,
          descripcion,
          moneda_original,
          monto_original,
          cotizacion_aplicada,
          monto_ars,
          usa_ahorro,
          estado_egreso,
          estado_ingreso,
          clasificacion_movimiento,
          creado_por_usuario_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
        )
        RETURNING id, fecha, moneda_original, monto_original, monto_ars
      `;
      const values = [
        hogar_id,
        cuenta_id || null,
        tipo_movimiento_id,
        categoria_id || null,
        fecha,
        descripcion || null,
        moneda_original,
        monto_original,
        cotizacion_aplicada || null,
        monto_ars,
        Boolean(usa_ahorro),
        estadoEgresoFinal,
        estadoIngresoFinal,
        clasificacion_movimiento || 'normal',
        creadorId
      ];
      rows = (await pool.query(query, values)).rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;
      const queryFallback = `
        INSERT INTO movimientos (
          hogar_id,
          cuenta_id,
          tipo_movimiento_id,
          categoria_id,
          fecha,
          descripcion,
          moneda_original,
          monto_original,
          cotizacion_aplicada,
          monto_ars,
          creado_por_usuario_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
        RETURNING id, fecha, moneda_original, monto_original, monto_ars
      `;
      const valuesFallback = [
        hogar_id,
        cuenta_id || null,
        tipo_movimiento_id,
        categoria_id || null,
        fecha,
        descripcion || null,
        moneda_original,
        monto_original,
        cotizacion_aplicada || null,
        monto_ars,
        creadorId
      ];
      rows = (await pool.query(queryFallback, valuesFallback)).rows;
    }
    return res.status(201).json({ ok: true, movimiento: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando movimiento', detalle: error.message });
  }
});

app.patch('/movimientos/:id', async (req, res) => {
  const movimientoId = Number(req.params.id);
  const { descripcion, categoria_id, cuenta_id, estado_egreso, estado_ingreso } = req.body;

  if (!movimientoId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    await asegurarColumnasEstadoMovimientos();

    const { rows: movimientoRows } = await pool.query(
      'SELECT hogar_id FROM movimientos WHERE id = $1',
      [movimientoId]
    );
    if (movimientoRows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    const hogarMovimientoId = Number(movimientoRows[0].hogar_id);
    if (!puedeOperarHogar(req.usuario, hogarMovimientoId)) {
      return res.status(403).json({ error: 'No tenes acceso a este movimiento' });
    }
    if (!puedeGestionarHogar(req.usuario, hogarMovimientoId) && !esPatchEstadoMovimiento(req.body)) {
      return res.status(403).json({ error: 'Tu rol solo permite cambiar estados de movimientos' });
    }

    if (categoria_id) {
      const { rows: categoriaRows } = await pool.query(
        'SELECT id FROM categorias WHERE id = $1 AND hogar_id = $2 AND activo = true',
        [categoria_id, hogarMovimientoId]
      );
      if (categoriaRows.length === 0) {
        return res.status(400).json({ error: 'La categoria no existe para este hogar' });
      }
    }

    let rows = [];
    try {
      const result = await pool.query(
        `
        UPDATE movimientos
        SET descripcion = COALESCE($1, descripcion),
            categoria_id = COALESCE($2, categoria_id),
            cuenta_id = COALESCE($3, cuenta_id),
            estado_egreso = COALESCE($4, estado_egreso),
            estado_ingreso = COALESCE($5, estado_ingreso)
        WHERE id = $6 AND activo = true
        RETURNING id, fecha, descripcion, categoria_id, cuenta_id, estado_egreso, estado_ingreso, activo
        `,
        [descripcion ?? null, categoria_id ?? null, cuenta_id ?? null, estado_egreso ?? null, estado_ingreso ?? null, movimientoId]
      );
      rows = result.rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;
      const resultFallback = await pool.query(
        `
        UPDATE movimientos
        SET descripcion = COALESCE($1, descripcion),
            categoria_id = COALESCE($2, categoria_id),
            cuenta_id = COALESCE($3, cuenta_id)
        WHERE id = $4 AND activo = true
        RETURNING id, fecha, descripcion, categoria_id, cuenta_id, activo
        `,
        [descripcion ?? null, categoria_id ?? null, cuenta_id ?? null, movimientoId]
      );
      rows = resultFallback.rows;
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    return res.status(200).json({ ok: true, movimiento: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando movimiento', detalle: error.message });
  }
});

app.delete('/movimientos/:id', async (req, res) => {
  const movimientoId = Number(req.params.id);

  if (!movimientoId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    await asegurarColumnasEstadoMovimientos();

    const { rows: movimientoRows } = await pool.query(
      'SELECT hogar_id FROM movimientos WHERE id = $1',
      [movimientoId]
    );
    if (movimientoRows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }
    if (!puedeGestionarHogar(req.usuario, Number(movimientoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para eliminar movimientos' });
    }

    const { rowCount } = await pool.query(
      `
      UPDATE movimientos
      SET activo = false,
          eliminado_en = NOW()
      WHERE id = $1 AND activo = true
      `,
      [movimientoId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    return res.status(200).json({ ok: true, eliminado_id: movimientoId });
  } catch (error) {
    return res.status(500).json({ error: 'Error eliminando movimiento', detalle: error.message });
  }
});

app.get('/categorias', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  try {
    await asegurarCategoriasBase(hogarId);

    const { rows } = await pool.query(
      `
      SELECT c.id, c.nombre, tm.codigo AS tipo_movimiento
      FROM categorias c
      JOIN tipos_movimiento tm ON tm.id = c.tipo_movimiento_id
      WHERE c.hogar_id = $1 AND c.activo = true
      ORDER BY c.nombre ASC
      `,
      [hogarId]
    );

    return res.status(200).json({ total: rows.length, items: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando categorías', detalle: error.message });
  }
});

app.post('/categorias', exigirGestionHogar, async (req, res) => {
  const { hogar_id, nombre, tipo_movimiento_id } = req.body;

  if (!hogar_id || !nombre || !tipo_movimiento_id) {
    return res.status(400).json({ error: 'hogar_id, nombre y tipo_movimiento_id son obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id)
      VALUES ($1, $2, $3)
      RETURNING id, hogar_id, nombre, tipo_movimiento_id
      `,
      [hogar_id, nombre.trim(), tipo_movimiento_id]
    );

    return res.status(201).json({ ok: true, categoria: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando categoría', detalle: error.message });
  }
});

app.get('/etiquetas', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  try {
    const { rows } = await pool.query('SELECT id, nombre FROM etiquetas WHERE hogar_id = $1 ORDER BY nombre ASC', [hogarId]);
    return res.status(200).json({ total: rows.length, items: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando etiquetas', detalle: error.message });
  }
});

app.post('/etiquetas', exigirGestionHogar, async (req, res) => {
  const { hogar_id, nombre } = req.body;

  if (!hogar_id || !nombre) {
    return res.status(400).json({ error: 'hogar_id y nombre son obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO etiquetas (hogar_id, nombre)
      VALUES ($1, $2)
      ON CONFLICT (hogar_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id, hogar_id, nombre
      `,
      [hogar_id, nombre.trim()]
    );

    return res.status(201).json({ ok: true, etiqueta: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando etiqueta', detalle: error.message });
  }
});

app.get('/dashboard/resumen', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const ciclo = req.query.ciclo;

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (ciclo && !cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'ciclo debe tener formato YYYY-MM' });
  }

  const cicloConsulta = resolveCiclo(ciclo);
  const [anioTexto, mesTexto] = cicloConsulta.split('-');
  const desde = `${cicloConsulta}-01`;
  const hasta = `${cicloConsulta}-${String(new Date(Number(anioTexto), Number(mesTexto), 0).getDate()).padStart(2, '0')}`;

  try {
    await asegurarColumnasEstadoMovimientos();

    let rows = [];
    try {
      rows = (
        await pool.query(
          `
          SELECT
            COALESCE(SUM(CASE WHEN tm.codigo = 'ingreso' AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tm.codigo = 'egreso' AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS egresos,
            COALESCE(SUM(CASE WHEN tm.codigo = 'egreso' AND m.usa_ahorro = true AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS egresos_desde_ahorro,
            COALESCE(SUM(CASE WHEN tm.codigo = 'ahorro' AND m.fecha <= $3 THEN m.monto_ars END), 0) AS ahorros_acumulados,
            COALESCE(SUM(CASE WHEN tm.codigo = 'egreso' AND m.usa_ahorro = true AND m.fecha <= $3 THEN m.monto_ars END), 0) AS egresos_desde_ahorro_acumulados,
            COALESCE(COUNT(CASE WHEN m.fecha BETWEEN $2 AND $3 THEN 1 END), 0) AS cantidad_movimientos
          FROM movimientos m
          JOIN tipos_movimiento tm ON tm.id = m.tipo_movimiento_id
          WHERE m.hogar_id = $1
            AND m.activo = true
          `,
          [hogarId, desde, hasta]
        )
      ).rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;
      rows = (
        await pool.query(
          `
          SELECT
            COALESCE(SUM(CASE WHEN tm.codigo = 'ingreso' AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tm.codigo = 'egreso' AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS egresos,
            0 AS egresos_desde_ahorro,
            COALESCE(SUM(CASE WHEN tm.codigo = 'ahorro' AND m.fecha <= $3 THEN m.monto_ars END), 0) AS ahorros_acumulados,
            0 AS egresos_desde_ahorro_acumulados,
            COALESCE(COUNT(CASE WHEN m.fecha BETWEEN $2 AND $3 THEN 1 END), 0) AS cantidad_movimientos
          FROM movimientos m
          JOIN tipos_movimiento tm ON tm.id = m.tipo_movimiento_id
          WHERE m.hogar_id = $1
            AND m.activo = true
          `,
          [hogarId, desde, hasta]
        )
      ).rows;
    }

    const resumen = rows[0] || { ingresos: 0, egresos: 0, egresos_desde_ahorro: 0, ahorros_acumulados: 0, egresos_desde_ahorro_acumulados: 0, cantidad_movimientos: 0 };
    const ahorrosNetos = Number(resumen.ahorros_acumulados) - Number(resumen.egresos_desde_ahorro_acumulados);
    const balance = Number(resumen.ingresos) - (Number(resumen.egresos) - Number(resumen.egresos_desde_ahorro));

    return res.status(200).json({
      ingresos: Number(resumen.ingresos),
      egresos: Number(resumen.egresos),
      egresos_desde_ahorro: Number(resumen.egresos_desde_ahorro),
      ahorros: ahorrosNetos,
      balance,
      cantidad_movimientos: Number(resumen.cantidad_movimientos),
      ciclo: cicloConsulta
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando resumen', detalle: error.message });
  }
});

app.get('/cotizaciones', async (req, res) => {
  const { fecha } = req.query;

  try {
    if (fecha) {
      const { rows } = await pool.query(
        `
        SELECT fecha, fuente, compra, venta
        FROM cotizaciones_dolar
        WHERE fecha = $1
          AND fuente = 'oficial'
        ORDER BY fuente ASC
        `,
        [fecha]
      );

      return res.status(200).json({ total: rows.length, items: rows });
    }

    try {
      await sincronizarCotizacionesDesdeApiPublica();
    } catch (syncError) {
      console.warn('No se pudo sincronizar cotizaciones desde API pública:', syncError.message);
    }

    const { rows } = await pool.query(
      `
      SELECT DISTINCT ON (fuente)
        fecha,
        fuente,
        compra,
        venta
      FROM cotizaciones_dolar
      WHERE fuente = 'oficial'
      ORDER BY fuente, fecha DESC
      `
    );

    return res.status(200).json({ total: rows.length, items: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando cotizaciones', detalle: error.message });
  }
});

app.post('/cotizaciones', exigirSuperadmin, async (req, res) => {
  const { fecha, fuente, compra, venta } = req.body;

  if (!fecha || !fuente || !venta) {
    return res.status(400).json({ error: 'fecha, fuente y venta son obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO cotizaciones_dolar (fecha, fuente, compra, venta)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (fecha, fuente)
      DO UPDATE SET compra = EXCLUDED.compra, venta = EXCLUDED.venta
      RETURNING id, fecha, fuente, compra, venta
      `,
      [fecha, fuente, compra || null, venta]
    );

    return res.status(201).json({ ok: true, cotizacion: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando cotización', detalle: error.message });
  }
});

app.get('/gastos-fijos', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const ciclo = req.query.ciclo;

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (ciclo && !cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'ciclo debe tener formato YYYY-MM' });
  }

  const cicloConsulta = resolveCiclo(ciclo);

  try {
    await asegurarEstadosGastosFijosPorCiclo();
    await asegurarVigenciaGastosFijos();
    await asegurarAlcanceAjustesGastosFijos();

    let gastos = [];
    try {
      const { rows } = await pool.query(
        `
        SELECT
          gf.id,
          gf.descripcion,
          gf.moneda,
          gf.monto_base,
          gf.dia_vencimiento,
          gf.categoria_id,
          gf.activo_desde_ciclo,
          gf.activo_hasta_ciclo,
          c.nombre AS categoria,
          tm.codigo AS tipo_movimiento
        FROM gastos_fijos gf
        JOIN categorias c ON c.id = gf.categoria_id
        JOIN tipos_movimiento tm ON tm.id = c.tipo_movimiento_id
        WHERE gf.hogar_id = $1
          AND gf.activo = true
          AND (gf.activo_desde_ciclo IS NULL OR gf.activo_desde_ciclo <= $2)
          AND (gf.activo_hasta_ciclo IS NULL OR gf.activo_hasta_ciclo >= $2)
        ORDER BY gf.id DESC
        `,
        [hogarId, cicloConsulta]
      );
      gastos = rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;

      const { rows } = await pool.query(
        `
        SELECT
          gf.id,
          gf.descripcion,
          gf.moneda,
          gf.monto_base,
          gf.dia_vencimiento,
          gf.categoria_id,
          NULL::VARCHAR(7) AS activo_desde_ciclo,
          NULL::VARCHAR(7) AS activo_hasta_ciclo,
          c.nombre AS categoria,
          tm.codigo AS tipo_movimiento
        FROM gastos_fijos gf
        JOIN categorias c ON c.id = gf.categoria_id
        JOIN tipos_movimiento tm ON tm.id = c.tipo_movimiento_id
        WHERE gf.hogar_id = $1
          AND gf.activo = true
        ORDER BY gf.id DESC
        `,
        [hogarId]
      );
      gastos = rows;
    }

    const fechaInicioCiclo = `${cicloConsulta}-01`;
    const fechaCorte = finDeCiclo(cicloConsulta).toISOString().slice(0, 10);
    const items = [];

    for (const gasto of gastos) {
      const { rows: ajustes } = await pool.query(
        `
        SELECT tipo_ajuste, valor
        FROM ajustes_gastos_fijos
        WHERE gasto_fijo_id = $1
          AND fecha_aplicacion <= $2
          AND (ciclo_hasta_aplicacion IS NULL OR ciclo_hasta_aplicacion >= $3)
        ORDER BY fecha_aplicacion ASC, id ASC
        `,
        [gasto.id, fechaCorte, cicloConsulta]
      );

      const { rows: estadoRows } = await pool.query(
        `
        SELECT estado_egreso, estado_ingreso
        FROM estados_gastos_fijos_ciclo
        WHERE gasto_fijo_id = $1
          AND ciclo = $2
        LIMIT 1
        `,
        [gasto.id, cicloConsulta]
      );

      const { rows: ajusteCicloRows } = await pool.query(
        `
        SELECT 1
        FROM ajustes_gastos_fijos
        WHERE gasto_fijo_id = $1
          AND fecha_aplicacion >= $2
          AND fecha_aplicacion <= $3
          AND (ciclo_hasta_aplicacion IS NULL OR ciclo_hasta_aplicacion >= $4)
        LIMIT 1
        `,
        [gasto.id, fechaInicioCiclo, fechaCorte, cicloConsulta]
      );

      const montoVigente = aplicarAjustes(gasto.monto_base, ajustes);
      const estadoCiclo = estadoRows[0] || {};
      items.push({
        ...gasto,
        ciclo: cicloConsulta,
        ajuste_en_ciclo: ajusteCicloRows.length > 0,
        estado_egreso: estadoCiclo.estado_egreso || null,
        estado_ingreso: estadoCiclo.estado_ingreso || null,
        monto_vigente: Number(montoVigente.toFixed(2))
      });
    }

    return res.status(200).json({ total: items.length, items });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando gastos fijos', detalle: error.message });
  }
});

app.post('/gastos-fijos', exigirGestionHogar, async (req, res) => {
  const { hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento, ciclo_desde, ciclo_hasta } = req.body;

  if (!hogar_id || !categoria_id || !descripcion || !moneda || !monto_base) {
    return res.status(400).json({ error: 'hogar_id, categoria_id, descripcion, moneda y monto_base son obligatorios' });
  }

  if (!['ARS', 'USD'].includes(moneda)) {
    return res.status(400).json({ error: 'moneda debe ser ARS o USD' });
  }

  if (ciclo_desde && !cicloEsValido(ciclo_desde)) {
    return res.status(400).json({ error: 'ciclo_desde debe tener formato YYYY-MM' });
  }

  if (ciclo_hasta && !cicloEsValido(ciclo_hasta)) {
    return res.status(400).json({ error: 'ciclo_hasta debe tener formato YYYY-MM' });
  }

  if (ciclo_desde && ciclo_hasta && ciclo_hasta < ciclo_desde) {
    return res.status(400).json({ error: 'ciclo_hasta no puede ser anterior a ciclo_desde' });
  }

  try {
    await asegurarVigenciaGastosFijos();

    const { rows: categoriaRows } = await pool.query(
      'SELECT id FROM categorias WHERE id = $1 AND hogar_id = $2 AND activo = true',
      [categoria_id, hogar_id]
    );
    if (categoriaRows.length === 0) {
      return res.status(400).json({ error: 'La categoria no existe para este hogar' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO gastos_fijos (hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento, activo_desde_ciclo, activo_hasta_ciclo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento, activo_desde_ciclo, activo_hasta_ciclo
      `,
      [hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento || null, ciclo_desde || resolveCiclo(), ciclo_hasta || null]
    );

    return res.status(201).json({ ok: true, gasto_fijo: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando gasto fijo', detalle: error.message });
  }
});

app.patch('/gastos-fijos/:id', async (req, res) => {
  const gastoFijoId = Number(req.params.id);
  const { descripcion, categoria_id, moneda, monto_base, dia_vencimiento, activo_desde_ciclo, activo_hasta_ciclo } = req.body;
  const payload = req.body || {};
  const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);

  if (!gastoFijoId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  if (moneda && !['ARS', 'USD'].includes(moneda)) {
    return res.status(400).json({ error: 'moneda debe ser ARS o USD' });
  }

  if (activo_desde_ciclo && !cicloEsValido(activo_desde_ciclo)) {
    return res.status(400).json({ error: 'activo_desde_ciclo debe tener formato YYYY-MM' });
  }

  if (activo_hasta_ciclo && !cicloEsValido(activo_hasta_ciclo)) {
    return res.status(400).json({ error: 'activo_hasta_ciclo debe tener formato YYYY-MM' });
  }

  try {
    await asegurarVigenciaGastosFijos();

    const { rows: permisoRows } = await pool.query(
      'SELECT hogar_id, activo_desde_ciclo, activo_hasta_ciclo FROM gastos_fijos WHERE id = $1',
      [gastoFijoId]
    );
    if (permisoRows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }
    if (!puedeGestionarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para gestionar valores fijos' });
    }

    if (categoria_id) {
      const { rows: categoriaRows } = await pool.query(
        'SELECT id FROM categorias WHERE id = $1 AND hogar_id = $2 AND activo = true',
        [categoria_id, Number(permisoRows[0].hogar_id)]
      );
      if (categoriaRows.length === 0) {
        return res.status(400).json({ error: 'La categoria no existe para este hogar' });
      }
    }

    const activoDesdeFinal = hasField('activo_desde_ciclo')
      ? activo_desde_ciclo || null
      : permisoRows[0].activo_desde_ciclo;
    const activoHastaFinal = hasField('activo_hasta_ciclo')
      ? activo_hasta_ciclo || null
      : permisoRows[0].activo_hasta_ciclo;

    if (activoDesdeFinal && activoHastaFinal && activoHastaFinal < activoDesdeFinal) {
      return res.status(400).json({ error: 'activo_hasta_ciclo no puede ser anterior a activo_desde_ciclo' });
    }

    const { rows } = await pool.query(
      `
      UPDATE gastos_fijos
      SET descripcion = CASE WHEN $1 THEN $2 ELSE descripcion END,
          categoria_id = CASE WHEN $3 THEN $4 ELSE categoria_id END,
          moneda = CASE WHEN $5 THEN $6 ELSE moneda END,
          monto_base = CASE WHEN $7 THEN $8 ELSE monto_base END,
          dia_vencimiento = CASE WHEN $9 THEN $10 ELSE dia_vencimiento END,
          activo_desde_ciclo = CASE WHEN $11 THEN $12 ELSE activo_desde_ciclo END,
          activo_hasta_ciclo = CASE WHEN $13 THEN $14 ELSE activo_hasta_ciclo END,
          actualizado_en = NOW()
      WHERE id = $15 AND activo = true
      RETURNING id, descripcion, categoria_id, moneda, monto_base, dia_vencimiento, activo_desde_ciclo, activo_hasta_ciclo
      `,
      [
        hasField('descripcion'),
        descripcion ?? null,
        hasField('categoria_id'),
        categoria_id ?? null,
        hasField('moneda'),
        moneda ?? null,
        hasField('monto_base'),
        monto_base ?? null,
        hasField('dia_vencimiento'),
        dia_vencimiento ?? null,
        hasField('activo_desde_ciclo'),
        activo_desde_ciclo || null,
        hasField('activo_hasta_ciclo'),
        activo_hasta_ciclo || null,
        gastoFijoId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }

    return res.status(200).json({ ok: true, valor_fijo: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando valor fijo', detalle: error.message });
  }
});

app.delete('/gastos-fijos/:id', async (req, res) => {
  const gastoFijoId = Number(req.params.id);
  const ciclo = req.query.ciclo;

  if (!gastoFijoId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  if (ciclo && !cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'ciclo debe tener formato YYYY-MM' });
  }

  try {
    await asegurarVigenciaGastosFijos();

    const { rows: permisoRows } = await pool.query('SELECT hogar_id FROM gastos_fijos WHERE id = $1', [gastoFijoId]);
    if (permisoRows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }
    if (!puedeGestionarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para finalizar valores fijos' });
    }

    const cicloFinalizacion = ciclo || resolveCiclo();
    const ultimoCicloActivo = cicloAnterior(cicloFinalizacion);

    const { rows } = await pool.query(
      `
      UPDATE gastos_fijos
      SET activo_hasta_ciclo = $1,
          actualizado_en = NOW()
      WHERE id = $2 AND activo = true
      RETURNING id, activo_desde_ciclo, activo_hasta_ciclo
      `,
      [ultimoCicloActivo, gastoFijoId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }

    return res.status(200).json({
      ok: true,
      valor_fijo: {
        ...rows[0],
        ciclo_finalizacion: cicloFinalizacion,
        ultimo_ciclo_activo: ultimoCicloActivo
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error eliminando valor fijo por ciclo', detalle: error.message });
  }
});

app.get('/cierres-ciclo/estado', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const ciclo = String(req.query.ciclo || '');

  if (!hogarId || !cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'hogar_id y ciclo validos son obligatorios' });
  }

  try {
    await asegurarCierresCiclo();
    const { rows } = await pool.query(
      `SELECT id, hogar_id, ciclo, balance_calculado, saldo_real_final, diferencia, genera_saldo_inicial, creado_en
       FROM cierres_ciclo
       WHERE hogar_id = $1 AND ciclo = $2`,
      [hogarId, ciclo]
    );
    return res.status(200).json({ cerrado: rows.length > 0, cierre: rows[0] || null });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando cierre de ciclo', detalle: error.message });
  }
});

app.post('/cierres-ciclo', exigirGestionHogar, async (req, res) => {
  const { hogar_id, ciclo, balance_calculado, saldo_real_final, genera_saldo_inicial = true, creado_por_usuario_id } = req.body;
  const creadorId = Number(req.usuario?.id || creado_por_usuario_id);
  const balanceCalculadoFinal = Number(balance_calculado);
  const saldoRealFinal =
    saldo_real_final === undefined || saldo_real_final === null || String(saldo_real_final).trim() === ''
      ? balanceCalculadoFinal
      : Number(saldo_real_final);

  if (!hogar_id || !cicloEsValido(ciclo) || balance_calculado == null || !creadorId || !Number.isFinite(balanceCalculadoFinal) || !Number.isFinite(saldoRealFinal)) {
    return res.status(400).json({ error: 'hogar_id, ciclo, balance_calculado y creador son obligatorios; saldo_real_final es opcional pero debe ser numerico si se envia' });
  }

  const client = await pool.connect();
  try {
    await asegurarColumnasEstadoMovimientos();
    await asegurarCategoriasBase(Number(hogar_id));
    await asegurarCierresCiclo();
    await client.query('BEGIN');

    const existente = await client.query('SELECT id FROM cierres_ciclo WHERE hogar_id = $1 AND ciclo = $2', [hogar_id, ciclo]);
    if (existente.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El ciclo ya esta cerrado' });
    }

    const diferencia = saldoRealFinal - balanceCalculadoFinal;
    const { rows: tiposRows } = await client.query(`SELECT id, codigo FROM tipos_movimiento WHERE codigo IN ('ingreso', 'egreso')`);
    const tipoIds = Object.fromEntries(tiposRows.map((row) => [row.codigo, Number(row.id)]));
    const { rows: categoriasRows } = await client.query(
      `SELECT c.id, c.nombre, tm.codigo AS tipo
       FROM categorias c
       JOIN tipos_movimiento tm ON tm.id = c.tipo_movimiento_id
       WHERE c.hogar_id = $1 AND c.nombre IN ('Ajuste de cierre', 'Arrastre de cierre')`,
      [hogar_id]
    );
    const categoriaPorClave = Object.fromEntries(categoriasRows.map((row) => [`${row.nombre}:${row.tipo}`, Number(row.id)]));

    if (diferencia !== 0) {
      const tipo = diferencia > 0 ? 'ingreso' : 'egreso';
      await client.query(
        `INSERT INTO movimientos (
          hogar_id, cuenta_id, tipo_movimiento_id, categoria_id, fecha, descripcion, moneda_original, monto_original, monto_ars,
          usa_ahorro, estado_egreso, estado_ingreso, clasificacion_movimiento, referencia_ciclo_cierre, creado_por_usuario_id
        ) VALUES ($1,$2,$3,$4,$5,$6,'ARS',$7,$7,false,$8,$9,'ajuste_cierre',$10,$11)`,
        [
          hogar_id,
          1,
          tipoIds[tipo],
          categoriaPorClave[`Ajuste de cierre:${tipo}`] || null,
          finDeCiclo(ciclo).toISOString().slice(0, 10),
          `Ajuste de cierre ${ciclo}`,
          Math.abs(diferencia),
          tipo === 'egreso' ? 'pagado' : null,
          tipo === 'ingreso' ? 'registrado' : null,
          ciclo,
          creadorId
        ]
      );
    }

    if (Boolean(genera_saldo_inicial) && saldoRealFinal !== 0) {
      const tipo = saldoRealFinal > 0 ? 'ingreso' : 'egreso';
      await client.query(
        `INSERT INTO movimientos (
          hogar_id, cuenta_id, tipo_movimiento_id, categoria_id, fecha, descripcion, moneda_original, monto_original, monto_ars,
          usa_ahorro, estado_egreso, estado_ingreso, clasificacion_movimiento, referencia_ciclo_cierre, creado_por_usuario_id
        ) VALUES ($1,$2,$3,$4,$5,$6,'ARS',$7,$7,false,$8,$9,'saldo_inicial',$10,$11)`,
        [
          hogar_id,
          1,
          tipoIds[tipo],
          categoriaPorClave[`Arrastre de cierre:${tipo}`] || null,
          `${siguienteCiclo(ciclo)}-01`,
          `Saldo inicial arrastrado desde ${ciclo}`,
          Math.abs(saldoRealFinal),
          tipo === 'egreso' ? 'pagado' : null,
          tipo === 'ingreso' ? 'registrado' : null,
          ciclo,
          creadorId
        ]
      );
    }

    const cierre = await client.query(
      `INSERT INTO cierres_ciclo (hogar_id, ciclo, balance_calculado, saldo_real_final, diferencia, genera_saldo_inicial, creado_por_usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, hogar_id, ciclo, balance_calculado, saldo_real_final, diferencia, genera_saldo_inicial, creado_en`,
      [hogar_id, ciclo, balanceCalculadoFinal, saldoRealFinal, diferencia, Boolean(genera_saldo_inicial), creadorId]
    );

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, cierre: cierre.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error cerrando ciclo', detalle: error.message });
  } finally {
    client.release();
  }
});

app.delete('/cierres-ciclo', exigirGestionHogar, async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const ciclo = String(req.query.ciclo || '');

  if (!hogarId || !cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'hogar_id y ciclo validos son obligatorios' });
  }

  const client = await pool.connect();
  try {
    await asegurarColumnasEstadoMovimientos();
    await asegurarCierresCiclo();
    await client.query('BEGIN');
    const cierre = await client.query('SELECT id FROM cierres_ciclo WHERE hogar_id = $1 AND ciclo = $2', [hogarId, ciclo]);
    if (cierre.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'El ciclo no estaba cerrado' });
    }

    await client.query(
      `UPDATE movimientos
       SET activo = false, eliminado_en = NOW()
       WHERE hogar_id = $1
         AND referencia_ciclo_cierre = $2
         AND clasificacion_movimiento IN ('ajuste_cierre', 'saldo_inicial')
         AND activo = true`,
      [hogarId, ciclo]
    );
    await client.query('DELETE FROM cierres_ciclo WHERE hogar_id = $1 AND ciclo = $2', [hogarId, ciclo]);
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, ciclo });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error reabriendo ciclo', detalle: error.message });
  } finally {
    client.release();
  }
});

app.post('/gastos-fijos/:id/ajustes', async (req, res) => {
  const gastoFijoId = Number(req.params.id);
  const { fecha_aplicacion, ciclo_aplicacion, alcance, tipo_ajuste, valor, nota } = req.body;
  const fechaAplicacionFinal = ciclo_aplicacion ? `${ciclo_aplicacion}-01` : fecha_aplicacion;
  const cicloHastaAplicacion =
    alcance === 'solo_ciclo'
      ? (ciclo_aplicacion || (fechaAplicacionFinal ? String(fechaAplicacionFinal).slice(0, 7) : null))
      : null;

  if (!gastoFijoId || !fechaAplicacionFinal || !tipo_ajuste || valor === undefined || valor === null || String(valor).trim() === '') {
    return res.status(400).json({ error: 'id, ciclo_aplicacion/fecha_aplicacion, tipo_ajuste y valor son obligatorios' });
  }

  if (!['porcentaje', 'monto_fijo'].includes(tipo_ajuste)) {
    return res.status(400).json({ error: "tipo_ajuste debe ser 'porcentaje' o 'monto_fijo'" });
  }

  if (ciclo_aplicacion && !cicloEsValido(ciclo_aplicacion)) {
    return res.status(400).json({ error: 'ciclo_aplicacion debe tener formato YYYY-MM' });
  }

  if (alcance && !['solo_ciclo', 'desde_ciclo'].includes(alcance)) {
    return res.status(400).json({ error: "alcance debe ser 'solo_ciclo' o 'desde_ciclo'" });
  }

  if (!parseFecha(fechaAplicacionFinal)) {
    return res.status(400).json({ error: 'fecha_aplicacion debe tener formato YYYY-MM-DD' });
  }

  if (!Number.isFinite(Number(valor)) || Number(valor) === 0) {
    return res.status(400).json({ error: 'valor debe ser un numero distinto de 0' });
  }

  try {
    await asegurarVigenciaGastosFijos();
    await asegurarAlcanceAjustesGastosFijos();

    const { rows: permisoRows } = await pool.query('SELECT hogar_id FROM gastos_fijos WHERE id = $1', [gastoFijoId]);
    if (permisoRows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }
    if (!puedeGestionarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para ajustar valores fijos' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO ajustes_gastos_fijos (gasto_fijo_id, fecha_aplicacion, ciclo_hasta_aplicacion, tipo_ajuste, valor, nota)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, gasto_fijo_id, fecha_aplicacion, ciclo_hasta_aplicacion, tipo_ajuste, valor, nota
      `,
      [gastoFijoId, fechaAplicacionFinal, cicloHastaAplicacion, tipo_ajuste, Number(valor), nota || null]
    );

    return res.status(201).json({ ok: true, ajuste: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando ajuste de gasto fijo', detalle: error.message });
  }
});

app.patch('/gastos-fijos/:id/estado-ciclo', async (req, res) => {
  const gastoFijoId = Number(req.params.id);
  const { ciclo, estado_egreso, estado_ingreso } = req.body;

  if (!gastoFijoId || !ciclo) {
    return res.status(400).json({ error: 'id y ciclo son obligatorios' });
  }

  if (!cicloEsValido(ciclo)) {
    return res.status(400).json({ error: 'ciclo debe tener formato YYYY-MM' });
  }

  if (estado_egreso && !['pendiente', 'pagado'].includes(estado_egreso)) {
    return res.status(400).json({ error: "estado_egreso debe ser 'pendiente' o 'pagado'" });
  }

  if (estado_ingreso && !['proyectado', 'registrado'].includes(estado_ingreso)) {
    return res.status(400).json({ error: "estado_ingreso debe ser 'proyectado' o 'registrado'" });
  }

  if (!estado_egreso && !estado_ingreso) {
    return res.status(400).json({ error: 'Debe enviarse estado_egreso o estado_ingreso' });
  }

  try {
    await asegurarEstadosGastosFijosPorCiclo();

    const { rows: permisoRows } = await pool.query('SELECT hogar_id FROM gastos_fijos WHERE id = $1', [gastoFijoId]);
    if (permisoRows.length === 0) {
      return res.status(404).json({ error: 'Valor fijo no encontrado' });
    }
    if (!puedeOperarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para operar este valor fijo' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO estados_gastos_fijos_ciclo (gasto_fijo_id, ciclo, estado_egreso, estado_ingreso)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (gasto_fijo_id, ciclo)
      DO UPDATE SET
        estado_egreso = COALESCE(EXCLUDED.estado_egreso, estados_gastos_fijos_ciclo.estado_egreso),
        estado_ingreso = COALESCE(EXCLUDED.estado_ingreso, estados_gastos_fijos_ciclo.estado_ingreso),
        actualizado_en = NOW()
      RETURNING id, gasto_fijo_id, ciclo, estado_egreso, estado_ingreso
      `,
      [gastoFijoId, ciclo, estado_egreso ?? null, estado_ingreso ?? null]
    );

    return res.status(200).json({ ok: true, estado_ciclo: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando estado de valor fijo por ciclo', detalle: error.message });
  }
});

if (require.main === module) {
  const port = Number(process.env.API_PORT || 3000);
  app.listen(port, () => {
    console.log(`finanzas-backend escuchando en http://localhost:${port}`);
    asegurarDatosColon260().catch((error) => {
      console.error('No se pudo asegurar datos iniciales de Colon 260', error);
    });
  });
}

module.exports = app;
