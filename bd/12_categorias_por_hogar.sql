WITH tipos AS (
  SELECT codigo, id FROM tipos_movimiento
), base(nombre, tipo_codigo) AS (
  VALUES
    ('Sueldo', 'ingreso'),
    ('Sueldo tarjeta', 'ingreso'),
    ('Reintegros', 'ingreso'),
    ('Ajuste de cierre', 'ingreso'),
    ('Arrastre de cierre', 'ingreso'),
    ('Alimentos', 'egreso'),
    ('Carniceria', 'egreso'),
    ('Polleria', 'egreso'),
    ('Verduleria', 'egreso'),
    ('Supermercado', 'egreso'),
    ('Vivienda', 'egreso'),
    ('Servicios', 'egreso'),
    ('Transporte', 'egreso'),
    ('Salud', 'egreso'),
    ('Tarjeta', 'egreso'),
    ('Prestamos', 'egreso'),
    ('Mascotas', 'egreso'),
    ('Ocio', 'egreso'),
    ('Ajuste de cierre', 'egreso'),
    ('Arrastre de cierre', 'egreso'),
    ('Ahorro', 'ahorro'),
    ('Otros', 'egreso')
), base_tipificada AS (
  SELECT b.nombre, t.id AS tipo_movimiento_id
  FROM base b
  JOIN tipos t ON t.codigo = b.tipo_codigo
), hogares_base AS (
  SELECT h.id AS hogar_id, b.nombre, b.tipo_movimiento_id
  FROM hogares h
  CROSS JOIN base_tipificada b
)
INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id)
SELECT hogar_id, nombre, tipo_movimiento_id
FROM hogares_base
ON CONFLICT (hogar_id, nombre, tipo_movimiento_id)
DO UPDATE SET activo = true;

WITH tipos AS (
  SELECT codigo, id FROM tipos_movimiento
), base(nombre, tipo_codigo) AS (
  VALUES
    ('Sueldo', 'ingreso'),
    ('Sueldo tarjeta', 'ingreso'),
    ('Reintegros', 'ingreso'),
    ('Ajuste de cierre', 'ingreso'),
    ('Arrastre de cierre', 'ingreso'),
    ('Alimentos', 'egreso'),
    ('Carniceria', 'egreso'),
    ('Polleria', 'egreso'),
    ('Verduleria', 'egreso'),
    ('Supermercado', 'egreso'),
    ('Vivienda', 'egreso'),
    ('Servicios', 'egreso'),
    ('Transporte', 'egreso'),
    ('Salud', 'egreso'),
    ('Tarjeta', 'egreso'),
    ('Prestamos', 'egreso'),
    ('Mascotas', 'egreso'),
    ('Ocio', 'egreso'),
    ('Ajuste de cierre', 'egreso'),
    ('Arrastre de cierre', 'egreso'),
    ('Ahorro', 'ahorro'),
    ('Otros', 'egreso')
), base_tipificada AS (
  SELECT b.nombre, t.id AS tipo_movimiento_id
  FROM base b
  JOIN tipos t ON t.codigo = b.tipo_codigo
), externas AS (
  SELECT DISTINCT c.nombre, c.tipo_movimiento_id
  FROM categorias c
  WHERE c.hogar_id <> 1
    AND c.activo = true
    AND NOT EXISTS (
      SELECT 1
      FROM base_tipificada b
      WHERE b.nombre = c.nombre
        AND b.tipo_movimiento_id = c.tipo_movimiento_id
    )
)
INSERT INTO categorias (hogar_id, nombre, tipo_movimiento_id)
SELECT 1, nombre, tipo_movimiento_id
FROM externas
ON CONFLICT (hogar_id, nombre, tipo_movimiento_id)
DO UPDATE SET activo = true;

WITH tipos AS (
  SELECT codigo, id FROM tipos_movimiento
), base(nombre, tipo_codigo) AS (
  VALUES
    ('Sueldo', 'ingreso'),
    ('Sueldo tarjeta', 'ingreso'),
    ('Reintegros', 'ingreso'),
    ('Ajuste de cierre', 'ingreso'),
    ('Arrastre de cierre', 'ingreso'),
    ('Alimentos', 'egreso'),
    ('Carniceria', 'egreso'),
    ('Polleria', 'egreso'),
    ('Verduleria', 'egreso'),
    ('Supermercado', 'egreso'),
    ('Vivienda', 'egreso'),
    ('Servicios', 'egreso'),
    ('Transporte', 'egreso'),
    ('Salud', 'egreso'),
    ('Tarjeta', 'egreso'),
    ('Prestamos', 'egreso'),
    ('Mascotas', 'egreso'),
    ('Ocio', 'egreso'),
    ('Ajuste de cierre', 'egreso'),
    ('Arrastre de cierre', 'egreso'),
    ('Ahorro', 'ahorro'),
    ('Otros', 'egreso')
), base_tipificada AS (
  SELECT b.nombre, t.id AS tipo_movimiento_id
  FROM base b
  JOIN tipos t ON t.codigo = b.tipo_codigo
)
UPDATE categorias c
SET activo = false
WHERE c.hogar_id <> 1
  AND c.activo = true
  AND NOT EXISTS (
    SELECT 1
    FROM base_tipificada b
    WHERE b.nombre = c.nombre
      AND b.tipo_movimiento_id = c.tipo_movimiento_id
  );
