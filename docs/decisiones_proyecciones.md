# Calculos de la pantalla Decisiones

Este documento describe como se calculan las lecturas y proyecciones visibles en la pantalla **Decisiones**.

## Fuente de datos

La pantalla usa datos ya existentes del front:

- movimientos consolidados del ciclo actual
- movimientos consolidados del ciclo anterior
- movimientos consolidados historicos para referencias habituales
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

## Clasificacion funcional de categorias

Decisiones usa un mapping propio, solo para analisis. No modifica movimientos ni categorias reales.

Tipos:

- `fijo`: gasto recurrente con monto estable.
- `recurrente_variable`: gasto que aparece todos los meses pero puede cambiar de monto.
- `variable`: gasto cotidiano controlable.
- `extraordinario`: gasto puntual o no habitual.

Mapping inicial:

- Vivienda: `fijo`
- Servicios: `fijo`
- Prestamos: `fijo`
- Tarjeta: `recurrente_variable`
- Alimentos: `variable`
- Transporte: `variable`
- Mascotas: `variable`
- Salud: `recurrente_variable`
- Ocio: `variable`
- Herramientas: `extraordinario`
- Otros: `extraordinario`
- Ahorro: `fijo`
- Ajuste de cierre: `extraordinario`
- Arrastre de cierre: `extraordinario`

### Tarjeta

Tarjeta se trata como `recurrente_variable`.

Esto significa:

- aparece todos los meses
- su monto puede variar
- no se considera fijo estable
- no se proyecta linealmente por dia
- se compara contra el mes anterior o contra el promedio historico si hay mas ciclos disponibles

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

Compara solo consumo controlable contra el patron esperado.

Incluye:

- `variable`
- `recurrente_variable`

Excluye:

- fijos puros planificados
- extraordinarios

Los fijos se muestran aparte como pagados y pendientes, pero no entran al ritmo.

Datos:

- dia actual dentro del ciclo
- dias totales del ciclo
- variables confirmados acumulados hasta hoy
- recurrentes variables confirmados acumulados hasta hoy
- patron semanal del mes anterior para gastos controlables

Formula:

```text
consumo_controlable = variables_acumulados + recurrentes_variables_acumulados
esperado = consumo_controlable_mes_anterior * porcentaje_semanal_esperado
diferencia = consumo_controlable - esperado
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

## Proyeccion realista por tipo de gasto

La proyeccion realista evita tratar todos los egresos como gasto diario lineal.

Formula:

```text
egreso_estimado_cierre =
  fijos_confirmados
  + fijos_pendientes
  + recurrentes_variables_confirmados
  + recurrentes_variables_pendientes
  + variables_proyectados
  + extraordinarios_confirmados
```

Reglas:

- los fijos no se proyectan linealmente
- los fijos confirmados se toman una sola vez
- los fijos pendientes se suman si todavia no estan pagados
- los recurrentes variables se suman confirmados + pendientes
- los extraordinarios no se proyectan hacia adelante
- los extraordinarios confirmados se incluyen como impacto real del ciclo
- Tarjeta entra como `recurrente_variable`

### Variables proyectados

Para variables se usa patron semanal del mes anterior si existe.

Se agrupan variables confirmadas del mes anterior por semana:

- Semana 1: dias 1 al 7
- Semana 2: dias 8 al 14
- Semana 3: dias 15 al 21
- Semana 4: dia 22 al cierre

Luego:

```text
porcentaje_semana = variables_semana / variables_mes_anterior
porcentaje_acumulado_esperado = suma porcentajes hasta semana actual
variables_proyectados = variables_confirmados_actuales / porcentaje_acumulado_esperado
```

Si no hay historial, el fallback por promedio diario se usa solo para variables:

```text
variables_proyectados = (variables_confirmados / dia_actual) * dias_totales
```

### Balance estimado

```text
balance_estimado_realista = ingresos_del_ciclo - egreso_estimado_cierre
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
- balance estimado realista
- variables esperados restantes
- dias restantes del ciclo

Calculos:

```text
egresos_variables_esperados_restantes = max(variables_proyectados - variables_confirmados, 0)

colchon_minimo_sugerido = max(
  10% de ingresos,
  egresos_pendientes,
  egresos_variables_esperados_restantes
)

monto_sugerido_ahorro = balance_estimado_realista - colchon_minimo_sugerido
```

Reglas:

- monto sugerido menor o igual a 0: `Sin margen sugerido`
- monto sugerido mayor a 0: `Ahorro posible`

Recomendaciones:

- sin margen: confirmar pendientes y controlar variables antes de ahorrar
- con margen y faltan mas de 7 dias: se puede separar hasta el monto sugerido manteniendo colchon
- con margen y faltan 7 dias o menos: buen momento para separar ahorro o comprar USD si los pendientes estan cubiertos

## Desvios relevantes

Detecta hasta 3 desvios utiles para decidir.

Reglas:

1. Categorias `variable` cuyo gasto actual supera en mas de 20% la referencia anterior.
2. Categorias `recurrente_variable` cuyo gasto actual supera en mas de 15% la referencia anterior.
3. Gastos `extraordinario` confirmados mayores al 5% de ingresos.

### Tarjeta en desvios

Tarjeta tiene regla especifica:

- se trata como `recurrente_variable`
- se compara contra Tarjeta del mes anterior
- si hay mas ciclos disponibles, se compara contra promedio habitual
- si supera la referencia en mas de 20%, se muestra el insight:

```text
La tarjeta viene por encima de tu referencia habitual.
```

### Datos mostrados

Por cada desvio:

- categoria
- monto actual
- referencia
- variacion
- recomendacion corta

Si no hay desvios:

```text
Sin desvios relevantes. El comportamiento esta dentro de parametros razonables.
```
