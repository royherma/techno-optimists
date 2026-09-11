-- Roy requested quiet, admin-curated emoji. Set only absent values; never
-- overwrite a later editorial choice or change the activity timestamp.
UPDATE challenges SET emoji = '🐟' WHERE slug = 'pond-s-oxygen-crashes-at-dawn' AND emoji IS NULL;
UPDATE challenges SET emoji = '🚿' WHERE slug = 'our-rooftop-tank-hits-scalding-by' AND emoji IS NULL;
UPDATE challenges SET emoji = '🐦' WHERE slug = 'tokyo-cut-its-crows-under-fifth' AND emoji IS NULL;
UPDATE challenges SET emoji = '🐒' WHERE slug = 'macaques-strip-harvest-and-deterrents-cost' AND emoji IS NULL;
UPDATE challenges SET emoji = '🏫' WHERE slug = 'metal-roofed-classrooms-hit-39-8c' AND emoji IS NULL;
UPDATE challenges SET emoji = '💉' WHERE slug = 'clinic-s-vaccine-fridge-runs-generator' AND emoji IS NULL;
UPDATE challenges SET emoji = '🌾' WHERE slug = 'ten-days-clear-rice-stubble-before' AND emoji IS NULL;
UPDATE challenges SET emoji = '💧' WHERE slug = 'rainwater-tank-goes-hazy-and-smells' AND emoji IS NULL;
UPDATE challenges SET emoji = '🐒' WHERE slug = 'baboons-listen-lock-beep-and-go' AND emoji IS NULL;

-- Verified against the accessible SCMP report, published 13 January 2026:
-- https://www.scmp.com/week-asia/health-environment/article/3339656/how-japans-capital-put-lid-crow-chaos-simple-fix
-- It supports the population comparison, not the original no-killing claim.
UPDATE challenges SET
  title = 'Tokyo’s crow population fell below a fifth of its early-2000s peak',
  summary = 'A 25-year campaign combined waste management and changes in everyday habits. What could other cities learn from it?',
  body = 'The problem: crows tore into rubbish bags left outside overnight, spreading waste through Tokyo’s streets. The report also describes aggressive behaviour during breeding season.

The response: a long-running city campaign focused on waste management and residents’ everyday habits.

The reported result: a December survey found the crow population was less than 20% of its early-2000s peak, according to the South China Morning Post’s January 2026 report.

The open question: which changes could help elsewhere, and how would another city measure the results?',
  source_note = 'Reported by the South China Morning Post on 13 January 2026. The population comparison uses the early-2000s peak as its baseline. This is a reported example to learn from, not a test conducted by this community.'
WHERE slug = 'tokyo-cut-its-crows-under-fifth'
  AND title = 'Tokyo cut its crows to under a fifth without killing them'
  AND body IS NULL;
