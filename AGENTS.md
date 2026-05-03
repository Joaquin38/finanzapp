# AGENTS.md — FinanzApp

## Proyecto

FinanzApp es una app de finanzas personales/hogar. Permite gestionar ciclos financieros, movimientos, valores fijos, reportes, decisiones, cotización del dólar, tarjeta de crédito, hogares, usuarios y roles.

El objetivo del producto no es solo registrar gastos, sino ayudar a tomar mejores decisiones financieras con datos claros, proyecciones realistas y análisis explicables.

## Estructura del repo

- `frontend/`: aplicación web.
- `backend/`: API y lógica server-side.
- `bd/`: scripts, esquema o documentación de base de datos.
- `docs/`: documentación funcional/técnica.
- `scripts/`: utilidades del proyecto.

Antes de modificar código, revisar la estructura real del repo y localizar los archivos correctos. No asumir nombres de componentes si no fueron inspeccionados.

## Comandos habituales

Usar los comandos existentes del proyecto. Si no estás seguro, revisar `package.json`.

Comandos esperados:
- Frontend build: `npm --prefix frontend run build`
- Backend dev/build/test: revisar `backend/package.json`
- Estado de git: `git status`

Antes de terminar una tarea funcional o visual relevante, correr al menos el build del frontend si el cambio toca `frontend/`.

## Forma de trabajar

Para cada tarea:
1. Entender el objetivo.
2. Revisar archivos relevantes antes de editar.
3. Hacer el cambio mínimo necesario.
4. Evitar refactors grandes si no fueron pedidos.
5. Mantener compatibilidad con datos existentes.
6. Correr validaciones razonables.
7. Resumir archivos modificados y qué se verificó.

Si una tarea es ambigua, hacer una suposición conservadora y explicarla al finalizar. No inventar reglas de negocio nuevas si no son necesarias.

## Reglas de producto

### Ciclos financieros

- El ciclo financiero puede no coincidir con mes calendario.
- Un ciclo puede estar abierto o cerrado.
- Si el ciclo está abierto, las comparaciones contra ciclos cerrados deben tratarse como parciales.
- Evitar mensajes como “bajó 100%” si el ciclo todavía está en curso y faltan ingresos/egresos por confirmar.
- Usar textos como “datos parciales”, “ciclo en curso” o “confirmado al momento” cuando corresponda.

### Movimientos

Un movimiento puede representar:
- ingreso
- egreso
- ahorro
- saldo inicial / arrastre de cierre
- pago de tarjeta, si fue generado manualmente desde el resumen cerrado

Estados típicos:
- proyectado
- cobrado
- pendiente
- pagado
- registrado

No duplicar registros entre módulos. Si un consumo vive en Tarjeta de crédito, no crear automáticamente un movimiento individual por cada consumo.

### Balance

Diferenciar:
- balance actual: basado en movimientos confirmados/pagados/cobrados y saldo inicial si aplica
- balance proyectado: incluye ingresos y egresos proyectados/pendientes según la lógica existente

Si el balance actual incluye saldo inicial o arrastre, el copy debe aclararlo.

### Nivel de control

No marcar “Bajo” solo porque hay pendientes si el balance proyectado es claramente positivo.

Regla orientativa:
- Alto: balance proyectado positivo, pagos críticos cubiertos, sin presión relevante.
- Medio: balance proyectado positivo, pero quedan pendientes relevantes o ingresos importantes sin confirmar.
- Bajo: balance proyectado negativo o riesgo real de presión sobre el cierre.

### Decisiones

El módulo Decisiones debe interpretar datos, no repetir obviedades.

No mostrar alertas que no cambien una decisión. Priorizar:
- riesgo real
- desvíos relevantes
- oportunidades de ahorro
- cambios de patrón

Máximo 3 alertas principales por defecto.

### Reportes

Los reportes muestran datos y comparativas. Deben indicar si el ciclo está abierto o si los datos son parciales.

Si no hay datos suficientes:
- mostrar estado vacío claro
- evitar “N/A” sin explicación
- no dejar bloques visuales enormes vacíos

## Tarjeta de crédito

### Modelo conceptual

- `tarjeta`: entidad estable de la tarjeta.
- `cierre/resumen`: resumen mensual/cíclico de una tarjeta.
- `consumo_tarjeta`: compra individual de tarjeta.

Reglas:
- `fecha_cierre` y `fecha_vencimiento` pertenecen al resumen, no al consumo.
- Cada consumo debe asociarse a un resumen/cierre.
- `cuota_actual` y `cantidad_cuotas` son campos distintos y deben respetarse.
- Si el resumen dice `3/12`, entonces:
  - `cuota_actual = 3`
  - `cantidad_cuotas = 12`

### Consumos y movimientos

- Los consumos de tarjeta viven dentro del módulo Tarjeta.
- No crear un movimiento por cada consumo de tarjeta.
- Si se integra con Movimientos, crear un único egreso por resumen cerrado y solo mediante acción explícita del usuario.
- Validar duplicados antes de generar ese egreso.

### Importador CSV

Formato estándar esperado:
`fecha_compra,descripcion,categoria,moneda,cuota_actual,cantidad_cuotas,modo_carga,monto_total,monto_cuota,titular,observaciones`

Reglas:
- No importar automáticamente al subir archivo.
- Siempre mostrar preview editable.
- Permitir editar/eliminar/ignorar filas.
- La categoría debe ser editable por fila.
- Respetar `cuota_actual` y `cantidad_cuotas`.
- Si `modo_carga = total`, calcular monto cuota.
- Si `modo_carga = cuota`, calcular monto total.
- No usar PDF directamente dentro de la app en esta etapa.

## UI / UX

Mantener identidad visual de FinanzApp:
- estilo moderno/minimalista
- tipografía Manrope si está configurada
- modo oscuro/claro
- cards con jerarquía clara
- evitar pantallas tipo “tetris”
- evitar textos largos innecesarios
- usar acordeones para detalles secundarios
- mobile debe ser legible

Reglas:
- Dashboard = estado rápido.
- Decisiones = interpretación.
- Tarjeta = análisis y gestión de TC.
- Reportes = comparativas y visualización.
- Movimientos = gestión completa de movimientos.

No hacer que todos los módulos digan lo mismo.

## Botones y acciones

- Botón flotante debe ser contextual.
- No debe tapar gráficos, cards ni tablas.
- En Reportes y Decisiones, preferir ocultarlo salvo que aporte.
- En Tarjeta, usar acciones propias como “Nuevo consumo” e “Importar CSV”.

## Seguridad y datos

- No hardcodear credenciales.
- No exponer secretos en frontend.
- No guardar credenciales bancarias.
- No implementar scraping bancario.
- Mantener separación por hogar/usuario/rol.
- Validar pertenencia al hogar cuando se trabaje con datos multiusuario.

## Definición de terminado

Una tarea está terminada cuando:
- El cambio solicitado está implementado.
- No se tocaron módulos fuera de alcance sin motivo.
- Se corrió build o validación razonable si corresponde.
- No hay errores obvios de UI.
- El resultado mantiene coherencia entre Dashboard, Decisiones, Reportes, Movimientos y Tarjeta.
- Se informa qué archivos se tocaron y qué se verificó.