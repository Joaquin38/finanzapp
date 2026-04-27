# Calculos de la pantalla Decisiones

Este documento describe como se calculan las lecturas y proyecciones visibles en la pantalla **Decisiones**.

## Fuente de datos

La pantalla usa datos ya existentes del front:

- movimientos consolidados del ciclo actual
- movimientos consolidados del ciclo anterior
- serie mensual consolidada de los ultimos ciclos
- resumen financiero del ciclo
- resumen operativo del ciclo
- egresos confirmados agrupados por categoria

No crea tablas nuevas ni modifica calculos del dashboard o reportes.

## Estados de movimientos considerados

Para egresos confirmados:

- `egreso`: estado consolidado `pagado`
- `ahorro`: estado consolidado `registrado` o `cobrado`

Los movimientos de tipo `ahorro` se tratan como egreso de balance porque salen del disponible del mes.

## Resumen ejecutivo

Muestra tres lineas:

- Estado del mes
- Riesgo principal
- Accion sugerida

### Estado del mes

Se calcula con el balance proyectado y los ingresos:

- balance proyectado menor a 0: `Riesgo de deficit`
- balance proyectado entre 0 y 10% de ingresos: `Mes ajustado`
- balance proyectado mayor a 10% de ingresos: `Mes con margen`

### Riesgo principal

Prioridad:

1. Si egresos / ingresos > 90%: `Egresos muy altos respecto a ingresos`
2. Si hay egresos pendientes: `Todavia hay pagos pendientes`
3. Si la categoria principal supera 30% del total de egresos: `Alta concentracion en una categoria`
4. Caso contrario: `Sin alertas relevantes`

### Accion sugerida

- deficit: `Postergar gastos no esenciales`
- mes ajustado: `Esperar a confirmar pendientes antes de ahorrar`
- mes con margen: `Evaluar separar ahorro o comprar USD`

## Comparacion vs mes anterior

Compara ciclo actual contra ciclo anterior en:

- ingresos confirmados
- egresos confirmados
- balance real

Formula:

```text
variacion % = ((actual - anterior) / anterior) * 100
```

Si el valor anterior es 0, se muestra `Sin referencia`.

Tonos:

- ingresos: suba positiva, baja negativa
- egresos: suba warning, baja positiva
- balance: suba positiva, baja warning

Recomendacion:

- egresos suben mas de 15%: revisar categorias con mayor crecimiento
- egresos bajan mas de 10%: mantener ritmo y evaluar ahorro
- balance baja: revisar gastos grandes o no recurrentes
- sin historial: informar que no hay suficiente historial

## Ritmo del mes

Compara el gasto actual contra un gasto esperado a esta altura del ciclo usando el total de egresos del mes anterior.

Datos:

- dia actual dentro del ciclo
- dias totales del ciclo
- egresos confirmados acumulados hasta hoy
- egresos confirmados totales del ciclo anterior

Formula:

```text
esperado = egresos_mes_anterior * (dia_actual / dias_totales)
diferencia = egresos_actuales_hasta_hoy - esperado
```

Estado:

- actual > esperado + 10%: `Ritmo alto`
- actual < esperado - 10%: `Ritmo bajo`
- entre -10% y +10%: `Ritmo normal`
- sin mes anterior: `Sin historial`

## Distribucion semanal

Agrupa egresos confirmados del ciclo actual por semana:

- Semana 1: dias 1 al 7
- Semana 2: dias 8 al 14
- Semana 3: dias 15 al 21
- Semana 4: dia 22 al cierre

Para cada semana:

```text
porcentaje_semana = total_semana / egresos_confirmados_totales
```

Tambien identifica la semana con mayor gasto y su porcentaje sobre el total.

Recomendacion:

- una semana concentra mas de 40%: gasto muy concentrado
- semana 1 + semana 2 concentran mas de 60%: separar ahorro al inicio del ciclo
- caso contrario: gasto distribuido

## Proyeccion por ritmo actual

La proyeccion usa el patron semanal del mes anterior para evitar distorsiones cuando el gasto se concentra al inicio del mes.

### Paso 1: distribucion semanal historica

Se agrupan los egresos confirmados del mes anterior por semana:

- Semana 1: dias 1 al 7
- Semana 2: dias 8 al 14
- Semana 3: dias 15 al 21
- Semana 4: dia 22 al cierre

Luego se calcula el porcentaje de cada semana sobre el total del mes anterior:

```text
porcentaje_semana = egresos_semana / egresos_mes_anterior
```

### Paso 2: porcentaje acumulado esperado

Segun la semana actual del ciclo, se suma el porcentaje historico acumulado hasta esa semana:

```text
porcentaje_acumulado_esperado = suma porcentajes historicos hasta semana actual
```

Ejemplo:

- si hoy cae en semana 2, se usa semana 1 + semana 2 del mes anterior
- si hoy cae en semana 4, se usa semana 1 + semana 2 + semana 3 + semana 4

### Paso 3: proyeccion corregida

```text
proyeccion_total = egresos_actuales / porcentaje_acumulado_esperado
```

Para evitar valores extremos:

```text
proyeccion_total = min(proyeccion_total, egresos_actuales * 2)
```

Si no hay historial del mes anterior, usa fallback por promedio diario:

```text
promedio_diario = egresos_actuales / dia_actual
proyeccion_total = promedio_diario * dias_totales
```

### Balance estimado

```text
balance_estimado = ingresos_del_ciclo - proyeccion_total
```

Estados:

- balance estimado menor a 0: `Riesgo de deficit`
- balance estimado entre 0 y 10% de ingresos: `Mes ajustado`
- balance estimado mayor a 10% de ingresos: `Margen positivo`

## Categorias criticas

Usa egresos confirmados del ciclo actual agrupados por categoria.

Muestra top 3 categorias por monto:

```text
porcentaje_categoria = total_categoria / egresos_confirmados_totales
top_3_porcentaje = suma_top_3 / egresos_confirmados_totales
```

Estado:

- top 3 > 70%: warning
- top 3 entre 50% y 70%: neutral
- top 3 < 50%: success

## Oportunidad de ahorro

Usa:

- ingresos del ciclo
- egresos pendientes
- balance proyectado
- dias restantes del ciclo

Calculos:

```text
margen_disponible_proyectado = balance_proyectado
colchon_minimo_sugerido = max(10% de ingresos, egresos_pendientes)
monto_sugerido_ahorro = balance_proyectado - colchon_minimo_sugerido
```

Reglas:

- monto sugerido menor o igual a 0: `Sin margen sugerido`
- monto sugerido mayor a 0: `Ahorro posible`

Si quedan menos de 7 dias y hay margen, se sugiere separar ahorro o comprar USD si los pendientes ya estan cubiertos.
