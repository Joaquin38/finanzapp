---
name: finanzapp-financial-logic
description: Use this skill when changing financial calculations, balances, projections, cycle comparisons, reports, decisions, savings suggestions, or control-level logic in FinanzApp.
---

# FinanzApp Financial Logic Skill

## Goal

Make financial logic realistic, explainable and consistent across Dashboard, Decisiones, Reportes and Movimientos.

## Core rules

- Do not treat an open cycle as a closed cycle.
- If the selected cycle is open, comparisons must be labeled as partial.
- Avoid strong conclusions when data is incomplete.
- Do not show “bajó 100%” or similar unless the compared periods are both closed and comparable.
- Prefer “confirmado al momento”, “ciclo en curso” or “comparación parcial” when applicable.

## Balance logic

Respect existing definitions:
- Balance actual: confirmed/paid/collected data plus initial balance if applicable.
- Balance proyectado: expected closing balance including projected/pending data according to existing app logic.

If balance actual includes saldo inicial/arrastre, the UI copy must say so.

## Nivel de control

Do not classify the cycle as “Bajo” just because it has many pending items if projected balance is clearly positive.

Suggested classification:
- Alto: projected balance positive, critical expenses covered, no relevant pressure.
- Medio: projected balance positive but there are relevant pending expenses, unconfirmed income, or incomplete cycle data.
- Bajo: projected balance negative, weak margin, or pending expenses not covered by expected resources.

## Alerts and insights

Only show alerts that can change a decision.

Prioritize:
1. real deficit risk
2. pending expenses without coverage
3. unusual variable spending
4. projected savings opportunity
5. category-level deviation with sufficient confidence

Avoid:
- obvious pending-payment messages
- tautologies
- generic advice
- repeated information already visible in cards

## Historical comparisons

Before comparing:
- Check if current cycle is open.
- Check if previous cycles have enough data.
- Add confidence labels when necessary:
  - Confianza alta
  - Confianza media
  - Confianza baja

For low confidence:
- Use cautious wording.
- Do not overstate conclusions.

## Verification

After changes:
- Verify Dashboard and Decisiones do not contradict each other.
- Verify Reportes handles open cycles and empty data.
- Run frontend build when possible.