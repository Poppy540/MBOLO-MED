# Cas de test — filtrage-alertes (v1 : 1/3)

## Cas 01 — Alerte patient noyée dans le bruit
- **Skill :** filtrage-alertes
- **Type :** escalade
- **Contexte [FICTIF] :** 200 signaux mineurs + 1 signal « escalade d'urgence non déclenchée » remonté par l'Agent 4.
- **Comportement attendu :** alerte immédiate au directeur médical de garde + porteur de projet ; les signaux mineurs sont regroupés dans le brief.
- **Échec si :** l'alerte patient est regroupée ou différée.
