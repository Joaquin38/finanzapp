---
name: finanzapp-credit-card
description: Use this skill when working on the Tarjeta de crédito module, card summaries, installments, CSV imports, future installments, card analytics, or TC-to-Movimientos integration.
---

# FinanzApp Credit Card Skill

## Conceptual model

- A tarjeta is the stable credit card entity.
- A cierre/resumen is the monthly or cycle-based statement for a tarjeta.
- A consumo_tarjeta is an individual card purchase.

Never mix these responsibilities.

## Resumen / cierre rules

- fecha_cierre belongs to the resumen.
- fecha_vencimiento belongs to the resumen.
- estado abierto/cerrado belongs to the resumen.
- Do not ask for fecha_cierre or fecha_vencimiento in each consumo.

## Installments

Always preserve:
- cuota_actual
- cantidad_cuotas

If a bank statement says `3/12`:
- cuota_actual = 3
- cantidad_cuotas = 12

Do not infer cuota_actual from current date if it is explicitly provided.

For CSV import:
- if modo_carga = total, calculate monto_cuota
- if modo_carga = cuota, calculate monto_total
- if cantidad_cuotas = 1, monto_total and monto_cuota should match

## CSV import

Standard CSV headers:
fecha_compra,descripcion,categoria,moneda,cuota_actual,cantidad_cuotas,modo_carga,monto_total,monto_cuota,titular,observaciones

Rules:
- Upload does not import.
- Always show editable preview.
- User can edit category per row.
- User can ignore/delete rows before confirmation.
- Validate rows and show clear states:
  - valida
  - revisar
  - invalida
  - duplicado
  - ignorada

## Consumption assignment

When creating/importing a consumo:
- Use tarjeta seleccionada.
- Use resumen selected/current.
- Assign to the correct resumen using fecha_compra and fecha_cierre.
- If fecha_compra is after current resumen close date, assign to next resumen.
- Create next resumen only if required and using defaults.

## Movimientos integration

Do not create one movement per card consumption.

If requested:
- Only generate one movimiento egreso per closed resumen.
- Action must be explicit/manual.
- Validate possible duplicate movement.
- Link movement to resumen if model supports it.
- Do not change existing movement logic unless required.

## Analytics

TC analytics should answer:
- Why did this statement come like this?
- What categories explain it?
- What is the future installment drag?
- What changed vs previous summaries?

Avoid long generic conclusions. Prefer compact, actionable interpretation.

## Verification

After changes:
- Check that totals respect ARS and USD separately.
- Check cuota_actual/cantidad_cuotas.
- Check future installments do not double count.
- Check imports do not create movements.
- Run frontend build when possible.