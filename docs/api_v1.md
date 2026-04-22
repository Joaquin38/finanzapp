# API v1 (borrador)

## Autenticación y hogar

- `POST /auth/registro`
- `POST /auth/login`
- `POST /hogares`
- `POST /hogares/:id/invitaciones`

## Catálogos

- `GET /tipos-movimiento`
- `GET /categorias`
- `POST /categorias`
- `GET /etiquetas`
- `POST /etiquetas`

### Estado actual de implementación

- ✅ `GET /categorias?hogar_id=1`
- ✅ `POST /categorias`
- ✅ `GET /etiquetas?hogar_id=1`
- ✅ `POST /etiquetas`

## Movimientos

- `GET /movimientos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
- `POST /movimientos`
- `PATCH /movimientos/:id`
- `DELETE /movimientos/:id`

### Estado actual de implementación

- ✅ `GET /movimientos?hogar_id=1[&desde=YYYY-MM-DD&hasta=YYYY-MM-DD]`
- ✅ `GET /movimientos?hogar_id=1&incluir_eliminados=true|false`
- ✅ `POST /movimientos` (`usa_ahorro=true|false` para egresos, valida categoría compatible con tipo)
- ✅ `PATCH /movimientos/:id` (actualiza descripción/categoría/cuenta y estados `estado_egreso` / `estado_ingreso`)
- ✅ `DELETE /movimientos/:id` (baja lógica)

## Valores fijos (gastos/ingresos recurrentes)

- `GET /gastos-fijos`
- `POST /gastos-fijos`
- `PATCH /gastos-fijos/:id`
- `DELETE /gastos-fijos/:id?ciclo=YYYY-MM`
- `POST /gastos-fijos/:id/ajustes`

### Estado actual de implementación

- ✅ `GET /gastos-fijos?hogar_id=1`
- ✅ `POST /gastos-fijos`
- ✅ `PATCH /gastos-fijos/:id`
- ✅ `DELETE /gastos-fijos/:id?ciclo=YYYY-MM`
- ✅ `POST /gastos-fijos/:id/ajustes`

## Cotizaciones e IPC

- `GET /cotizaciones?fecha=YYYY-MM-DD`
- `POST /cotizaciones/sincronizar` (astropay/mep)
- `GET /ipc?periodo=YYYY-MM`
- `POST /ipc/sincronizar`

### Estado actual de implementación

- ✅ `GET /cotizaciones`
- ✅ `GET /cotizaciones?fecha=YYYY-MM-DD`
- ✅ `GET /cotizaciones` sincroniza automáticamente desde API pública al consultar

## Dashboard

- `GET /dashboard/mes-actual`
- `GET /dashboard/ultimo-mes-cerrado`

### Estado actual de implementación

- ✅ `GET /dashboard/resumen?hogar_id=1`
- ✅ `GET /dashboard/resumen?hogar_id=1&ciclo=YYYY-MM` (ahorro acumulado por ciclo)
