---
name: finanzapp-ui-polish
description: Use this skill when changing layout, visual hierarchy, cards, buttons, responsive behavior, modals, tables, dashboards, or report screens in FinanzApp.
---

# FinanzApp UI Polish Skill

## Goal

Keep FinanzApp clean, modern, readable and useful. Avoid clutter and “Tetris” layouts.

## Visual hierarchy

Every screen should have:
1. clear title
2. primary summary
3. main action(s)
4. details
5. secondary/deep information

Do not put every metric at the same visual weight.

## Dashboard rules

Dashboard is for quick state:
- cycle
- key cards
- control level
- pending summary
- last movements
- compact dollar quote

Avoid:
- long full tables
- duplicated analysis
- large secondary widgets competing with core metrics

## Decisiones rules

Decisiones is for interpretation.

Keep visible:
- summary
- projection
- savings opportunity
- behavior alerts

Move secondary details into accordions:
- comparisons
- trends
- weekly distribution
- critical categories
- operational control

## Tarjeta rules

Tarjeta should clearly separate:
1. resumen configuration
2. manual/import actions
3. consumption table
4. future installments
5. analytics

Actions like “Nuevo consumo” and “Importar CSV” should be near consumption management, not lost in the header.

## Reportes rules

Reports must avoid empty-looking screens:
- show useful empty states
- avoid huge blank spaces
- keep chart and detail close together
- show cycle-open badge when needed

## Tables and mobile

Desktop:
- tables are okay.

Mobile:
- use compact cards.
- avoid squeezed columns.
- actions should be inside a “…” menu when space is limited.

## Copy

Use short, useful text.
Avoid:
- generic advice
- repeated explanations
- huge paragraphs
- alarming language unless there is real risk

## Floating action button

The FAB must be contextual:
- Dashboard: Gasto rápido
- Movimientos: Nuevo movimiento
- Tarjeta: Nuevo consumo TC only if useful
- Reportes/Decisiones: usually hidden

Do not let it cover charts, tables or cards.

## Verification

After UI changes:
- Check desktop layout.
- Check mobile layout.
- Check dark/light mode if applicable.
- Run frontend build when possible.