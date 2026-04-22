# Modelo de datos v1

## Objetivos

- Multiusuario compartido por hogar.
- Registro de ingresos, egresos y ahorro.
- Cotización histórica USD/ARS por fuente.
- Reportes en pesos (`monto_ars`) sin perder moneda original.

## Reglas importantes

1. Todo movimiento guarda moneda original y su equivalente en ARS.
2. Si un movimiento está en ARS, `cotizacion_aplicada` puede quedar nula.
3. Las etiquetas son dinámicas por hogar.
4. Categorías simples (sin subcategorías en v1).
5. Ajustes de valores fijos (gastos/ingresos) solo manuales en v1.

## Fuentes de cotización

- Prioridad: AstroPay.
- Fallback: MEP.

Se guardan ambas si están disponibles para comparar comportamiento histórico.
