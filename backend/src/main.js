const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);
const FRONTEND_URL = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = envFlag(process.env.SMTP_SECURE);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || '').trim();
const ROLES_HOGAR = ['superadmin', 'hogar_admin', 'hogar_member'];
const ROLES_GESTION_HOGAR = ['hogar_admin', 'hogar_member'];
const HOGAR_COLON_260_ID = 1;
const USUARIO_JOAQUIN_ID = 1;
const USUARIO_SOFIA_ID = 2;
const CATEGORIAS_BASE = [
  { nombre: 'Sueldo', tipoMovimiento: 'ingreso' },
  { nombre: 'Sueldo tarjeta', tipoMovimiento: 'ingreso' },
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

function fechaIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function fechaHoyArgentina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function esNumeroPositivo(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function parseNumeroDecimal(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim();
  if (!raw) return Number.NaN;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  return Number(normalized);
}

function tieneHastaDosDecimales(value) {
  if (typeof value === 'number') return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
  const raw = String(value ?? '').trim();
  if (!raw.includes(',') && /\.(?=\d{3}(?:\D|$))/.test(raw)) return true;
  const separatorIndex = raw.includes(',') ? raw.lastIndexOf(',') : raw.lastIndexOf('.');
  if (separatorIndex === -1) return true;
  return raw.slice(separatorIndex + 1).replace(/\D/g, '').length <= 2;
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

function formatCycleLabelBackend(ciclo) {
  if (!cicloEsValido(ciclo)) return String(ciclo || '');
  const label = new Date(`${ciclo}-01T00:00:00`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
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

function generarPasswordResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function evaluarPasswordResetToken(resetToken) {
  if (!resetToken) {
    return {
      valid: false,
      error: 'Token invalido o inexistente'
    };
  }

  if (resetToken.consumido_en) {
    return {
      valid: false,
      error: 'El token ya fue usado'
    };
  }

  const expiraEn = new Date(resetToken.expira_en);
  if (Number.isNaN(expiraEn.getTime()) || expiraEn.getTime() <= Date.now()) {
    return {
      valid: false,
      error: 'El token esta vencido'
    };
  }

  return { valid: true };
}

async function buscarPasswordResetToken(client, token, options = {}) {
  const tokenHash = hashPasswordResetToken(token);
  const forUpdate = options.forUpdate ? '\n    FOR UPDATE' : '';
  const { rows } = await client.query(
    `
    SELECT id, usuario_id, expira_en, consumido_en
    FROM password_reset_tokens
    WHERE token_hash = $1
    LIMIT 1
    ${forUpdate}
    `,
    [tokenHash]
  );
  return rows[0] || null;
}

function getFrontendUrlFromRequest(req) {
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin) return origin;

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  }

  const corsOrigins = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((value) => value !== '*');

  return corsOrigins[0] || '';
}

function resolvePasswordResetUrl(req, token) {
  const frontendUrl = FRONTEND_URL || getFrontendUrlFromRequest(req);
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL no esta configurada');
  }
  return `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSmtpTransport() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('Faltan variables SMTP para enviar email');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

async function enviarEmailResetPassword({ to, resetUrl }) {
  const transporter = getSmtpTransport();
  const safeResetUrl = escapeHtml(resetUrl);
  const ttlLabel = PASSWORD_RESET_TTL_MINUTES === 1 ? '1 minuto' : `${PASSWORD_RESET_TTL_MINUTES} minutos`;
  const logoUrl = (() => {
    try {
      return `${new URL(resetUrl).origin}/finanzapp-logo.png`;
    } catch {
      return '';
    }
  })();
  const safeLogoUrl = escapeHtml(logoUrl);

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Recuperacion de acceso - FinanzApp',
    text: `Recibimos una solicitud para recuperar el acceso a tu cuenta de FinanzApp.\n\nAbri este enlace para crear una nueva password:\n${resetUrl}\n\nEl enlace vence en ${ttlLabel}. Si no fuiste vos, podes ignorar este email.`,
    html: `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Recuperacion de acceso</title>
        </head>
        <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Manrope,Arial,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;margin:0;padding:30px 14px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 44px rgba(15,23,42,0.10);">
                  <tr>
                    <td style="padding:28px 28px 18px;text-align:center;background:#ffffff;">
                      ${safeLogoUrl ? `<img src="${safeLogoUrl}" width="86" height="86" alt="FinanzApp" style="display:block;width:86px;height:86px;object-fit:contain;margin:0 auto 16px;border:0;">` : ''}
                      <div style="margin:0 0 8px;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:1px;color:#2563eb;text-transform:uppercase;">FinanzApp</div>
                      <h1 style="margin:0;font-size:24px;line-height:1.18;color:#0f172a;font-weight:800;">Recuperacion de acceso</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 28px;">
                      <div style="height:1px;background:#e2e8f0;margin:0 0 24px;"></div>
                      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">Recibimos una solicitud para recuperar el acceso a tu cuenta.</p>
                      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#64748b;">Crea una nueva password desde el boton. Por seguridad, el enlace vence en <strong style="color:#0f172a;">${ttlLabel}</strong>.</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
                        <tr>
                          <td style="border-radius:12px;background:linear-gradient(135deg,#2563eb,#0f766e);box-shadow:0 14px 26px rgba(37,99,235,0.20);">
                            <a href="${safeResetUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;">Crear nueva password</a>
                          </td>
                        </tr>
                      </table>
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
                        <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#64748b;">Si el boton no funciona, usa este enlace:</p>
                        <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.5;color:#2563eb;">${safeResetUrl}</p>
                      </div>
                      <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#64748b;text-align:center;">Si no fuiste vos, ignora este email. Tu password actual se mantiene igual.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `
  });
}

function validarFormatoPassword(password) {
  const value = String(password || '');
  if (value.length < 8) {
    return 'La password debe tener al menos 8 caracteres';
  }
  if (!/[a-z]/.test(value)) {
    return 'La password debe incluir una minuscula';
  }
  if (!/[A-Z]/.test(value)) {
    return 'La password debe incluir una mayuscula';
  }
  if (!/\d/.test(value)) {
    return 'La password debe incluir un numero';
  }
  return '';
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

function exigirOperacionHogar(req, res, next) {
  const hogarId = Number(req.query.hogar_id || req.body?.hogar_id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (!puedeOperarHogar(req.usuario, hogarId)) {
    return res.status(403).json({ error: 'No tenes permisos para operar en este hogar' });
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
    SELECT u.id, u.correo, u.nombre, u.rol_global, u.force_password_change
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
    force_password_change: Boolean(usuario.force_password_change),
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

function usuarioAuditoriaId(req) {
  const usuarioId = Number(req?.usuario?.id);
  return Number.isFinite(usuarioId) && usuarioId > 0 ? usuarioId : USUARIO_JOAQUIN_ID;
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
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS origen VARCHAR(40)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS referencia_tarjeta_id BIGINT REFERENCES tarjetas_credito(id)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS referencia_cierre_tarjeta_id BIGINT REFERENCES cierres_tarjeta(id)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id)
  `);
  await pool.query(`
    ALTER TABLE movimientos
    ADD COLUMN IF NOT EXISTS eliminado_por_usuario_id BIGINT REFERENCES usuarios(id)
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
  await pool.query('CREATE INDEX IF NOT EXISTS idx_movimientos_hogar_activo_fecha ON movimientos (hogar_id, activo, fecha DESC, id DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_movimientos_hogar_fecha ON movimientos (hogar_id, fecha DESC, id DESC)');
}

let columnasEstadoMovimientosAseguradas = false;

async function asegurarColumnasEstadoMovimientosLectura() {
  if (columnasEstadoMovimientosAseguradas) return;
  await asegurarColumnasEstadoMovimientos();
  columnasEstadoMovimientosAseguradas = true;
}

async function asegurarAuditoriaUsuarios() {
  const tablas = [
    'hogares',
    'hogares_usuarios',
    'cuentas',
    'categorias',
    'etiquetas',
    'cotizaciones_dolar',
    'gastos_fijos',
    'ajustes_gastos_fijos',
    'estados_gastos_fijos_ciclo',
    'tarjetas_credito',
    'cierres_tarjeta',
    'consumos_tarjeta'
  ];

  for (const tabla of tablas) {
    await pool.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS creado_por_usuario_id BIGINT REFERENCES usuarios(id)`);
    await pool.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id)`);
    await pool.query(
      `UPDATE ${tabla}
       SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, $1),
           actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, $1)
       WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL`,
      [USUARIO_JOAQUIN_ID]
    );
  }

  await pool.query('ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id)');
  await pool.query('ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS eliminado_por_usuario_id BIGINT REFERENCES usuarios(id)');
  await pool.query(
    `UPDATE movimientos
     SET creado_por_usuario_id = COALESCE(creado_por_usuario_id, $1),
         actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, $1)
     WHERE creado_por_usuario_id IS NULL OR actualizado_por_usuario_id IS NULL`,
    [USUARIO_JOAQUIN_ID]
  );
  await pool.query('ALTER TABLE consumos_tarjeta ADD COLUMN IF NOT EXISTS eliminado_por_usuario_id BIGINT REFERENCES usuarios(id)');
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
        ALTER TABLE cierres_ciclo ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id BIGINT REFERENCES usuarios(id);
      END IF;
    END $$;
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
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE
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

async function asegurarPasswordResetTokens() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expira_en TIMESTAMPTZ NOT NULL,
      consumido_en TIMESTAMPTZ,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario_id
    ON password_reset_tokens (usuario_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expira_en
    ON password_reset_tokens (expira_en)
  `);
}

async function asegurarTarjetasCredito({ recalcular = true } = {}) {
  await pool.query(`
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
    )
  `);
  await pool.query(`
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
    )
  `);
  await pool.query('ALTER TABLE cierres_tarjeta ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await pool.query('ALTER TABLE cierres_tarjeta ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await pool.query(`
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
    )
  `);
  await pool.query('ALTER TABLE consumos_tarjeta ADD COLUMN IF NOT EXISTS repite_mes_siguiente BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query(`
    UPDATE tarjetas_credito tc
    SET nombre = 'Tarjeta MercadoPago',
        actualizado_en = NOW()
    WHERE LOWER(tc.nombre) = LOWER('Tarjeta principal')
      AND NOT EXISTS (
        SELECT 1
        FROM tarjetas_credito existente
        WHERE existente.hogar_id = tc.hogar_id
          AND LOWER(existente.nombre) = LOWER('Tarjeta MercadoPago')
      )
  `);
  if (recalcular) {
    await pool.query(`
      UPDATE consumos_tarjeta
      SET repite_mes_siguiente = CASE
        WHEN LOWER(COALESCE(categoria, '')) IN ('suscripcion', 'suscripciones') AND cantidad_cuotas = 1 THEN true
        ELSE false
      END
    `);
  }
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tarjetas_credito_hogar ON tarjetas_credito (hogar_id, activa)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_cierres_tarjeta_tarjeta_ciclo ON cierres_tarjeta (tarjeta_id, ciclo)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_consumos_tarjeta_cierre ON consumos_tarjeta (cierre_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_consumos_tarjeta_tarjeta_fecha ON consumos_tarjeta (tarjeta_id, fecha_compra)');
  if (recalcular) await recalcularAsignacionConsumosTarjeta();
}

async function asegurarDatosColon260() {
  await asegurarModeloMultiHogar();
  await asegurarPasswordResetTokens();
  await asegurarTarjetasCredito();

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
  await asegurarAuditoriaUsuarios();
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

  await pool.query('UPDATE cuentas SET hogar_id = $1 WHERE hogar_id IS NULL', [HOGAR_COLON_260_ID]);
  await pool.query('UPDATE categorias SET hogar_id = $1 WHERE hogar_id IS NULL', [HOGAR_COLON_260_ID]);
  await pool.query('UPDATE etiquetas SET hogar_id = $1 WHERE hogar_id IS NULL', [HOGAR_COLON_260_ID]);
  await pool.query(
    `
    UPDATE movimientos
    SET creado_por_usuario_id = CASE
          WHEN creado_por_usuario_id IN ($2, $3) THEN creado_por_usuario_id
          ELSE $2
        END
    WHERE hogar_id = $1
      AND (
        creado_por_usuario_id IS NULL
        OR creado_por_usuario_id NOT IN ($2, $3)
      )
    `,
    [HOGAR_COLON_260_ID, USUARIO_JOAQUIN_ID, USUARIO_SOFIA_ID]
  );
  await pool.query('UPDATE gastos_fijos SET hogar_id = $1 WHERE hogar_id IS NULL', [HOGAR_COLON_260_ID]);
  await asegurarCategoriasBaseTodosHogares(USUARIO_JOAQUIN_ID);
  await ordenarCategoriasPorHogar(USUARIO_JOAQUIN_ID);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
        UPDATE cierres_ciclo
        SET creado_por_usuario_id = CASE
              WHEN creado_por_usuario_id IN (${USUARIO_JOAQUIN_ID}, ${USUARIO_SOFIA_ID}) THEN creado_por_usuario_id
              ELSE ${USUARIO_JOAQUIN_ID}
            END,
            actualizado_por_usuario_id = COALESCE(actualizado_por_usuario_id, creado_por_usuario_id, ${USUARIO_JOAQUIN_ID})
        WHERE hogar_id = ${HOGAR_COLON_260_ID}
          AND (
            creado_por_usuario_id IS NULL
            OR creado_por_usuario_id NOT IN (${USUARIO_JOAQUIN_ID}, ${USUARIO_SOFIA_ID})
            OR actualizado_por_usuario_id IS NULL
          );
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
      actualizado_por_usuario_id BIGINT REFERENCES usuarios(id),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hogar_id, ciclo)
    )
  `);
  await asegurarAuditoriaUsuarios();
}

function siguienteCiclo(ciclo) {
  if (!cicloEsValido(ciclo)) return null;
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const fecha = new Date(Number(anioTexto), Number(mesTexto), 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function sumarMesesCiclo(ciclo, offset) {
  if (!cicloEsValido(ciclo)) return null;
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const fecha = new Date(Number(anioTexto), Number(mesTexto) - 1 + Number(offset || 0), 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function compararCiclos(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function calcularCuotaInicialCompra(cantidadCuotas, cuotaActual, cuotaInicial, cicloAsignado, fechaCompra) {
  const cuotas = Math.max(Number(cantidadCuotas || 1), 1);
  const tieneCuotaActual = cuotaActual !== undefined && cuotaActual !== null && String(cuotaActual).trim() !== '';
  const tieneCuotaInicial = cuotaInicial !== undefined && cuotaInicial !== null && String(cuotaInicial).trim() !== '';
  const informada = Number(tieneCuotaActual ? cuotaActual : tieneCuotaInicial ? cuotaInicial : 1);
  const cuota = Number.isInteger(informada) && informada >= 1 && informada <= cuotas ? informada : 1;
  if (tieneCuotaActual || tieneCuotaInicial) return cuota;
  const cicloCompra = fechaIso(fechaCompra).slice(0, 7);
  return cicloAsignado && compararCiclos(cicloAsignado, cicloCompra) >= 0 ? 1 : cuota;
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function esCategoriaSuscripcion(categoria) {
  const normalized = normalizarTexto(categoria);
  return normalized === 'suscripcion' || normalized === 'suscripciones';
}

function fechaPorDiaDeCiclo(ciclo, dia) {
  if (!cicloEsValido(ciclo) || !dia) return null;
  const [anioTexto, mesTexto] = String(ciclo).split('-');
  const anio = Number(anioTexto);
  const mesIndex = Number(mesTexto) - 1;
  const ultimoDia = new Date(anio, mesIndex + 1, 0).getDate();
  return `${ciclo}-${String(Math.min(Number(dia), ultimoDia)).padStart(2, '0')}`;
}

async function obtenerOCrearCierreTarjeta(tarjeta, ciclo, usuarioId = null, db = pool) {
  if (!tarjeta?.id || !cicloEsValido(ciclo)) return null;
  const fechaCierreDefault = fechaPorDiaDeCiclo(ciclo, tarjeta.dia_cierre_default);
  const fechaVencimientoDefault = tarjeta.dia_vencimiento_default
    ? fechaPorDiaDeCiclo(ciclo, tarjeta.dia_vencimiento_default)
    : null;

  const { rows: insertRows } = await db.query(
    `
    INSERT INTO cierres_tarjeta (tarjeta_id, ciclo, fecha_cierre, fecha_vencimiento, creado_por_usuario_id, actualizado_por_usuario_id)
    VALUES ($1, $2, $3, $4, $5, $5)
    ON CONFLICT (tarjeta_id, ciclo) DO NOTHING
    RETURNING id, tarjeta_id, ciclo, fecha_cierre, fecha_vencimiento, estado,
              creado_en, actualizado_en, created_at, updated_at
    `,
    [tarjeta.id, ciclo, fechaCierreDefault, fechaVencimientoDefault, usuarioId]
  );
  if (insertRows.length > 0) return insertRows[0];

  const { rows } = await db.query(
    `
    SELECT id, tarjeta_id, ciclo, fecha_cierre, fecha_vencimiento, estado,
           creado_en, actualizado_en, created_at, updated_at
    FROM cierres_tarjeta
    WHERE tarjeta_id = $1 AND ciclo = $2
    LIMIT 1
    `,
    [tarjeta.id, ciclo]
  );
  return rows[0] || null;
}

async function obtenerCierreTarjetaPorFechaCompra(tarjeta, fechaCompraIso, db = pool) {
  if (!tarjeta?.id || !fechaCompraIso) return null;
  const { rows } = await db.query(
    `
    SELECT id, tarjeta_id, ciclo, fecha_cierre, fecha_vencimiento, estado,
           creado_en, actualizado_en, created_at, updated_at
    FROM cierres_tarjeta
    WHERE tarjeta_id = $1
      AND fecha_cierre >= $2::DATE
      AND fecha_cierre <= ($2::DATE + INTERVAL '45 days')
    ORDER BY fecha_cierre ASC, ciclo ASC
    LIMIT 1
    `,
    [tarjeta.id, fechaCompraIso]
  );
  return rows[0] || null;
}

async function resolverResumenCompraTarjeta(tarjeta, fechaCompra, usuarioId = null, db = pool) {
  const fechaCompraIso = fechaIso(fechaCompra);
  const cierrePorFecha = await obtenerCierreTarjetaPorFechaCompra(tarjeta, fechaCompraIso, db);
  if (cierrePorFecha) return { cicloAsignado: cierrePorFecha.ciclo, cierreAsignado: cierrePorFecha };

  const fecha = new Date(`${fechaCompraIso}T00:00:00`);
  const cicloCompra = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  const siguiente = siguienteCiclo(cicloCompra);
  const cierreCompra = await obtenerOCrearCierreTarjeta(tarjeta, cicloCompra, usuarioId, db);
  const fechaCierreCompra = fechaIso(cierreCompra?.fecha_cierre);
  const cicloAsignado = fechaCierreCompra && fechaCompraIso > fechaCierreCompra ? siguiente : cicloCompra;
  const cierreAsignado = cicloAsignado === cicloCompra
    ? cierreCompra
    : await obtenerOCrearCierreTarjeta(tarjeta, cicloAsignado, usuarioId, db);
  return { cicloAsignado, cierreAsignado };
}

async function obtenerOCrearCierresCuotasTarjeta(tarjeta, cicloInicial, cantidadCuotas, usuarioId = null, db = pool) {
  const cierres = [];
  const totalCuotas = Math.max(Number(cantidadCuotas || 1), 1);
  for (let index = 0; index < totalCuotas; index += 1) {
    const cicloCuota = sumarMesesCiclo(cicloInicial, index);
    const cierre = await obtenerOCrearCierreTarjeta(tarjeta, cicloCuota, usuarioId, db);
    if (cierre) cierres.push(cierre);
  }
  return cierres;
}

async function asegurarCierresCuotasAbiertos(tarjeta, cicloInicial, cantidadCuotas, usuarioId = null, db = pool) {
  const cierres = await obtenerOCrearCierresCuotasTarjeta(tarjeta, cicloInicial, cantidadCuotas, usuarioId, db);
  const cerrado = cierres.find((item) => item.estado === 'cerrado');
  if (cerrado) {
    const error = new Error(`El resumen ${cerrado.ciclo} esta cerrado`);
    error.statusCode = 409;
    throw error;
  }
  return cierres;
}

async function asegurarSuscripcionMesSiguienteAbierta(tarjeta, cicloInicial, repiteMesSiguiente, usuarioId = null, db = pool) {
  if (!repiteMesSiguiente) return null;
  const cierre = await obtenerOCrearCierreTarjeta(tarjeta, sumarMesesCiclo(cicloInicial, 1), usuarioId, db);
  if (cierre?.estado === 'cerrado') {
    const error = new Error(`El resumen ${cierre.ciclo} esta cerrado`);
    error.statusCode = 409;
    throw error;
  }
  return cierre;
}

async function recalcularAsignacionConsumosTarjeta() {
  const { rows } = await pool.query(
    `
    SELECT ct.id, ct.fecha_compra, ct.cierre_id, ct.ciclo_asignado, ct.cantidad_cuotas, ct.cuota_inicial,
           tc.id AS tarjeta_id, tc.hogar_id, tc.dia_cierre_default, tc.dia_vencimiento_default
    FROM consumos_tarjeta ct
    JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
    `
  );

  for (const row of rows) {
    const fechaCompra = fechaIso(row.fecha_compra);
    const { cicloAsignado, cierreAsignado } = await resolverResumenCompraTarjeta({ ...row, id: row.tarjeta_id }, fechaCompra);
    const cuotaInicial = calcularCuotaInicialCompra(row.cantidad_cuotas, row.cuota_inicial, row.cuota_inicial, cicloAsignado, fechaCompra);
    if (
      !cierreAsignado ||
      (row.ciclo_asignado === cicloAsignado &&
        Number(row.cierre_id) === Number(cierreAsignado.id) &&
        Number(row.cuota_inicial || 1) === cuotaInicial)
    ) continue;

    await pool.query(
      `
      UPDATE consumos_tarjeta
      SET cierre_id = $1,
          ciclo_asignado = $2,
          cuota_inicial = $3,
          actualizado_en = NOW()
      WHERE id = $4
      `,
      [cierreAsignado.id, cicloAsignado, cuotaInicial, row.id]
    );
  }
}

function expandirConsumosTarjeta(consumosBase) {
  return consumosBase.flatMap((item) => {
    const cuotas = Math.max(Number(item.cantidad_cuotas || 1), 1);
    const cuotaInicial = Math.min(Math.max(Number(item.cuota_inicial || 1), 1), cuotas);
    const cuotasRestantes = Math.max(cuotas - cuotaInicial + 1, 1);
    const cuotasCompra = Array.from({ length: cuotasRestantes }, (_, index) => {
      const cuotaNumero = cuotaInicial + index;
      const cicloCuota = sumarMesesCiclo(item.ciclo_asignado, index);
      return {
        ...item,
        id: `${item.id}-${cuotaNumero}`,
        compra_id: item.id,
        cierre_id_origen: item.cierre_id,
        ciclo_compra: item.ciclo_asignado,
        ciclo_asignado: cicloCuota,
        resumen_relativo: item.resumen_relativo,
        monto_resumen: Number(item.monto_cuota || 0),
        cuota_numero: cuotaNumero,
        cuota_label: cuotas > 1 ? `${cuotaNumero}/${cuotas}` : '1/1',
        es_cuota_generada: cuotas > 1
      };
    });
    if (!item.repite_mes_siguiente || cuotas > 1) return cuotasCompra;

    return [
      ...cuotasCompra,
      {
        ...item,
        id: `${item.id}-suscripcion-next`,
        compra_id: item.id,
        cierre_id_origen: item.cierre_id,
        ciclo_compra: item.ciclo_asignado,
        ciclo_asignado: sumarMesesCiclo(item.ciclo_asignado, 1),
        monto_resumen: Number(item.monto_cuota || item.monto_total || 0),
        cuota_numero: 1,
        cuota_label: '1/1',
        es_suscripcion_replicada: true
      }
    ];
  });
}

function calcularVariacionPorcentual(actual, referencia) {
  if (!referencia) return null;
  return ((Number(actual || 0) - Number(referencia || 0)) / Number(referencia || 1)) * 100;
}

function promediarValores(items, selector) {
  const valores = items.map(selector).filter((value) => Number(value || 0) > 0);
  if (valores.length === 0) return 0;
  return valores.reduce((acc, value) => acc + Number(value || 0), 0) / valores.length;
}

function resumirCicloTarjeta(ciclo, consumos) {
  const categorias = new Map();
  const items = consumos.filter((item) => item.ciclo_asignado === ciclo);
  const resumen = {
    ciclo,
    total_ars: 0,
    total_usd: 0,
    consumos: items.length,
    cuotas_ars: 0,
    cuotas_usd: 0,
    suscripciones_ars: 0,
    suscripciones_usd: 0,
    suscripciones: 0,
    categorias: []
  };

  items.forEach((item) => {
    const monto = Number(item.monto_resumen || item.monto_cuota || item.monto_total || 0);
    const categoria = item.categoria || 'Sin categoria';
    const esUsd = item.moneda === 'USD';
    const esCuota = Number(item.cantidad_cuotas || 1) > 1;
    const esSuscripcion = Boolean(item.repite_mes_siguiente || item.es_suscripcion_replicada || esCategoriaSuscripcion(categoria));

    if (!categorias.has(categoria)) {
      categorias.set(categoria, { categoria, total_ars: 0, total_usd: 0, consumos: 0 });
    }
    const bucket = categorias.get(categoria);
    bucket.consumos += 1;

    if (esUsd) {
      resumen.total_usd += monto;
      bucket.total_usd += monto;
      if (esCuota) resumen.cuotas_usd += monto;
      if (esSuscripcion) resumen.suscripciones_usd += monto;
    } else {
      resumen.total_ars += monto;
      bucket.total_ars += monto;
      if (esCuota) resumen.cuotas_ars += monto;
      if (esSuscripcion) resumen.suscripciones_ars += monto;
    }
    if (esSuscripcion) resumen.suscripciones += 1;
  });

  resumen.categorias = Array.from(categorias.values())
    .sort((a, b) => (b.total_ars - a.total_ars) || (b.total_usd - a.total_usd));
  return resumen;
}

function construirAnalisisTarjeta(consumosExpandidos, historialResumenes, cicloSeleccionado) {
  const ultimoCerrado = [...historialResumenes]
    .filter((item) => item.estado === 'cerrado')
    .sort((a, b) => compararCiclos(b.ciclo, a.ciclo))[0] || null;
  const cicloPunta = cicloSeleccionado;
  const cicloBaseAbierto = ultimoCerrado ? sumarMesesCiclo(ultimoCerrado.ciclo, 1) : cicloSeleccionado;
  const ciclos = Array.from({ length: 6 }, (_, index) => sumarMesesCiclo(cicloPunta, -index)).filter(Boolean);
  const ciclosExtendidos = Array.from({ length: 12 }, (_, index) => sumarMesesCiclo(cicloBaseAbierto, -index)).filter(Boolean);
  const serie = ciclos.map((ciclo) => resumirCicloTarjeta(ciclo, consumosExpandidos));
  const serieExtendida = ciclosExtendidos.map((ciclo) => resumirCicloTarjeta(ciclo, consumosExpandidos));
  const actual = serie[0] || resumirCicloTarjeta(cicloPunta, []);
  const anteriores = serie.slice(1);
  const promedioArs = promediarValores(anteriores, (item) => item.total_ars);
  const promedioUsd = promediarValores(anteriores, (item) => item.total_usd);
  const promedioSuscripcionesArs = promediarValores(anteriores, (item) => item.suscripciones_ars);
  const promedioSuscripcionesUsd = promediarValores(anteriores, (item) => item.suscripciones_usd);
  const promedioCuotasArs = promediarValores(anteriores, (item) => item.cuotas_ars);
  const promedioCuotasUsd = promediarValores(anteriores, (item) => item.cuotas_usd);
  const variacionTotalArs = calcularVariacionPorcentual(actual.total_ars, promedioArs);
  const variacionTotalUsd = calcularVariacionPorcentual(actual.total_usd, promedioUsd);
  const variacionSuscripcionesArs = calcularVariacionPorcentual(actual.suscripciones_ars, promedioSuscripcionesArs);
  const variacionSuscripcionesUsd = calcularVariacionPorcentual(actual.suscripciones_usd, promedioSuscripcionesUsd);
  const variacionCuotasArs = calcularVariacionPorcentual(actual.cuotas_ars, promedioCuotasArs);
  const variacionCuotasUsd = calcularVariacionPorcentual(actual.cuotas_usd, promedioCuotasUsd);
  const categoriaPrincipal = actual.categorias[0] || null;
  const participacionCategoriaPrincipal = actual.total_ars > 0 && categoriaPrincipal
    ? (categoriaPrincipal.total_ars / actual.total_ars) * 100
    : 0;
  const participacionCategoriaPrincipalUsd = actual.total_usd > 0 && categoriaPrincipal
    ? (categoriaPrincipal.total_usd / actual.total_usd) * 100
    : 0;
  const participacionSuscripciones = actual.total_ars > 0 ? (actual.suscripciones_ars / actual.total_ars) * 100 : 0;
  const participacionSuscripcionesUsd = actual.total_usd > 0 ? (actual.suscripciones_usd / actual.total_usd) * 100 : 0;
  const participacionCuotas = actual.total_ars > 0 ? (actual.cuotas_ars / actual.total_ars) * 100 : 0;
  const participacionCuotasUsd = actual.total_usd > 0 ? (actual.cuotas_usd / actual.total_usd) * 100 : 0;

  const categoriasPrevias = new Map();
  anteriores.forEach((item) => {
    item.categorias.forEach((categoria) => {
      if (!categoriasPrevias.has(categoria.categoria)) {
        categoriasPrevias.set(categoria.categoria, { total_ars: 0, total_usd: 0, muestras_ars: 0, muestras_usd: 0 });
      }
      const bucket = categoriasPrevias.get(categoria.categoria);
      const totalArsCategoria = Number(categoria.total_ars || 0);
      const totalUsdCategoria = Number(categoria.total_usd || 0);
      if (totalArsCategoria > 0) {
        bucket.total_ars += totalArsCategoria;
        bucket.muestras_ars += 1;
      }
      if (totalUsdCategoria > 0) {
        bucket.total_usd += totalUsdCategoria;
        bucket.muestras_usd += 1;
      }
    });
  });

  const categoriasComparadas = Array.from(new Set([
    ...actual.categorias.map((item) => item.categoria),
    ...Array.from(categoriasPrevias.keys())
  ])).map((categoria) => {
    const actualCategoria = actual.categorias.find((item) => item.categoria === categoria) || { total_ars: 0, total_usd: 0, consumos: 0 };
    const previa = categoriasPrevias.get(categoria) || { total_ars: 0, total_usd: 0, muestras_ars: 0, muestras_usd: 0 };
    const promedioCategoriaArs = previa.muestras_ars > 0 ? previa.total_ars / previa.muestras_ars : 0;
    const promedioCategoriaUsd = previa.muestras_usd > 0 ? previa.total_usd / previa.muestras_usd : 0;
    return {
      categoria,
      actual_ars: actualCategoria.total_ars,
      promedio_ars: promedioCategoriaArs,
      diferencia_ars: actualCategoria.total_ars - promedioCategoriaArs,
      variacion_ars: calcularVariacionPorcentual(actualCategoria.total_ars, promedioCategoriaArs),
      actual_usd: actualCategoria.total_usd,
      promedio_usd: promedioCategoriaUsd,
      diferencia_usd: actualCategoria.total_usd - promedioCategoriaUsd,
      variacion_usd: calcularVariacionPorcentual(actualCategoria.total_usd, promedioCategoriaUsd),
      consumos: actualCategoria.consumos || 0
    };
  }).filter((item) => item.actual_ars > 0 || item.promedio_ars > 0 || item.actual_usd > 0 || item.promedio_usd > 0)
    .sort((a, b) => (Math.abs(b.diferencia_ars) + Math.abs(b.diferencia_usd)) - (Math.abs(a.diferencia_ars) + Math.abs(a.diferencia_usd)))
    .slice(0, 5);

  const promedioNivel = promedioArs > 0 ? promedioArs : promedioUsd;
  const actualNivel = promedioArs > 0 ? actual.total_ars : actual.total_usd;
  const nivel = promedioNivel <= 0
    ? 'Sin historial'
    : actualNivel > promedioNivel * 1.2
      ? 'Consumo alto'
      : actualNivel < promedioNivel * 0.85
        ? 'Consumo bajo'
        : 'Consumo normal';
  const tonoNivel = nivel === 'Consumo alto' ? 'warning' : nivel === 'Consumo bajo' ? 'positive' : 'muted';
  const insights = [];

  if (promedioNivel <= 0) {
    insights.push('Todavia falta historial comparable para separar patron de ruido.');
  } else if (actualNivel > promedioNivel * 1.2) {
    insights.push('El consumo viene por encima del patron reciente; conviene revisar altas nuevas antes de seguir sumando gastos variables.');
  } else if (actualNivel < promedioNivel * 0.85) {
    insights.push('El nivel actual esta por debajo del promedio reciente; buen momento para sostener el freno y no reemplazarlo con cuotas.');
  } else {
    insights.push('El nivel general esta cerca del patron reciente; la decision pasa mas por composicion que por monto total.');
  }

  if (
    (actual.suscripciones_ars > 0 && (participacionSuscripciones >= 30 || actual.suscripciones_ars > promedioSuscripcionesArs * 1.15)) ||
    (actual.suscripciones_usd > 0 && (participacionSuscripcionesUsd >= 30 || actual.suscripciones_usd > promedioSuscripcionesUsd * 1.15))
  ) {
    insights.push('Las suscripciones pesan en la base del resumen; revisar altas recurrentes tiene mas impacto que recortar compras aisladas.');
  }
  if ((participacionCategoriaPrincipal >= 45 || participacionCategoriaPrincipalUsd >= 45) && categoriaPrincipal) {
    insights.push(`${categoriaPrincipal.categoria} concentra demasiado el resumen; si no fue planificado, es la primera categoria a auditar.`);
  }
  if ((actual.cuotas_ars > 0 && participacionCuotas >= 35) || (actual.cuotas_usd > 0 && participacionCuotasUsd >= 35)) {
    insights.push('La carga en cuotas es relevante; antes de financiar nuevas compras, mira el arrastre de los proximos resumenes.');
  }
  const categoriaConMayorSalto = categoriasComparadas.find((item) => (
    item.diferencia_ars > Math.max(promedioArs * 0.12, 0) ||
    item.diferencia_usd > Math.max(promedioUsd * 0.12, 0)
  ));
  if (categoriaConMayorSalto) {
    insights.push(`${categoriaConMayorSalto.categoria} explica el mayor salto contra el promedio; ahi esta la palanca principal de decision.`);
  }

  return {
    ciclo_punta: cicloPunta,
    ciclo_base_abierto: cicloBaseAbierto,
    ultimo_cerrado: ultimoCerrado?.ciclo || null,
    nivel,
    tono_nivel: tonoNivel,
    actual,
    promedio_ars: promedioArs,
    promedio_usd: promedioUsd,
    promedio_suscripciones_ars: promedioSuscripcionesArs,
    promedio_suscripciones_usd: promedioSuscripcionesUsd,
    promedio_cuotas_ars: promedioCuotasArs,
    promedio_cuotas_usd: promedioCuotasUsd,
    variacion_total_ars: variacionTotalArs,
    variacion_total_usd: variacionTotalUsd,
    variacion_suscripciones_ars: variacionSuscripcionesArs,
    variacion_suscripciones_usd: variacionSuscripcionesUsd,
    variacion_cuotas_ars: variacionCuotasArs,
    variacion_cuotas_usd: variacionCuotasUsd,
    participacion_suscripciones: participacionSuscripciones,
    participacion_suscripciones_ars: participacionSuscripciones,
    participacion_suscripciones_usd: participacionSuscripcionesUsd,
    participacion_cuotas: participacionCuotas,
    participacion_cuotas_ars: participacionCuotas,
    participacion_cuotas_usd: participacionCuotasUsd,
    participacion_categoria_principal: participacionCategoriaPrincipal,
    participacion_categoria_principal_ars: participacionCategoriaPrincipal,
    participacion_categoria_principal_usd: participacionCategoriaPrincipalUsd,
    categorias_comparadas: categoriasComparadas,
    serie,
    serie_extendida: serieExtendida,
    insights: insights.slice(0, 5)
  };
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
  await pool.query(`
    ALTER TABLE estados_gastos_fijos_ciclo
    ADD COLUMN IF NOT EXISTS fecha_estado DATE
  `);
  await pool.query(`
    ALTER TABLE estados_gastos_fijos_ciclo
    ADD COLUMN IF NOT EXISTS fecha_realizacion DATE
  `);
  await pool.query(`
    UPDATE estados_gastos_fijos_ciclo
    SET fecha_estado = COALESCE(fecha_estado, actualizado_en::date, creado_en::date)
    WHERE fecha_estado IS NULL
  `);
  await pool.query(`
    UPDATE estados_gastos_fijos_ciclo
    SET fecha_realizacion = COALESCE(fecha_realizacion, actualizado_en::date, creado_en::date)
    WHERE fecha_realizacion IS NULL
      AND (estado_egreso = 'pagado' OR estado_ingreso = 'registrado')
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
  await pool.query(`
    UPDATE ajustes_gastos_fijos
    SET ciclo_hasta_aplicacion = TO_CHAR(fecha_aplicacion, 'YYYY-MM')
    WHERE ciclo_hasta_aplicacion IS NULL
      AND nota ILIKE 'Ajuste desde grilla para ciclo %'
  `);
}

let gastosFijosLecturaAsegurados = false;

async function asegurarGastosFijosLectura() {
  if (gastosFijosLecturaAsegurados) return;
  await asegurarEstadosGastosFijosPorCiclo();
  await asegurarVigenciaGastosFijos();
  await asegurarAlcanceAjustesGastosFijos();
  await pool.query('CREATE INDEX IF NOT EXISTS idx_gastos_fijos_hogar_activo_ciclo ON gastos_fijos (hogar_id, activo, activo_desde_ciclo, activo_hasta_ciclo)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ajustes_gastos_fijos_gasto_fecha ON ajustes_gastos_fijos (gasto_fijo_id, fecha_aplicacion)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_estados_gastos_fijos_gasto_ciclo ON estados_gastos_fijos_ciclo (gasto_fijo_id, ciclo)');
  gastosFijosLecturaAsegurados = true;
}

async function asegurarCategoriasBase(hogarId, usuarioId = null) {
  if (!hogarId) return;

  const { rows: tiposRows } = await pool.query('SELECT id, codigo FROM tipos_movimiento');
  const tipoIdPorCodigo = new Map(tiposRows.map((row) => [row.codigo, Number(row.id)]));

  const categoriasBaseConTipo = Array.from(
    new Map(
      CATEGORIAS_BASE.map((categoria) => ({
        nombre: categoria.nombre,
        tipoMovimientoId: tipoIdPorCodigo.get(categoria.tipoMovimiento)
      }))
        .filter((categoria) => categoria.tipoMovimientoId)
        .map((categoria) => [`${categoria.nombre}::${categoria.tipoMovimientoId}`, categoria])
    ).values()
  );

  if (categoriasBaseConTipo.length === 0) {
    return;
  }

  await pool.query(
    `
    INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id, creado_por_usuario_id, actualizado_por_usuario_id)
    SELECT DISTINCT $1::bigint, categoria.nombre, categoria.tipo_movimiento_id, $4::bigint, $4::bigint
    FROM UNNEST($2::text[], $3::smallint[]) AS categoria(nombre, tipo_movimiento_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM categorias existente
      WHERE existente.hogar_id = $1::bigint
        AND existente.nombre = categoria.nombre
        AND existente.tipo_movimiento_id = categoria.tipo_movimiento_id
    )
    ON CONFLICT (hogar_id, nombre, tipo_movimiento_id) DO NOTHING
    `,
    [
      hogarId,
      categoriasBaseConTipo.map((categoria) => categoria.nombre),
      categoriasBaseConTipo.map((categoria) => categoria.tipoMovimientoId),
      usuarioId
    ]
  );
}

async function asegurarCategoriasBaseTodosHogares(usuarioId = null) {
  const { rows } = await pool.query('SELECT id FROM hogares ORDER BY id ASC');
  for (const hogar of rows) {
    await asegurarCategoriasBase(Number(hogar.id), usuarioId);
  }
}

async function ordenarCategoriasPorHogar(usuarioId = null) {
  const { rows: tiposRows } = await pool.query('SELECT id, codigo FROM tipos_movimiento');
  const tipoIdPorCodigo = new Map(tiposRows.map((row) => [row.codigo, Number(row.id)]));
  const base = Array.from(
    new Map(
      CATEGORIAS_BASE.map((categoria) => ({
        nombre: categoria.nombre,
        tipoMovimientoId: tipoIdPorCodigo.get(categoria.tipoMovimiento)
      }))
        .filter((categoria) => categoria.tipoMovimientoId)
        .map((categoria) => [`${categoria.nombre}::${categoria.tipoMovimientoId}`, categoria])
    ).values()
  );
  if (base.length === 0) return;

  const params = [
    HOGAR_COLON_260_ID,
    base.map((categoria) => categoria.nombre),
    base.map((categoria) => categoria.tipoMovimientoId),
    usuarioId
  ];

  await pool.query(
    `
    WITH base AS (
      SELECT *
      FROM UNNEST($2::text[], $3::smallint[]) AS b(nombre, tipo_movimiento_id)
    ), externas AS (
      SELECT DISTINCT c.nombre, c.tipo_movimiento_id
      FROM categorias c
      WHERE c.hogar_id <> $1
        AND c.activo = true
        AND NOT EXISTS (
          SELECT 1 FROM base b
          WHERE b.nombre = c.nombre AND b.tipo_movimiento_id = c.tipo_movimiento_id
        )
    )
    INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id, creado_por_usuario_id, actualizado_por_usuario_id)
    SELECT $1, nombre, tipo_movimiento_id, $4, $4
    FROM externas
    ON CONFLICT (hogar_id, nombre, tipo_movimiento_id)
    DO UPDATE SET activo = true,
                  actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id;
    `,
    params
  );

  await pool.query(
    `
    WITH base AS (
      SELECT *
      FROM UNNEST($2::text[], $3::smallint[]) AS b(nombre, tipo_movimiento_id)
    )
    UPDATE categorias c
    SET activo = false,
        actualizado_por_usuario_id = $4
    WHERE c.hogar_id <> $1
      AND c.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM base b
        WHERE b.nombre = c.nombre AND b.tipo_movimiento_id = c.tipo_movimiento_id
      )
    `,
    params
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
      SELECT u.id, u.correo, u.clave_hash, u.nombre, u.rol_global, u.force_password_change
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
      force_password_change: Boolean(usuario.force_password_change),
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
      SELECT u.id, u.correo, u.nombre, u.rol_global, u.force_password_change
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
        force_password_change: Boolean(usuario.force_password_change),
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
      INSERT INTO hogares (nombre, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $2)
      RETURNING id, nombre, creado_en
      `,
      [String(nombre).trim(), usuarioAuditoriaId(req)]
    );
    const hogar = { ...rows[0], id: Number(rows[0].id) };
    await asegurarCategoriasBase(hogar.id, usuarioAuditoriaId(req));
    return res.status(201).json({ ok: true, hogar });
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
      SET nombre = $1,
          actualizado_por_usuario_id = $3
      WHERE id = $2
      RETURNING id, nombre, creado_en
      `,
      [String(nombre).trim(), hogarId, usuarioAuditoriaId(req)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Hogar no encontrado' });
    }

    return res.status(200).json({ ok: true, hogar: { ...rows[0], id: Number(rows[0].id) } });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando hogar', detalle: error.message });
  }
});

app.delete('/admin/hogares/:id', autenticar, exigirSuperadmin, async (req, res) => {
  const hogarId = Number(req.params.id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  if (hogarId === HOGAR_COLON_260_ID) {
    return res.status(400).json({ error: 'El hogar principal no se puede eliminar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hogar = await client.query('SELECT id, nombre FROM hogares WHERE id = $1 FOR UPDATE', [hogarId]);
    if (hogar.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hogar no encontrado' });
    }

    const movimientos = await client.query('SELECT COUNT(*)::int AS total FROM movimientos WHERE hogar_id = $1', [hogarId]);
    const gastosFijos = await client.query('SELECT COUNT(*)::int AS total FROM gastos_fijos WHERE hogar_id = $1', [hogarId]);
    const cierres = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM cierres_ciclo
      WHERE hogar_id = $1
      `,
      [hogarId]
    );

    const totalMovimientos = Number(movimientos.rows[0]?.total || 0);
    const totalGastosFijos = Number(gastosFijos.rows[0]?.total || 0);
    const totalCierres = Number(cierres.rows[0]?.total || 0);

    if (totalMovimientos > 0 || totalGastosFijos > 0 || totalCierres > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'No se puede eliminar el hogar porque tiene datos financieros cargados'
      });
    }

    await client.query('DELETE FROM hogares_usuarios WHERE hogar_id = $1', [hogarId]);
    await client.query('DELETE FROM cuentas WHERE hogar_id = $1', [hogarId]);
    await client.query('DELETE FROM etiquetas WHERE hogar_id = $1', [hogarId]);
    await client.query('DELETE FROM categorias WHERE hogar_id = $1', [hogarId]);
    await client.query('DELETE FROM hogares WHERE id = $1', [hogarId]);

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      hogar: { id: Number(hogar.rows[0].id), nombre: hogar.rows[0].nombre }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error eliminando hogar', detalle: error.message });
  } finally {
    client.release();
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
        u.force_password_change,
        u.creado_en,
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
      GROUP BY u.id, u.correo, u.nombre, u.rol_global, u.force_password_change, u.creado_en, u.activo
      ORDER BY u.nombre ASC
      `
    );
    return res.status(200).json({
      total: rows.length,
      items: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        force_password_change: Boolean(row.force_password_change),
        creado_en: row.creado_en,
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
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (hogar_id, usuario_id)
      DO UPDATE SET rol = EXCLUDED.rol,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      `,
      [hogarId, usuario.id, rolNormalizado, usuarioAuditoriaId(req)]
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
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (hogar_id, usuario_id)
      DO UPDATE SET rol = EXCLUDED.rol,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuarioId, rolNormalizado, usuarioAuditoriaId(req)]
    );

    return res.status(200).json({ ok: true, vinculo: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error vinculando usuario al hogar', detalle: error.message });
  }
});

app.patch('/admin/usuarios/:id', autenticar, exigirSuperadmin, async (req, res) => {
  const usuarioId = Number(req.params.id);
  const { nombre, email, rol_global, activo, force_password_change } = req.body || {};
  const nombreFinal = nombre == null ? null : String(nombre).trim();
  const correoFinal = email == null ? null : String(email).trim().toLowerCase();
  const rolFinal = rol_global == null ? null : normalizarRolHogar(rol_global);
  const activoFinal = typeof activo === 'boolean' ? activo : null;
  const forzarCambioFinal = typeof force_password_change === 'boolean' ? force_password_change : null;

  if (!usuarioId) {
    return res.status(400).json({ error: 'usuario_id es obligatorio' });
  }

  if (nombreFinal !== null && !nombreFinal) {
    return res.status(400).json({ error: 'nombre no puede estar vacio' });
  }

  if (correoFinal !== null && !correoFinal) {
    return res.status(400).json({ error: 'email no puede estar vacio' });
  }

  if (rolFinal !== null && !['superadmin', 'hogar_admin', 'hogar_member'].includes(rolFinal)) {
    return res.status(400).json({ error: 'rol_global invalido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actual = await client.query(
      `
      SELECT id, correo, nombre, rol_global, activo, force_password_change
      FROM usuarios
      WHERE id = $1
      FOR UPDATE
      `,
      [usuarioId]
    );

    const usuarioActual = actual.rows[0];
    if (!usuarioActual) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (correoFinal && correoFinal !== String(usuarioActual.correo || '').toLowerCase()) {
      const duplicado = await client.query(
        `
        SELECT id
        FROM usuarios
        WHERE LOWER(correo) = LOWER($1)
          AND id <> $2
        LIMIT 1
        `,
        [correoFinal, usuarioId]
      );
      if (duplicado.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ya existe otro usuario con ese email' });
      }
    }

    const { rows } = await client.query(
      `
      UPDATE usuarios
      SET
        nombre = COALESCE($1, nombre),
        correo = COALESCE($2, correo),
        rol_global = COALESCE($3, rol_global),
        activo = COALESCE($4, activo),
        force_password_change = COALESCE($5, force_password_change)
      WHERE id = $6
      RETURNING id, correo, nombre, rol_global, activo, force_password_change, creado_en
      `,
      [
        nombreFinal,
        correoFinal,
        rolFinal,
        activoFinal,
        forzarCambioFinal,
        usuarioId
      ]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      usuario: {
        ...rows[0],
        id: Number(rows[0].id),
        force_password_change: Boolean(rows[0].force_password_change)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error actualizando usuario', detalle: error.message });
  } finally {
    client.release();
  }
});

app.post('/admin/usuarios/:id/password', autenticar, exigirSuperadmin, async (req, res) => {
  const usuarioId = Number(req.params.id);
  const { password, force_password_change } = req.body || {};
  const nuevaPassword = String(password || '');
  const debeForzarCambio = Boolean(force_password_change);

  if (!usuarioId) {
    return res.status(400).json({ error: 'usuario_id es obligatorio' });
  }

  if (!nuevaPassword && !debeForzarCambio) {
    return res.status(400).json({ error: 'Defini una nueva password o forza el cambio en el proximo login' });
  }

  const errorFormato = nuevaPassword ? validarFormatoPassword(nuevaPassword) : '';
  if (errorFormato) {
    return res.status(400).json({ error: errorFormato });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE usuarios
      SET
        clave_hash = COALESCE($1, clave_hash),
        force_password_change = $2
      WHERE id = $3
        AND activo = true
      RETURNING id, correo, nombre, force_password_change
      `,
      [nuevaPassword ? hashPassword(nuevaPassword) : null, debeForzarCambio, usuarioId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({
      ok: true,
      usuario: {
        id: Number(rows[0].id),
        correo: rows[0].correo,
        nombre: rows[0].nombre,
        force_password_change: Boolean(rows[0].force_password_change)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando password', detalle: error.message });
  }
});

app.post('/auth/cambiar-password', autenticar, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const currentPassword = String(current_password || '');
  const newPassword = String(new_password || '');

  if (!newPassword) {
    return res.status(400).json({ error: 'new_password es obligatoria' });
  }

  const errorFormato = validarFormatoPassword(newPassword);
  if (errorFormato) {
    return res.status(400).json({ error: errorFormato });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT id, clave_hash, force_password_change
      FROM usuarios
      WHERE id = $1
        AND activo = true
      LIMIT 1
      `,
      [req.usuario.id]
    );
    const usuario = rows[0];
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!usuario.force_password_change && !passwordValida(currentPassword, usuario.clave_hash)) {
      return res.status(401).json({ error: 'La password actual no es correcta' });
    }

    await pool.query(
      `
      UPDATE usuarios
      SET clave_hash = $1,
          force_password_change = false
      WHERE id = $2
      `,
      [hashPassword(newPassword), req.usuario.id]
    );

    const usuarioSesion = await cargarUsuarioSesion(req.usuario.id, req.usuario.hogar_id);
    const token = firmarToken({ ...usuarioSesion, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });

    return res.status(200).json({ ok: true, token, usuario: usuarioSesion });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando password', detalle: error.message });
  }
});

app.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const genericResponse = {
    ok: true,
    mensaje: 'Si el email existe, vas a recibir instrucciones para restablecer la password.'
  };

  if (!email) {
    return res.status(200).json(genericResponse);
  }

  try {
    await asegurarDatosColon260();

    const { rows } = await pool.query(
      `
      SELECT id, correo
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
        AND activo = true
      LIMIT 1
      `,
      [email]
    );

    const usuario = rows[0];
    if (!usuario) {
      return res.status(200).json(genericResponse);
    }

    const tokenPlano = generarPasswordResetToken();
    const tokenHash = hashPasswordResetToken(tokenPlano);
    const expiraEn = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    await pool.query(
      `
      DELETE FROM password_reset_tokens
      WHERE usuario_id = $1
        OR expira_en <= NOW()
        OR consumido_en IS NOT NULL
      `,
      [usuario.id]
    );

    await pool.query(
      `
      INSERT INTO password_reset_tokens (usuario_id, token_hash, expira_en)
      VALUES ($1, $2, $3)
      `,
      [usuario.id, tokenHash, expiraEn]
    );

    await enviarEmailResetPassword({
      to: usuario.correo,
      resetUrl: resolvePasswordResetUrl(req, tokenPlano)
    });

    return res.status(200).json(genericResponse);
  } catch (error) {
    return res.status(500).json({
      error: 'Error solicitando restablecimiento de password',
      detalle: error.message
    });
  }
});

app.get('/auth/reset-password/validate', async (req, res) => {
  const token = String(req.query?.token || '').trim();

  if (!token) {
    return res.status(200).json({
      ok: true,
      valid: false,
      error: 'Token invalido o inexistente'
    });
  }

  try {
    await asegurarDatosColon260();
    const resetToken = await buscarPasswordResetToken(pool, token);
    const validation = evaluarPasswordResetToken(resetToken);

    if (!validation.valid) {
      return res.status(200).json({
        ok: true,
        valid: false,
        error: validation.error
      });
    }

    return res.status(200).json({
      ok: true,
      valid: true,
      mensaje: 'Token valido'
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error validando token de restablecimiento',
      detalle: error.message
    });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({ error: 'token, password y confirmPassword son obligatorios' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Las passwords no coinciden' });
  }

  const errorFormato = validarFormatoPassword(password);
  if (errorFormato) {
    return res.status(400).json({ error: errorFormato });
  }

  const client = await pool.connect();
  try {
    await asegurarDatosColon260();
    await client.query('BEGIN');

    const resetToken = await buscarPasswordResetToken(client, token, { forUpdate: true });
    const validation = evaluarPasswordResetToken(resetToken);

    if (!validation.valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: validation.error });
    }

    const { rows: usuarioRows } = await client.query(
      `
      UPDATE usuarios
      SET clave_hash = $1,
          force_password_change = false
      WHERE id = $2
        AND activo = true
      RETURNING id
      `,
      [hashPassword(password), resetToken.usuario_id]
    );

    if (usuarioRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Usuario no disponible para restablecer password' });
    }

    await client.query(
      `
      UPDATE password_reset_tokens
      SET consumido_en = NOW()
      WHERE id = $1
        AND consumido_en IS NULL
      `,
      [resetToken.id]
    );

    await client.query(
      `
      DELETE FROM password_reset_tokens
      WHERE usuario_id = $1
        AND id <> $2
      `,
      [resetToken.usuario_id, resetToken.id]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      mensaje: 'Password actualizada correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      error: 'Error restableciendo password',
      detalle: error.message
    });
  } finally {
    client.release();
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
      INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (hogar_id, usuario_id)
      DO UPDATE SET rol = EXCLUDED.rol,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuario.id, rolNormalizado, usuarioAuditoriaId(req)]
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
      SET rol = $3,
          actualizado_por_usuario_id = $4
      WHERE hogar_id = $1
        AND usuario_id = $2
      RETURNING hogar_id, usuario_id, rol
      `,
      [hogarId, usuarioId, rolNormalizado, usuarioAuditoriaId(req)]
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

app.get('/tarjetas-credito', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const ciclo = String(req.query.ciclo || '');
  const tarjetaIdSeleccionada = Number(req.query.tarjeta_id || 0);
  const auditoriaUsuarioId = usuarioAuditoriaId(req);

  if (!hogarId) return res.status(400).json({ error: 'hogar_id es obligatorio' });

  try {
    await asegurarTarjetasCredito({ recalcular: false });

    await pool.query(
      `
      INSERT INTO tarjetas_credito (hogar_id, nombre, dia_cierre_default, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, 'Tarjeta MercadoPago', 25, $2, $2)
      ON CONFLICT (hogar_id, nombre) DO NOTHING
      `,
      [hogarId, auditoriaUsuarioId]
    );

    const { rows: tarjetas } = await pool.query(
      `
      SELECT id, hogar_id, nombre, dia_cierre_default, dia_vencimiento_default, activa
      FROM tarjetas_credito
      WHERE hogar_id = $1 AND activa = true
      ORDER BY id ASC
      `,
      [hogarId]
    );
    let cierreActual = null;
    let tarjetaActual = null;

    if (cicloEsValido(ciclo) && tarjetas[0]) {
      tarjetaActual = tarjetas.find((tarjeta) => Number(tarjeta.id) === tarjetaIdSeleccionada) || tarjetas[0];
      cierreActual = await obtenerOCrearCierreTarjeta(tarjetaActual, ciclo, auditoriaUsuarioId);
    }

    const tarjetaConsultaId = cierreActual?.tarjeta_id || null;
    const { rows: consumosBase } = cicloEsValido(ciclo)
      ? await pool.query(
          `
          SELECT ct.id, ct.tarjeta_id, ct.cierre_id, ct.ciclo_asignado, ct.fecha_compra,
                 ct.descripcion, ct.categoria, ct.moneda, ct.monto_total,
                 ct.cantidad_cuotas, ct.monto_cuota, ct.cuota_inicial, ct.repite_mes_siguiente,
                 ct.titular, ct.observaciones,
                 crt.fecha_cierre,
                 CASE WHEN ct.ciclo_asignado = $2 THEN 'actual' ELSE 'futuro' END AS resumen_relativo
          FROM consumos_tarjeta ct
          JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
          LEFT JOIN cierres_tarjeta crt ON crt.id = ct.cierre_id
          WHERE tc.hogar_id = $1
            AND ($3::BIGINT IS NULL OR ct.tarjeta_id = $3)
            AND (
              ct.ciclo_asignado >= $2
              OR TO_CHAR(TO_DATE(ct.ciclo_asignado || '-01', 'YYYY-MM-DD') + (GREATEST(ct.cantidad_cuotas - ct.cuota_inicial, 0) || ' months')::INTERVAL, 'YYYY-MM') >= $2
              OR (ct.repite_mes_siguiente AND TO_CHAR(TO_DATE(ct.ciclo_asignado || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM') >= $2)
            )
          ORDER BY ct.fecha_compra DESC, ct.id DESC
          `,
          [hogarId, ciclo, tarjetaConsultaId]
        )
      : { rows: [] };
    const { rows: consumosRegistrados } = cicloEsValido(ciclo)
      ? await pool.query(
          `
          SELECT ct.id, ct.tarjeta_id, ct.cierre_id, ct.ciclo_asignado, ct.fecha_compra,
                 ct.descripcion, ct.categoria, ct.moneda, ct.monto_total,
                 ct.cantidad_cuotas, ct.monto_cuota, ct.cuota_inicial,
                 ct.titular, ct.observaciones
          FROM consumos_tarjeta ct
          JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
          WHERE tc.hogar_id = $1
            AND ($2::BIGINT IS NULL OR ct.tarjeta_id = $2)
          ORDER BY ct.fecha_compra DESC, ct.id DESC
          `,
          [hogarId, tarjetaConsultaId]
        )
      : { rows: [] };
    const { rows: consumosAnalisisBase } = cicloEsValido(ciclo)
      ? await pool.query(
          `
          SELECT ct.id, ct.tarjeta_id, ct.cierre_id, ct.ciclo_asignado, ct.fecha_compra,
                 ct.descripcion, ct.categoria, ct.moneda, ct.monto_total,
                 ct.cantidad_cuotas, ct.monto_cuota, ct.cuota_inicial, ct.repite_mes_siguiente,
                 ct.titular, ct.observaciones,
                 crt.fecha_cierre,
                 CASE WHEN ct.ciclo_asignado = $2 THEN 'actual' ELSE 'historico' END AS resumen_relativo
          FROM consumos_tarjeta ct
          JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
          LEFT JOIN cierres_tarjeta crt ON crt.id = ct.cierre_id
          WHERE tc.hogar_id = $1
            AND ($3::BIGINT IS NULL OR ct.tarjeta_id = $3)
          ORDER BY ct.fecha_compra DESC, ct.id DESC
          `,
          [hogarId, ciclo, tarjetaConsultaId]
        )
      : { rows: [] };
    const { rows: consumosTodasTarjetasBase } = cicloEsValido(ciclo)
      ? await pool.query(
          `
          SELECT ct.id, ct.tarjeta_id, ct.cierre_id, ct.ciclo_asignado, ct.fecha_compra,
                 ct.descripcion, ct.categoria, ct.moneda, ct.monto_total,
                 ct.cantidad_cuotas, ct.monto_cuota, ct.cuota_inicial, ct.repite_mes_siguiente,
                 ct.titular, ct.observaciones,
                 crt.fecha_cierre,
                 CASE WHEN ct.ciclo_asignado = $2 THEN 'actual' ELSE 'futuro' END AS resumen_relativo
          FROM consumos_tarjeta ct
          JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
          LEFT JOIN cierres_tarjeta crt ON crt.id = ct.cierre_id
          WHERE tc.hogar_id = $1
            AND tc.activa = true
            AND (
              ct.ciclo_asignado >= $2
              OR TO_CHAR(TO_DATE(ct.ciclo_asignado || '-01', 'YYYY-MM-DD') + (GREATEST(ct.cantidad_cuotas - ct.cuota_inicial, 0) || ' months')::INTERVAL, 'YYYY-MM') >= $2
              OR (ct.repite_mes_siguiente AND TO_CHAR(TO_DATE(ct.ciclo_asignado || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM') >= $2)
            )
          ORDER BY ct.fecha_compra DESC, ct.id DESC
          `,
          [hogarId, ciclo]
        )
      : { rows: [] };
    const consumosExpandidosVista = expandirConsumosTarjeta(consumosBase);
    const consumosExpandidosAnalisis = expandirConsumosTarjeta(consumosAnalisisBase);
    const consumosExpandidosTodasTarjetas = expandirConsumosTarjeta(consumosTodasTarjetasBase);
    const consumos = consumosExpandidosVista
      .filter((item) => compararCiclos(item.ciclo_asignado, ciclo) >= 0)
      .sort((a, b) => compararCiclos(b.ciclo_asignado, a.ciclo_asignado) || new Date(b.fecha_compra) - new Date(a.fecha_compra));

    const resumen = consumos.filter((item) => item.ciclo_asignado === ciclo).reduce(
      (acc, item) => {
        if (item.moneda === 'USD') acc.total_usd += Number(item.monto_resumen || item.monto_cuota || 0);
        else acc.total_ars += Number(item.monto_resumen || item.monto_cuota || 0);
        acc.consumos += 1;
        return acc;
      },
      { total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 }
    );
    resumen.cuotas_futuras = consumos.filter((item) => compararCiclos(item.ciclo_asignado, ciclo) > 0).length;
    const resumenPorTarjetaMap = new Map(tarjetas.map((tarjeta) => [
      Number(tarjeta.id),
      { tarjeta_id: tarjeta.id, nombre: tarjeta.nombre, total_ars: 0, total_usd: 0, consumos: 0 }
    ]));
    consumosExpandidosTodasTarjetas
      .filter((item) => item.ciclo_asignado === ciclo)
      .forEach((item) => {
        const bucket = resumenPorTarjetaMap.get(Number(item.tarjeta_id));
        if (!bucket) return;
        const monto = Number(item.monto_resumen || item.monto_cuota || 0);
        if (item.moneda === 'USD') bucket.total_usd += monto;
        else bucket.total_ars += monto;
        bucket.consumos += 1;
      });
    const resumenTarjetas = Array.from(resumenPorTarjetaMap.values());
    const resumenTodasTarjetas = resumenTarjetas.reduce(
      (acc, item) => {
        acc.total_ars += Number(item.total_ars || 0);
        acc.total_usd += Number(item.total_usd || 0);
        acc.consumos += Number(item.consumos || 0);
        return acc;
      },
      { total_ars: 0, total_usd: 0, consumos: 0 }
    );

    const { rows: cierresHistorial } = tarjetaConsultaId
      ? await pool.query(
          `
          SELECT cr.id, cr.tarjeta_id, cr.ciclo, cr.fecha_cierre, cr.fecha_vencimiento, cr.estado
          FROM cierres_tarjeta cr
          WHERE cr.tarjeta_id = $1
          ORDER BY cr.ciclo DESC
          LIMIT 48
          `,
          [tarjetaConsultaId]
        )
      : { rows: [] };
    const historialResumenes = cierresHistorial.map((cierre) => {
      const cuotasResumen = consumosExpandidosAnalisis.filter((item) => item.ciclo_asignado === cierre.ciclo);
      return cuotasResumen.reduce(
        (acc, item) => {
          if (item.moneda === 'USD') acc.total_usd += Number(item.monto_resumen || item.monto_cuota || 0);
          else acc.total_ars += Number(item.monto_resumen || item.monto_cuota || 0);
          acc.consumos += 1;
          return acc;
        },
        { ...cierre, total_ars: 0, total_usd: 0, consumos: 0 }
      );
    });
    const analisisTarjeta = construirAnalisisTarjeta(consumosExpandidosAnalisis, historialResumenes, ciclo);

    return res.status(200).json({
      tarjetas,
      cierre: cierreActual || null,
      consumos,
      consumos_registrados: consumosRegistrados,
      resumen,
      resumen_tarjetas: resumenTarjetas,
      resumen_todas_tarjetas: resumenTodasTarjetas,
      historial_resumenes: historialResumenes,
      analisis_tarjeta: analisisTarjeta
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando tarjetas', detalle: error.message });
  }
});

app.post('/tarjetas-credito/consumos', async (req, res) => {
  const {
    tarjeta_id,
    ciclo_actual,
    fecha_compra,
    cierre_id,
    descripcion,
    categoria,
    moneda,
    monto_total,
    cuota_actual,
    cuota_inicial,
    cantidad_cuotas = 1,
    monto_cuota,
    titular,
    observaciones
  } = req.body || {};
  const tarjetaId = Number(tarjeta_id);
  const cierreId = Number(cierre_id || 0);
  const cuotas = Number(cantidad_cuotas || 1);
  const cuotaInicialInformada = Number(cuota_actual || cuota_inicial || 1);
  const montoTotal = Number(monto_total || 0);
  const montoCuota = Number(monto_cuota || 0);
  const auditoriaUsuarioId = usuarioAuditoriaId(req);

  if (!tarjetaId || !fecha_compra || !descripcion || !moneda || !cuotas) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (!parseFecha(fecha_compra)) return res.status(400).json({ error: 'fecha_compra debe tener formato YYYY-MM-DD' });
  if (!['ARS', 'USD'].includes(moneda)) return res.status(400).json({ error: 'moneda debe ser ARS o USD' });
  if (!Number.isInteger(cuotas) || cuotas < 1) return res.status(400).json({ error: 'cantidad_cuotas debe ser mayor o igual a 1' });
  if (!Number.isInteger(cuotaInicialInformada) || cuotaInicialInformada < 1 || cuotaInicialInformada > cuotas) return res.status(400).json({ error: 'cuota_actual debe estar entre 1 y cantidad_cuotas' });
  if (!esNumeroPositivo(montoTotal) && !esNumeroPositivo(montoCuota)) {
    return res.status(400).json({ error: 'Informá monto total o monto de cuota' });
  }

  try {
    await asegurarTarjetasCredito();

    const { rows: tarjetaRows } = await pool.query(
      `
      SELECT id, hogar_id, dia_cierre_default, dia_vencimiento_default
      FROM tarjetas_credito
      WHERE id = $1 AND activa = true
      `,
      [tarjetaId]
    );
    if (tarjetaRows.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada' });

    const tarjeta = tarjetaRows[0];
    if (!puedeOperarHogar(req.usuario, Number(tarjeta.hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para operar esta tarjeta' });
    }

    let cicloAsignado;
    let cierreAsignado;
    if (cierreId) {
      const { rows: cierreRows } = await pool.query(
        'SELECT id, tarjeta_id, ciclo, estado FROM cierres_tarjeta WHERE id = $1 AND tarjeta_id = $2 LIMIT 1',
        [cierreId, tarjetaId]
      );
      if (cierreRows.length === 0) return res.status(404).json({ error: 'Resumen de tarjeta no encontrado' });
      cierreAsignado = cierreRows[0];
      cicloAsignado = cierreAsignado.ciclo;
    } else {
      ({ cicloAsignado, cierreAsignado } = await resolverResumenCompraTarjeta(tarjeta, fecha_compra, auditoriaUsuarioId));
    }
    if (cierreAsignado?.estado === 'cerrado') {
      return res.status(409).json({ error: 'El resumen asignado esta cerrado' });
    }
    const cuotaInicial = calcularCuotaInicialCompra(cuotas, cuota_actual, cuota_inicial, cicloAsignado, fecha_compra);
    const totalFinal = esNumeroPositivo(montoTotal) ? montoTotal : Number((montoCuota * cuotas).toFixed(2));
    const cuotaFinal = esNumeroPositivo(montoCuota) ? montoCuota : Number((totalFinal / cuotas).toFixed(2));
    const repiteMesSiguiente = cuotas === 1 && esCategoriaSuscripcion(categoria);
    const cuotasRestantes = Math.max(cuotas - cuotaInicial + 1, 1);
    await asegurarCierresCuotasAbiertos(tarjeta, cicloAsignado, cuotasRestantes, auditoriaUsuarioId);
    await asegurarSuscripcionMesSiguienteAbierta(tarjeta, cicloAsignado, repiteMesSiguiente, auditoriaUsuarioId);

    const { rows } = await pool.query(
      `
      INSERT INTO consumos_tarjeta (
        tarjeta_id, cierre_id, ciclo_asignado, fecha_compra, descripcion, categoria,
        moneda, monto_total, cantidad_cuotas, monto_cuota, cuota_inicial, repite_mes_siguiente,
        titular, observaciones, creado_por_usuario_id, actualizado_por_usuario_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
      RETURNING *
      `,
      [
        tarjetaId,
        cierreAsignado.id,
        cicloAsignado,
        fecha_compra,
        String(descripcion).trim(),
        categoria ? String(categoria).trim() : null,
        moneda,
        totalFinal,
        cuotas,
        cuotaFinal,
        cuotaInicial,
        repiteMesSiguiente,
        titular ? String(titular).trim() : null,
        observaciones ? String(observaciones).trim() : null,
        auditoriaUsuarioId
      ]
    );

    return res.status(201).json({ item: rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Error creando consumo de tarjeta', detalle: error.message });
  }
});

app.post('/tarjetas-credito/consumos/importar', async (req, res) => {
  const consumos = Array.isArray(req.body?.consumos) ? req.body.consumos : [];
  if (consumos.length === 0) return res.status(400).json({ error: 'No hay consumos para importar' });

  const client = await pool.connect();
  const writeProgress = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
    if (typeof res.flush === 'function') res.flush();
  };
  try {
    await asegurarTarjetasCredito({ recalcular: false });
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    await client.query('BEGIN');
    const items = [];
    const tarjetaCache = new Map();
    const cierreCache = new Map();
    for (const payload of consumos) {
      const {
        tarjeta_id,
        fecha_compra,
        cierre_id,
        descripcion,
        categoria,
        moneda,
        monto_total,
        cuota_actual,
        cuota_inicial,
        cantidad_cuotas = 1,
        monto_cuota,
        titular,
        observaciones
      } = payload || {};
      const tarjetaId = Number(tarjeta_id);
      const cierreId = Number(cierre_id || 0);
      const cuotas = Number(cantidad_cuotas || 1);
      const cuotaInicialInformada = Number(cuota_actual || cuota_inicial || 1);
      const montoTotal = Number(monto_total || 0);
      const montoCuota = Number(monto_cuota || 0);
      const auditoriaUsuarioId = usuarioAuditoriaId(req);

      if (!tarjetaId || !fecha_compra || !descripcion || !moneda || !cuotas) throw Object.assign(new Error('Faltan campos obligatorios'), { statusCode: 400 });
      if (!parseFecha(fecha_compra)) throw Object.assign(new Error('fecha_compra debe tener formato YYYY-MM-DD'), { statusCode: 400 });
      if (!['ARS', 'USD'].includes(moneda)) throw Object.assign(new Error('moneda debe ser ARS o USD'), { statusCode: 400 });
      if (!Number.isInteger(cuotas) || cuotas < 1) throw Object.assign(new Error('cantidad_cuotas debe ser mayor o igual a 1'), { statusCode: 400 });
      if (!Number.isInteger(cuotaInicialInformada) || cuotaInicialInformada < 1 || cuotaInicialInformada > cuotas) throw Object.assign(new Error('cuota_actual debe estar entre 1 y cantidad_cuotas'), { statusCode: 400 });
      if (!esNumeroPositivo(montoTotal) && !esNumeroPositivo(montoCuota)) throw Object.assign(new Error('Informa monto total o monto de cuota'), { statusCode: 400 });

      let tarjeta = tarjetaCache.get(tarjetaId);
      if (!tarjeta) {
        const { rows: tarjetaRows } = await client.query(
          `
          SELECT id, hogar_id, dia_cierre_default, dia_vencimiento_default
          FROM tarjetas_credito
          WHERE id = $1 AND activa = true
          `,
          [tarjetaId]
        );
        if (tarjetaRows.length === 0) throw Object.assign(new Error('Tarjeta no encontrada'), { statusCode: 404 });
        tarjeta = tarjetaRows[0];
        tarjetaCache.set(tarjetaId, tarjeta);
      }
      if (!puedeOperarHogar(req.usuario, Number(tarjeta.hogar_id))) throw Object.assign(new Error('No tenes permisos para operar esta tarjeta'), { statusCode: 403 });

      let cicloAsignado;
      let cierreAsignado;
      if (cierreId) {
        const { rows: cierreRows } = await client.query(
          'SELECT id, tarjeta_id, ciclo, estado FROM cierres_tarjeta WHERE id = $1 AND tarjeta_id = $2 LIMIT 1',
          [cierreId, tarjetaId]
        );
        if (cierreRows.length === 0) throw Object.assign(new Error('Resumen de tarjeta no encontrado'), { statusCode: 404 });
        cierreAsignado = cierreRows[0];
        cicloAsignado = cierreAsignado.ciclo;
      } else {
        ({ cicloAsignado, cierreAsignado } = await resolverResumenCompraTarjeta(tarjeta, fecha_compra, auditoriaUsuarioId, client));
      }
      const cierreCacheKey = `${tarjetaId}:${cicloAsignado}`;
      if (cierreCache.has(cierreCacheKey)) cierreAsignado = cierreCache.get(cierreCacheKey);
      else cierreCache.set(cierreCacheKey, cierreAsignado);
      if (cierreAsignado?.estado === 'cerrado') throw Object.assign(new Error('El resumen asignado esta cerrado'), { statusCode: 409 });

      const cuotaInicial = calcularCuotaInicialCompra(cuotas, cuota_actual, cuota_inicial, cicloAsignado, fecha_compra);
      const totalFinal = esNumeroPositivo(montoTotal) ? montoTotal : Number((montoCuota * cuotas).toFixed(2));
      const cuotaFinal = esNumeroPositivo(montoCuota) ? montoCuota : Number((totalFinal / cuotas).toFixed(2));
      const repiteMesSiguiente = cuotas === 1 && esCategoriaSuscripcion(categoria);
      const cuotasRestantes = Math.max(cuotas - cuotaInicial + 1, 1);
      await asegurarCierresCuotasAbiertos(tarjeta, cicloAsignado, cuotasRestantes, auditoriaUsuarioId, client);
      await asegurarSuscripcionMesSiguienteAbierta(tarjeta, cicloAsignado, repiteMesSiguiente, auditoriaUsuarioId, client);

      const { rows } = await client.query(
        `
        INSERT INTO consumos_tarjeta (
          tarjeta_id, cierre_id, ciclo_asignado, fecha_compra, descripcion, categoria,
          moneda, monto_total, cantidad_cuotas, monto_cuota, cuota_inicial, repite_mes_siguiente,
          titular, observaciones, creado_por_usuario_id, actualizado_por_usuario_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        RETURNING *
        `,
        [
          tarjetaId,
          cierreAsignado.id,
          cicloAsignado,
          fecha_compra,
          String(descripcion).trim(),
          categoria ? String(categoria).trim() : null,
          moneda,
          totalFinal,
          cuotas,
          cuotaFinal,
          cuotaInicial,
          repiteMesSiguiente,
          titular ? String(titular).trim() : null,
          observaciones ? String(observaciones).trim() : null,
          auditoriaUsuarioId
        ]
      );
      items.push(rows[0]);
      writeProgress({ type: 'progress', processed: items.length, total: consumos.length });
    }
    await client.query('COMMIT');
    writeProgress({ type: 'done', processed: items.length, total: consumos.length, importados: items.length });
    return res.end();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (res.headersSent) {
      writeProgress({ type: 'error', error: error.statusCode ? error.message : 'Error importando consumos de tarjeta' });
      return res.end();
    }
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Error importando consumos de tarjeta', detalle: error.message });
  } finally {
    client.release();
  }
});

app.patch('/tarjetas-credito/consumos/:id', async (req, res) => {
  const consumoId = Number(req.params.id);
  const {
    tarjeta_id,
    ciclo_actual,
    fecha_compra,
    descripcion,
    categoria,
    moneda,
    monto_total,
    cantidad_cuotas = 1,
    monto_cuota,
    titular,
    observaciones
  } = req.body || {};
  const tarjetaId = Number(tarjeta_id);
  const cuotas = Number(cantidad_cuotas || 1);
  const montoTotal = Number(monto_total || 0);
  const montoCuota = Number(monto_cuota || 0);
  const auditoriaUsuarioId = usuarioAuditoriaId(req);

  if (!consumoId) return res.status(400).json({ error: 'id invalido' });
  if (!tarjetaId || !fecha_compra || !descripcion || !moneda || !cuotas) return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!parseFecha(fecha_compra)) return res.status(400).json({ error: 'fecha_compra debe tener formato YYYY-MM-DD' });
  if (!['ARS', 'USD'].includes(moneda)) return res.status(400).json({ error: 'moneda debe ser ARS o USD' });
  if (!Number.isInteger(cuotas) || cuotas < 1) return res.status(400).json({ error: 'cantidad_cuotas debe ser mayor o igual a 1' });
  if (!esNumeroPositivo(montoTotal) && !esNumeroPositivo(montoCuota)) return res.status(400).json({ error: 'Informa monto total o monto de cuota' });

  try {
    await asegurarTarjetasCredito();
    const { rows: tarjetaRows } = await pool.query(
      'SELECT id, hogar_id, dia_cierre_default, dia_vencimiento_default FROM tarjetas_credito WHERE id = $1 AND activa = true',
      [tarjetaId]
    );
    if (tarjetaRows.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    const tarjeta = tarjetaRows[0];
    if (!puedeOperarHogar(req.usuario, Number(tarjeta.hogar_id))) return res.status(403).json({ error: 'No tenes permisos para operar esta tarjeta' });

    const { rows: consumoActualRows } = await pool.query(
      `
      SELECT ct.id, ct.tarjeta_id, ct.ciclo_asignado, ct.cantidad_cuotas, cr.estado
      FROM consumos_tarjeta ct
      LEFT JOIN cierres_tarjeta cr ON cr.id = ct.cierre_id
      WHERE ct.id = $1
      `,
      [consumoId]
    );
    if (consumoActualRows.length === 0) return res.status(404).json({ error: 'Consumo no encontrado' });
    if (consumoActualRows[0].estado === 'cerrado') {
      return res.status(409).json({ error: 'El resumen asignado esta cerrado' });
    }
    const consumoActual = consumoActualRows[0];
    const tarjetaOriginal = Number(consumoActual.tarjeta_id) === Number(tarjeta.id)
      ? tarjeta
      : (await pool.query(
          'SELECT id, hogar_id, dia_cierre_default, dia_vencimiento_default FROM tarjetas_credito WHERE id = $1 AND activa = true',
          [consumoActual.tarjeta_id]
        )).rows[0];
    if (tarjetaOriginal) {
      await asegurarCierresCuotasAbiertos(tarjetaOriginal, consumoActual.ciclo_asignado, consumoActual.cantidad_cuotas, auditoriaUsuarioId);
    }

    const { cicloAsignado, cierreAsignado } = await resolverResumenCompraTarjeta(tarjeta, fecha_compra, auditoriaUsuarioId);
    if (cierreAsignado?.estado === 'cerrado') {
      return res.status(409).json({ error: 'El resumen asignado esta cerrado' });
    }
    const totalFinal = esNumeroPositivo(montoTotal) ? montoTotal : Number((montoCuota * cuotas).toFixed(2));
    const cuotaFinal = esNumeroPositivo(montoCuota) ? montoCuota : Number((totalFinal / cuotas).toFixed(2));
    const repiteMesSiguiente = cuotas === 1 && esCategoriaSuscripcion(categoria);
    await asegurarCierresCuotasAbiertos(tarjeta, cicloAsignado, cuotas, auditoriaUsuarioId);
    await asegurarSuscripcionMesSiguienteAbierta(tarjeta, cicloAsignado, repiteMesSiguiente, auditoriaUsuarioId);

    const { rows } = await pool.query(
      `
      UPDATE consumos_tarjeta
      SET tarjeta_id = $1,
          cierre_id = $2,
          ciclo_asignado = $3,
          fecha_compra = $4,
          descripcion = $5,
          categoria = $6,
          moneda = $7,
          monto_total = $8,
          cantidad_cuotas = $9,
          monto_cuota = $10,
          repite_mes_siguiente = $11,
          titular = $12,
          observaciones = $13,
          actualizado_por_usuario_id = $14,
          actualizado_en = NOW()
      WHERE id = $15
      RETURNING *
      `,
      [
        tarjetaId,
        cierreAsignado.id,
        cicloAsignado,
        fecha_compra,
        String(descripcion).trim(),
        categoria ? String(categoria).trim() : null,
        moneda,
        totalFinal,
        cuotas,
        cuotaFinal,
        repiteMesSiguiente,
        titular ? String(titular).trim() : null,
        observaciones ? String(observaciones).trim() : null,
        auditoriaUsuarioId,
        consumoId
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Consumo no encontrado' });
    return res.status(200).json({ item: rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Error actualizando consumo de tarjeta', detalle: error.message });
  }
});

app.delete('/tarjetas-credito/consumos/:id', async (req, res) => {
  const consumoId = Number(req.params.id);
  const cicloActual = String(req.query.ciclo_actual || '');
  if (!consumoId) return res.status(400).json({ error: 'id invalido' });
  if (cicloActual && !cicloEsValido(cicloActual)) return res.status(400).json({ error: 'ciclo_actual invalido' });

  try {
    await asegurarTarjetasCredito();
    const { rows: permisoRows } = await pool.query(
      `
      SELECT tc.hogar_id, tc.id, tc.dia_cierre_default, tc.dia_vencimiento_default,
             ct.ciclo_asignado, ct.cantidad_cuotas, cr.estado
      FROM consumos_tarjeta ct
      JOIN tarjetas_credito tc ON tc.id = ct.tarjeta_id
      LEFT JOIN cierres_tarjeta cr ON cr.id = ct.cierre_id
      WHERE ct.id = $1
      `,
      [consumoId]
    );
    if (permisoRows.length === 0) return res.status(404).json({ error: 'Consumo no encontrado' });
    const consumo = permisoRows[0];
    if (!puedeOperarHogar(req.usuario, Number(consumo.hogar_id))) return res.status(403).json({ error: 'No tenes permisos para operar este consumo' });
    if (cicloActual) {
      const { rows: cierreActualRows } = await pool.query(
        'SELECT estado FROM cierres_tarjeta WHERE tarjeta_id = $1 AND ciclo = $2',
        [consumo.id, cicloActual]
      );
      if (cierreActualRows[0]?.estado === 'cerrado') return res.status(409).json({ error: 'El resumen seleccionado esta cerrado' });
    } else if (consumo.estado === 'cerrado') {
      return res.status(409).json({ error: 'El resumen asignado esta cerrado' });
    }

    await pool.query('DELETE FROM consumos_tarjeta WHERE id = $1', [consumoId]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Error eliminando consumo de tarjeta', detalle: error.message });
  }
});

app.patch('/tarjetas-credito/cierres/:id', async (req, res) => {
  const cierreId = Number(req.params.id);
  const { estado, fecha_cierre, fecha_vencimiento } = req.body || {};
  const auditoriaUsuarioId = usuarioAuditoriaId(req);

  if (!cierreId) return res.status(400).json({ error: 'id invalido' });
  if (estado !== undefined && !['abierto', 'cerrado'].includes(estado)) return res.status(400).json({ error: 'estado invalido' });
  if (fecha_cierre !== undefined && !parseFecha(fecha_cierre)) return res.status(400).json({ error: 'fecha_cierre invalida' });
  if (fecha_vencimiento && !parseFecha(fecha_vencimiento)) return res.status(400).json({ error: 'fecha_vencimiento invalida' });

  try {
    await asegurarTarjetasCredito();
    const { rows: permisoRows } = await pool.query(
      `
      SELECT tc.hogar_id
      FROM cierres_tarjeta cr
      JOIN tarjetas_credito tc ON tc.id = cr.tarjeta_id
      WHERE cr.id = $1
      `,
      [cierreId]
    );
    if (permisoRows.length === 0) return res.status(404).json({ error: 'Resumen no encontrado' });
    if (!puedeOperarHogar(req.usuario, Number(permisoRows[0].hogar_id))) return res.status(403).json({ error: 'No tenes permisos para operar este resumen' });

    const { rows } = await pool.query(
      `
      UPDATE cierres_tarjeta
      SET estado = COALESCE($1, estado),
          fecha_cierre = COALESCE($2, fecha_cierre),
          fecha_vencimiento = CASE WHEN $3 THEN $4 ELSE fecha_vencimiento END,
          actualizado_por_usuario_id = $5,
          actualizado_en = NOW(),
          updated_at = NOW()
      WHERE id = $6
      RETURNING id, tarjeta_id, ciclo, fecha_cierre, fecha_vencimiento, estado,
                creado_en, actualizado_en, created_at, updated_at
      `,
      [
        estado === undefined ? null : estado,
        fecha_cierre === undefined ? null : fecha_cierre,
        fecha_vencimiento !== undefined,
        fecha_vencimiento || null,
        auditoriaUsuarioId,
        cierreId
      ]
    );
    return res.status(200).json({ item: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando resumen de tarjeta', detalle: error.message });
  }
});

app.post('/tarjetas-credito/cierres/:id/generar-movimiento', async (req, res) => {
  const cierreId = Number(req.params.id);
  const auditoriaUsuarioId = usuarioAuditoriaId(req);
  if (!cierreId) return res.status(400).json({ error: 'id invalido' });

  try {
    await asegurarTarjetasCredito({ recalcular: false });
    await asegurarColumnasEstadoMovimientos();

    const { rows: cierreRows } = await pool.query(
      `
      SELECT cr.id, cr.tarjeta_id, cr.ciclo, cr.fecha_cierre, cr.fecha_vencimiento, cr.estado,
             tc.hogar_id, tc.nombre AS tarjeta_nombre
      FROM cierres_tarjeta cr
      JOIN tarjetas_credito tc ON tc.id = cr.tarjeta_id
      WHERE cr.id = $1
      `,
      [cierreId]
    );
    const cierre = cierreRows[0];
    if (!cierre) return res.status(404).json({ error: 'Resumen no encontrado' });
    if (!puedeOperarHogar(req.usuario, Number(cierre.hogar_id))) return res.status(403).json({ error: 'No tenes permisos para operar este hogar' });
    if (cierre.estado !== 'cerrado') return res.status(409).json({ error: 'Solo se puede generar el egreso con el resumen cerrado' });

    const { rows: consumosBase } = await pool.query(
      `
      SELECT id, tarjeta_id, cierre_id, ciclo_asignado, fecha_compra, descripcion, categoria, moneda,
             monto_total, cantidad_cuotas, monto_cuota, cuota_inicial, repite_mes_siguiente
      FROM consumos_tarjeta
      WHERE tarjeta_id = $1
      `,
      [cierre.tarjeta_id]
    );
    const resumen = resumirCicloTarjeta(cierre.ciclo, expandirConsumosTarjeta(consumosBase));
    const totalArs = Number(resumen.total_ars || 0);
    if (!esNumeroPositivo(totalArs)) return res.status(400).json({ error: 'El resumen no tiene total ARS para generar el egreso' });

    const { rows: tipoRows } = await pool.query("SELECT id FROM tipos_movimiento WHERE codigo = 'egreso' LIMIT 1");
    const tipoEgresoId = Number(tipoRows[0]?.id || 0);
    const { rows: categoriaRows } = await pool.query(
      `
      SELECT c.id
      FROM categorias c
      JOIN tipos_movimiento tm ON tm.id = c.tipo_movimiento_id
      WHERE c.hogar_id = $1 AND tm.codigo = 'egreso' AND LOWER(c.nombre) = 'tarjeta'
      LIMIT 1
      `,
      [cierre.hogar_id]
    );
    const categoriaTarjetaId = Number(categoriaRows[0]?.id || 0);
    if (!tipoEgresoId || !categoriaTarjetaId) return res.status(400).json({ error: 'No se encontro la categoria Tarjeta para egresos' });

    const descripcion = `TC ${cierre.tarjeta_nombre} - ${formatCycleLabelBackend(cierre.ciclo)}`;
    const fechaMovimiento = fechaIso(cierre.fecha_vencimiento || cierre.fecha_cierre);
    const { rows: duplicadoRows } = await pool.query(
      `
      SELECT id, descripcion, monto_ars, fecha
      FROM movimientos
      WHERE hogar_id = $1
        AND activo = true
        AND categoria_id = $2
        AND ABS(monto_ars - $3) <= 0.01
        AND (
          referencia_ciclo_cierre = $4
          OR (referencia_ciclo_cierre IS NULL AND TO_CHAR(fecha, 'YYYY-MM') = $4)
        )
      `,
      [cierre.hogar_id, categoriaTarjetaId, totalArs, cierre.ciclo]
    );
    const descripcionNormalizada = normalizarTexto(descripcion);
    const duplicado = duplicadoRows.find((item) => {
      const actual = normalizarTexto(item.descripcion);
      return actual === descripcionNormalizada || actual.includes(descripcionNormalizada) || descripcionNormalizada.includes(actual);
    });
    if (duplicado) {
      return res.status(409).json({
        error: 'Ya existe un movimiento similar para este resumen.',
        duplicate: true,
        movimiento: duplicado
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO movimientos (
        hogar_id, cuenta_id, tipo_movimiento_id, categoria_id, fecha, descripcion,
        moneda_original, monto_original, monto_ars, usa_ahorro, estado_egreso, estado_ingreso,
        clasificacion_movimiento, referencia_ciclo_cierre, origen, referencia_tarjeta_id,
        referencia_cierre_tarjeta_id, creado_por_usuario_id, actualizado_por_usuario_id
      )
      VALUES ($1,NULL,$2,$3,$4,$5,'ARS',$6,$6,false,'pendiente',NULL,'normal',$7,'tarjeta_credito',$8,$9,$10,$10)
      RETURNING id, fecha, descripcion, monto_ars
      `,
      [
        cierre.hogar_id,
        tipoEgresoId,
        categoriaTarjetaId,
        fechaMovimiento,
        descripcion,
        totalArs,
        cierre.ciclo,
        cierre.tarjeta_id,
        cierre.id,
        auditoriaUsuarioId
      ]
    );

    return res.status(201).json({ item: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error generando movimiento del resumen', detalle: error.message });
  }
});

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
    await asegurarColumnasEstadoMovimientosLectura();

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
          m.categoria_id,
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
          m.creado_en,
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
          m.categoria_id,
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
          m.creado_en,
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
  const creadorId = usuarioAuditoriaId(req);

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
      [1, 3].includes(Number(tipo_movimiento_id)) ? (estado_ingreso || 'registrado') : null;

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
  const {
    descripcion,
    categoria_id,
    cuenta_id,
    fecha,
    tipo_movimiento_id,
    monto_original,
    monto_ars,
    usa_ahorro,
    estado_egreso,
    estado_ingreso
  } = req.body;
  const payload = req.body || {};
  const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);

  if (!movimientoId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    await asegurarColumnasEstadoMovimientos();

    const { rows: movimientoRows } = await pool.query(
      'SELECT hogar_id, tipo_movimiento_id FROM movimientos WHERE id = $1',
      [movimientoId]
    );
    if (movimientoRows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    const hogarMovimientoId = Number(movimientoRows[0].hogar_id);
    const tipoMovimientoActual = Number(movimientoRows[0].tipo_movimiento_id);
    if (!puedeOperarHogar(req.usuario, hogarMovimientoId)) {
      return res.status(403).json({ error: 'No tenes acceso a este movimiento' });
    }
    if (!puedeGestionarHogar(req.usuario, hogarMovimientoId) && !esPatchEstadoMovimiento(req.body)) {
      return res.status(403).json({ error: 'Tu rol solo permite cambiar estados de movimientos' });
    }

    const tipoMovimientoFinal = hasField('tipo_movimiento_id') ? Number(tipo_movimiento_id) : tipoMovimientoActual;

    if (hasField('tipo_movimiento_id') && ![1, 2, 3].includes(tipoMovimientoFinal)) {
      return res.status(400).json({ error: 'tipo_movimiento_id debe ser 1, 2 o 3' });
    }

    if (hasField('fecha') && !parseFecha(fecha)) {
      return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
    }

    if (hasField('monto_original') && !esNumeroPositivo(monto_original)) {
      return res.status(400).json({ error: 'monto_original debe ser mayor a 0' });
    }

    if (hasField('monto_ars') && !esNumeroPositivo(monto_ars)) {
      return res.status(400).json({ error: 'monto_ars debe ser mayor a 0' });
    }

    if (categoria_id) {
      const { rows: categoriaRows } = await pool.query(
        'SELECT id, tipo_movimiento_id FROM categorias WHERE id = $1 AND hogar_id = $2 AND activo = true',
        [categoria_id, hogarMovimientoId]
      );
      if (categoriaRows.length === 0) {
        return res.status(400).json({ error: 'La categoria no existe para este hogar' });
      }
      if (Number(categoriaRows[0].tipo_movimiento_id) !== tipoMovimientoFinal) {
        return res.status(400).json({ error: 'La categoría no corresponde al tipo de movimiento seleccionado' });
      }
    }

    const estadoEgresoFinal =
      hasField('estado_egreso') || hasField('tipo_movimiento_id')
        ? (tipoMovimientoFinal === 2 ? (estado_egreso ?? null) : null)
        : undefined;
    const estadoIngresoFinal =
      hasField('estado_ingreso') || hasField('tipo_movimiento_id')
        ? ([1, 3].includes(tipoMovimientoFinal) ? (estado_ingreso ?? null) : null)
        : undefined;

    let rows = [];
    try {
      const result = await pool.query(
        `
        UPDATE movimientos
        SET descripcion = CASE WHEN $1 THEN $2 ELSE descripcion END,
            categoria_id = CASE WHEN $3 THEN $4 ELSE categoria_id END,
            cuenta_id = CASE WHEN $5 THEN $6 ELSE cuenta_id END,
            fecha = CASE WHEN $7 THEN $8 ELSE fecha END,
            tipo_movimiento_id = CASE WHEN $9 THEN $10 ELSE tipo_movimiento_id END,
            monto_original = CASE WHEN $11 THEN $12 ELSE monto_original END,
            monto_ars = CASE WHEN $13 THEN $14 ELSE monto_ars END,
            usa_ahorro = CASE WHEN $15 THEN $16 ELSE usa_ahorro END,
            estado_egreso = CASE WHEN $17 THEN $18 ELSE estado_egreso END,
            estado_ingreso = CASE WHEN $19 THEN $20 ELSE estado_ingreso END,
            actualizado_por_usuario_id = $21
        WHERE id = $22 AND activo = true
        RETURNING id, fecha, descripcion, categoria_id, cuenta_id, tipo_movimiento_id, monto_original, monto_ars, usa_ahorro, estado_egreso, estado_ingreso, activo
        `,
        [
          hasField('descripcion'),
          descripcion ?? null,
          hasField('categoria_id'),
          categoria_id ?? null,
          hasField('cuenta_id'),
          cuenta_id ?? null,
          hasField('fecha'),
          fecha ?? null,
          hasField('tipo_movimiento_id'),
          tipoMovimientoFinal,
          hasField('monto_original'),
          monto_original ?? null,
          hasField('monto_ars'),
          monto_ars ?? null,
          hasField('usa_ahorro'),
          Boolean(usa_ahorro),
          hasField('estado_egreso') || hasField('tipo_movimiento_id'),
          estadoEgresoFinal,
          hasField('estado_ingreso') || hasField('tipo_movimiento_id'),
          estadoIngresoFinal,
          usuarioAuditoriaId(req),
          movimientoId
        ]
      );
      rows = result.rows;
    } catch (queryError) {
      if (queryError.code !== '42703') throw queryError;
      const resultFallback = await pool.query(
        `
        UPDATE movimientos
        SET descripcion = CASE WHEN $1 THEN $2 ELSE descripcion END,
            categoria_id = CASE WHEN $3 THEN $4 ELSE categoria_id END,
            cuenta_id = CASE WHEN $5 THEN $6 ELSE cuenta_id END,
            fecha = CASE WHEN $7 THEN $8 ELSE fecha END,
            tipo_movimiento_id = CASE WHEN $9 THEN $10 ELSE tipo_movimiento_id END,
            monto_original = CASE WHEN $11 THEN $12 ELSE monto_original END,
            monto_ars = CASE WHEN $13 THEN $14 ELSE monto_ars END
        WHERE id = $15 AND activo = true
        RETURNING id, fecha, descripcion, categoria_id, cuenta_id, tipo_movimiento_id, monto_original, monto_ars, activo
        `,
        [
          hasField('descripcion'),
          descripcion ?? null,
          hasField('categoria_id'),
          categoria_id ?? null,
          hasField('cuenta_id'),
          cuenta_id ?? null,
          hasField('fecha'),
          fecha ?? null,
          hasField('tipo_movimiento_id'),
          tipoMovimientoFinal,
          hasField('monto_original'),
          monto_original ?? null,
          hasField('monto_ars'),
          monto_ars ?? null,
          movimientoId
        ]
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
          eliminado_en = NOW(),
          actualizado_por_usuario_id = $2,
          eliminado_por_usuario_id = $2
      WHERE id = $1 AND activo = true
      `,
      [movimientoId, usuarioAuditoriaId(req)]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    return res.status(200).json({ ok: true, eliminado_id: movimientoId });
  } catch (error) {
    return res.status(500).json({ error: 'Error eliminando movimiento', detalle: error.message });
  }
});

app.get('/categorias', autenticar, exigirOperacionHogar, async (req, res) => {
  const hogarId = Number(req.query.hogar_id);

  if (!hogarId) {
    return res.status(400).json({ error: 'hogar_id es obligatorio' });
  }

  try {
    await asegurarCategoriasBase(hogarId, usuarioAuditoriaId(req));

    const { rows } = await pool.query(
      `
      SELECT c.id, c.nombre, c.tipo_movimiento_id, tm.codigo AS tipo_movimiento
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
      INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (hogar_id, nombre, tipo_movimiento_id)
      DO UPDATE SET activo = true,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      RETURNING id, hogar_id, nombre, tipo_movimiento_id
      `,
      [hogar_id, nombre.trim(), tipo_movimiento_id, usuarioAuditoriaId(req)]
    );

    return res.status(201).json({ ok: true, categoria: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando categoría', detalle: error.message });
  }
});

app.patch('/categorias/:id', async (req, res) => {
  const categoriaId = Number(req.params.id);
  const { nombre, tipo_movimiento_id } = req.body || {};

  if (!categoriaId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  if (!nombre?.trim() || ![1, 2, 3].includes(Number(tipo_movimiento_id))) {
    return res.status(400).json({ error: 'nombre y tipo_movimiento_id válido son obligatorios' });
  }

  try {
    const { rows: categoriaRows } = await pool.query('SELECT hogar_id FROM categorias WHERE id = $1', [categoriaId]);
    if (categoriaRows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const hogarId = Number(categoriaRows[0].hogar_id);
    if (!puedeGestionarHogar(req.usuario, hogarId)) {
      return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
    }

    const { rows: duplicadas } = await pool.query(
      `
      SELECT id
      FROM categorias
      WHERE hogar_id = $1
        AND nombre = $2
        AND tipo_movimiento_id = $3
        AND id <> $4
      `,
      [hogarId, nombre.trim(), tipo_movimiento_id, categoriaId]
    );

    if (duplicadas.length > 0) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre y tipo' });
    }

    const { rows } = await pool.query(
      `
      UPDATE categorias
      SET nombre = $1,
          tipo_movimiento_id = $2,
          activo = true,
          actualizado_por_usuario_id = $4
      WHERE id = $3
      RETURNING id, hogar_id, nombre, tipo_movimiento_id
      `,
      [nombre.trim(), tipo_movimiento_id, categoriaId, usuarioAuditoriaId(req)]
    );

    return res.status(200).json({ ok: true, categoria: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando categoría', detalle: error.message });
  }
});

app.delete('/categorias/:id', async (req, res) => {
  const categoriaId = Number(req.params.id);

  if (!categoriaId) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    const { rows: categoriaRows } = await pool.query('SELECT hogar_id, nombre FROM categorias WHERE id = $1', [categoriaId]);
    if (categoriaRows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const hogarId = Number(categoriaRows[0].hogar_id);
    if (!puedeGestionarHogar(req.usuario, hogarId)) {
      return res.status(403).json({ error: 'No tenes permisos para gestionar este hogar' });
    }

    await pool.query(
      'UPDATE categorias SET activo = false, actualizado_por_usuario_id = $2 WHERE id = $1',
      [categoriaId, usuarioAuditoriaId(req)]
    );
    return res.status(200).json({ ok: true, eliminado_id: categoriaId });
  } catch (error) {
    return res.status(500).json({ error: 'Error eliminando categoría', detalle: error.message });
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
      INSERT INTO etiquetas (hogar_id, nombre, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (hogar_id, nombre)
      DO UPDATE SET nombre = EXCLUDED.nombre,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      RETURNING id, hogar_id, nombre
      `,
      [hogar_id, nombre.trim(), usuarioAuditoriaId(req)]
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
    await asegurarColumnasEstadoMovimientosLectura();

    let rows = [];
    try {
      rows = (
        await pool.query(
          `
          SELECT
            COALESCE(SUM(CASE WHEN tm.codigo = 'ingreso' AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tm.codigo IN ('egreso', 'ahorro') AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS egresos,
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
            COALESCE(SUM(CASE WHEN tm.codigo IN ('egreso', 'ahorro') AND m.fecha BETWEEN $2 AND $3 THEN m.monto_ars END), 0) AS egresos,
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
      INSERT INTO cotizaciones_dolar (fecha, fuente, compra, venta, creado_por_usuario_id, actualizado_por_usuario_id)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (fecha, fuente)
      DO UPDATE SET compra = EXCLUDED.compra,
                    venta = EXCLUDED.venta,
                    actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id
      RETURNING id, fecha, fuente, compra, venta
      `,
      [fecha, fuente, compra || null, venta, usuarioAuditoriaId(req)]
    );

    return res.status(201).json({ ok: true, cotizacion: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando cotización', detalle: error.message });
  }
});

async function obtenerGastosFijosCiclo(hogarId, cicloConsulta) {
  let gastos = [];
  try {
    const { rows } = await pool.query(
      `
      SELECT
        gf.id, gf.descripcion, gf.moneda, gf.monto_base, gf.dia_vencimiento,
        gf.categoria_id, gf.activo_desde_ciclo, gf.activo_hasta_ciclo,
        c.nombre AS categoria, tm.codigo AS tipo_movimiento
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
        gf.id, gf.descripcion, gf.moneda, gf.monto_base, gf.dia_vencimiento,
        gf.categoria_id, NULL::VARCHAR(7) AS activo_desde_ciclo, NULL::VARCHAR(7) AS activo_hasta_ciclo,
        c.nombre AS categoria, tm.codigo AS tipo_movimiento
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

  if (gastos.length === 0) return [];

  const ids = gastos.map((gasto) => Number(gasto.id));
  const fechaInicioCiclo = `${cicloConsulta}-01`;
  const fechaCorte = finDeCiclo(cicloConsulta).toISOString().slice(0, 10);
  const [ajustesData, estadosData, ajustesCicloData] = await Promise.all([
    pool.query(
      `
      SELECT gasto_fijo_id, tipo_ajuste, valor
      FROM ajustes_gastos_fijos
      WHERE gasto_fijo_id = ANY($1::bigint[])
        AND fecha_aplicacion <= $2
        AND (ciclo_hasta_aplicacion IS NULL OR ciclo_hasta_aplicacion >= $3)
      ORDER BY gasto_fijo_id, fecha_aplicacion ASC, id ASC
      `,
      [ids, fechaCorte, cicloConsulta]
    ),
    pool.query(
      `
      SELECT gasto_fijo_id, estado_egreso, estado_ingreso, fecha_estado, fecha_realizacion
      FROM estados_gastos_fijos_ciclo
      WHERE gasto_fijo_id = ANY($1::bigint[])
        AND ciclo = $2
      `,
      [ids, cicloConsulta]
    ),
    pool.query(
      `
      SELECT DISTINCT gasto_fijo_id
      FROM ajustes_gastos_fijos
      WHERE gasto_fijo_id = ANY($1::bigint[])
        AND fecha_aplicacion >= $2
        AND fecha_aplicacion <= $3
        AND (ciclo_hasta_aplicacion IS NULL OR ciclo_hasta_aplicacion >= $4)
      `,
      [ids, fechaInicioCiclo, fechaCorte, cicloConsulta]
    )
  ]);

  const ajustesPorGasto = new Map();
  for (const ajuste of ajustesData.rows) {
    const key = Number(ajuste.gasto_fijo_id);
    if (!ajustesPorGasto.has(key)) ajustesPorGasto.set(key, []);
    ajustesPorGasto.get(key).push(ajuste);
  }
  const estadosPorGasto = new Map(estadosData.rows.map((estado) => [Number(estado.gasto_fijo_id), estado]));
  const gastosConAjusteCiclo = new Set(ajustesCicloData.rows.map((ajuste) => Number(ajuste.gasto_fijo_id)));

  return gastos.map((gasto) => {
    const id = Number(gasto.id);
    const montoVigente = aplicarAjustes(gasto.monto_base, ajustesPorGasto.get(id) || []);
    const estadoCiclo = estadosPorGasto.get(id) || {};
    return {
      ...gasto,
      ciclo: cicloConsulta,
      ajuste_en_ciclo: gastosConAjusteCiclo.has(id),
      estado_egreso: estadoCiclo.estado_egreso || null,
      estado_ingreso: estadoCiclo.estado_ingreso || null,
      fecha_estado: fechaIso(estadoCiclo.fecha_estado),
      fecha_realizacion: fechaIso(estadoCiclo.fecha_realizacion),
      monto_vigente: Number(montoVigente.toFixed(2))
    };
  });
}

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
    await asegurarGastosFijosLectura();
    const items = await obtenerGastosFijosCiclo(hogarId, cicloConsulta);
    return res.status(200).json({ total: items.length, items });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando gastos fijos', detalle: error.message });
  }
});

app.get('/gastos-fijos/rango', async (req, res) => {
  const hogarId = Number(req.query.hogar_id);
  const cicloDesde = req.query.ciclo_desde;
  const cicloHasta = req.query.ciclo_hasta;

  if (!hogarId) return res.status(400).json({ error: 'hogar_id es obligatorio' });
  if (!cicloEsValido(cicloDesde) || !cicloEsValido(cicloHasta)) {
    return res.status(400).json({ error: 'ciclo_desde y ciclo_hasta deben tener formato YYYY-MM' });
  }
  if (cicloHasta < cicloDesde) return res.status(400).json({ error: 'ciclo_hasta no puede ser anterior a ciclo_desde' });

  try {
    await asegurarGastosFijosLectura();
    const ciclos = [];
    const [anioDesde, mesDesde] = cicloDesde.split('-').map(Number);
    const [anioHasta, mesHasta] = cicloHasta.split('-').map(Number);
    const cursor = new Date(anioDesde, mesDesde - 1, 1);
    const fin = new Date(anioHasta, mesHasta - 1, 1);
    while (cursor <= fin) {
      ciclos.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const entradas = await Promise.all(
      ciclos.map(async (ciclo) => [ciclo, await obtenerGastosFijosCiclo(hogarId, ciclo)])
    );
    const porCiclo = Object.fromEntries(entradas);
    const total = entradas.reduce((acc, [, items]) => acc + items.length, 0);
    return res.status(200).json({ total, por_ciclo: porCiclo });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando gastos fijos por rango', detalle: error.message });
  }
});

app.post('/gastos-fijos', exigirOperacionHogar, async (req, res) => {
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

  const montoBaseFinal = parseNumeroDecimal(monto_base);
  if (!Number.isFinite(montoBaseFinal) || montoBaseFinal <= 0 || !tieneHastaDosDecimales(monto_base)) {
    return res.status(400).json({ error: 'monto_base debe ser mayor a 0 y tener hasta 2 decimales' });
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
      INSERT INTO gastos_fijos (
        hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento,
        activo_desde_ciclo, activo_hasta_ciclo, creado_por_usuario_id, actualizado_por_usuario_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING id, hogar_id, categoria_id, descripcion, moneda, monto_base, dia_vencimiento, activo_desde_ciclo, activo_hasta_ciclo
      `,
      [hogar_id, categoria_id, descripcion, moneda, montoBaseFinal, dia_vencimiento || null, ciclo_desde || resolveCiclo(), ciclo_hasta || null, usuarioAuditoriaId(req)]
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

  const montoBaseFinal = hasField('monto_base') ? parseNumeroDecimal(monto_base) : null;
  if (hasField('monto_base') && (!Number.isFinite(montoBaseFinal) || montoBaseFinal <= 0 || !tieneHastaDosDecimales(monto_base))) {
    return res.status(400).json({ error: 'monto_base debe ser mayor a 0 y tener hasta 2 decimales' });
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
    if (!puedeOperarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para operar valores fijos' });
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
          actualizado_por_usuario_id = $15,
          actualizado_en = NOW()
      WHERE id = $16 AND activo = true
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
        montoBaseFinal,
        hasField('dia_vencimiento'),
        dia_vencimiento ?? null,
        hasField('activo_desde_ciclo'),
        activo_desde_ciclo || null,
        hasField('activo_hasta_ciclo'),
        activo_hasta_ciclo || null,
        usuarioAuditoriaId(req),
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
    if (!puedeOperarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para finalizar valores fijos' });
    }

    const cicloFinalizacion = ciclo || resolveCiclo();
    const ultimoCicloActivo = cicloAnterior(cicloFinalizacion);

    const { rows } = await pool.query(
      `
      UPDATE gastos_fijos
      SET activo_hasta_ciclo = $1,
          actualizado_por_usuario_id = $3,
          actualizado_en = NOW()
      WHERE id = $2 AND activo = true
      RETURNING id, activo_desde_ciclo, activo_hasta_ciclo
      `,
      [ultimoCicloActivo, gastoFijoId, usuarioAuditoriaId(req)]
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
  const creadorId = usuarioAuditoriaId(req);
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
    await asegurarCategoriasBase(Number(hogar_id), usuarioAuditoriaId(req));
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
      `INSERT INTO cierres_ciclo (hogar_id, ciclo, balance_calculado, saldo_real_final, diferencia, genera_saldo_inicial, creado_por_usuario_id, actualizado_por_usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
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
       SET activo = false,
           eliminado_en = NOW(),
           actualizado_por_usuario_id = $3,
           eliminado_por_usuario_id = $3
       WHERE hogar_id = $1
         AND referencia_ciclo_cierre = $2
         AND clasificacion_movimiento IN ('ajuste_cierre', 'saldo_inicial')
         AND activo = true`,
      [hogarId, ciclo, usuarioAuditoriaId(req)]
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

app.get('/gastos-fijos/:id/ajustes', async (req, res) => {
  const gastoFijoId = Number(req.params.id);
  if (!gastoFijoId) return res.status(400).json({ error: 'id invalido' });

  try {
    await asegurarAlcanceAjustesGastosFijos();

    const { rows: gastoRows } = await pool.query(
      `
      SELECT gf.id, gf.hogar_id, gf.descripcion, gf.moneda, gf.monto_base, c.nombre AS categoria
      FROM gastos_fijos gf
      JOIN categorias c ON c.id = gf.categoria_id
      WHERE gf.id = $1
      `,
      [gastoFijoId]
    );
    if (gastoRows.length === 0) return res.status(404).json({ error: 'Valor fijo no encontrado' });
    const gasto = gastoRows[0];
    if (!puedeOperarHogar(req.usuario, Number(gasto.hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para consultar ajustes' });
    }

    const { rows: ajustes } = await pool.query(
      `
      SELECT id, gasto_fijo_id, fecha_aplicacion, ciclo_hasta_aplicacion, tipo_ajuste, valor, nota, creado_en
      FROM ajustes_gastos_fijos
      WHERE gasto_fijo_id = $1
      ORDER BY fecha_aplicacion ASC, id ASC
      `,
      [gastoFijoId]
    );

    let montoActual = Number(gasto.monto_base || 0);
    const items = ajustes.map((ajuste) => {
      const monto_anterior = montoActual;
      montoActual = aplicarAjustes(montoActual, [ajuste]);
      return {
        ...ajuste,
        monto_anterior: Number(monto_anterior.toFixed(2)),
        monto_posterior: Number(montoActual.toFixed(2))
      };
    });

    return res.status(200).json({ gasto, items });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando ajustes de valor fijo', detalle: error.message });
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
    if (!puedeOperarHogar(req.usuario, Number(permisoRows[0].hogar_id))) {
      return res.status(403).json({ error: 'No tenes permisos para ajustar valores fijos' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO ajustes_gastos_fijos (
        gasto_fijo_id, fecha_aplicacion, ciclo_hasta_aplicacion, tipo_ajuste,
        valor, nota, creado_por_usuario_id, actualizado_por_usuario_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      RETURNING id, gasto_fijo_id, fecha_aplicacion, ciclo_hasta_aplicacion, tipo_ajuste, valor, nota
      `,
      [gastoFijoId, fechaAplicacionFinal, cicloHastaAplicacion, tipo_ajuste, Number(valor), nota || null, usuarioAuditoriaId(req)]
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

    const fechaEstado = fechaHoyArgentina();
    const fechaRealizacion =
      estado_egreso === 'pagado' || estado_ingreso === 'registrado' ? fechaEstado : null;

    const { rows } = await pool.query(
      `
      INSERT INTO estados_gastos_fijos_ciclo (
        gasto_fijo_id, ciclo, estado_egreso, estado_ingreso,
        fecha_estado, fecha_realizacion, creado_por_usuario_id, actualizado_por_usuario_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT (gasto_fijo_id, ciclo)
      DO UPDATE SET
        estado_egreso = COALESCE(EXCLUDED.estado_egreso, estados_gastos_fijos_ciclo.estado_egreso),
        estado_ingreso = COALESCE(EXCLUDED.estado_ingreso, estados_gastos_fijos_ciclo.estado_ingreso),
        fecha_estado = EXCLUDED.fecha_estado,
        fecha_realizacion = EXCLUDED.fecha_realizacion,
        actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id,
        actualizado_en = NOW()
      RETURNING id, gasto_fijo_id, ciclo, estado_egreso, estado_ingreso, fecha_estado, fecha_realizacion
      `,
      [gastoFijoId, ciclo, estado_egreso ?? null, estado_ingreso ?? null, fechaEstado, fechaRealizacion, usuarioAuditoriaId(req)]
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
