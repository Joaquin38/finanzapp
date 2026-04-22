BEGIN;

INSERT INTO hogares (id, nombre)
VALUES (1, 'Colon 260')
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;

INSERT INTO usuarios (id, correo, clave_hash, nombre, rol_global)
VALUES
  (1, 'joaco544@gmail.com', 'prueba', 'Joaquin Diaz', 'hogar_admin'),
  (2, 'sofiacepeda56@gmail.com', 'prueba', 'Sofia Cepeda', 'hogar_member')
ON CONFLICT (id) DO UPDATE
SET correo = EXCLUDED.correo,
    clave_hash = EXCLUDED.clave_hash,
    nombre = EXCLUDED.nombre,
    rol_global = EXCLUDED.rol_global,
    activo = true;

INSERT INTO hogares_usuarios (hogar_id, usuario_id, rol)
VALUES
  (1, 1, 'hogar_admin'),
  (1, 2, 'hogar_member')
ON CONFLICT (hogar_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol;

SELECT setval(pg_get_serial_sequence('hogares', 'id'), GREATEST((SELECT MAX(id) FROM hogares), 1), true);
SELECT setval(pg_get_serial_sequence('usuarios', 'id'), GREATEST((SELECT MAX(id) FROM usuarios), 1), true);

INSERT INTO cuentas (id, hogar_id, nombre, tipo, moneda_base)
VALUES
  (1, 1, 'Efectivo', 'caja', 'ARS'),
  (2, 1, 'Cuenta USD', 'banco', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categorias (id, hogar_id, nombre, tipo_movimiento_id)
VALUES
  (1, 1, 'Sueldo', 1),
  (2, 1, 'Freelance', 1),
  (3, 1, 'Reintegros', 1),
  (4, 1, 'Ajuste de cierre', 1),
  (5, 1, 'Arrastre de cierre', 1),
  (6, 1, 'Alquiler (ingreso)', 1),
  (7, 1, 'Vivienda', 2),
  (8, 1, 'Alimentos', 2),
  (9, 1, 'Carniceria', 2),
  (10, 1, 'Polleria', 2),
  (11, 1, 'Verduleria', 2),
  (12, 1, 'Supermercado', 2),
  (13, 1, 'Servicios', 2),
  (14, 1, 'Transporte', 2),
  (15, 1, 'Salud', 2),
  (16, 1, 'Ahorro', 3),
  (17, 1, 'Tarjeta', 2),
  (18, 1, 'Prestamos', 2),
  (19, 1, 'Mascotas', 2),
  (20, 1, 'Ocio', 2),
  (21, 1, 'Otros', 2),
  (22, 1, 'Ajuste de cierre', 2),
  (23, 1, 'Arrastre de cierre', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cotizaciones_dolar (fecha, fuente, compra, venta)
VALUES
  (CURRENT_DATE, 'mep', 1125.00, 1130.00),
  (CURRENT_DATE, 'astropay', 1110.00, 1140.00)
ON CONFLICT (fecha, fuente) DO NOTHING;

UPDATE cuentas SET hogar_id = 1;
UPDATE categorias SET hogar_id = 1;
UPDATE etiquetas SET hogar_id = 1;
UPDATE movimientos
SET hogar_id = 1,
    creado_por_usuario_id = CASE
      WHEN creado_por_usuario_id IN (1, 2) THEN creado_por_usuario_id
      ELSE 1
    END
WHERE hogar_id IS DISTINCT FROM 1
   OR creado_por_usuario_id IS NULL
   OR creado_por_usuario_id NOT IN (1, 2);
UPDATE gastos_fijos SET hogar_id = 1;

DO $$
BEGIN
  IF to_regclass('public.cierres_ciclo') IS NOT NULL THEN
    UPDATE cierres_ciclo
    SET hogar_id = 1,
        creado_por_usuario_id = CASE
          WHEN creado_por_usuario_id IN (1, 2) THEN creado_por_usuario_id
          ELSE 1
        END
    WHERE hogar_id IS DISTINCT FROM 1
       OR creado_por_usuario_id IS NULL
       OR creado_por_usuario_id NOT IN (1, 2);
  END IF;
END $$;

COMMIT;
