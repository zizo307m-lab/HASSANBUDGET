# Kanz — budget & patrimoine (PWA)

Application mobile installable (Android/Chrome), sans serveur ni compte : toutes les données restent sur le téléphone.

## Lancer
- Local : `python3 -m http.server 8765` puis ouvrir `http://localhost:8765`
- GitHub Pages : envoyer **tout le contenu du dossier** (css/, js/, icons/, index.html, manifest.webmanifest, sw.js), activer Pages, ouvrir l'URL sur Android → menu Chrome → « Installer l'application ».

## Fonctions
Comptes (budgétés / hors budget), transactions standard & transferts, récurrences (brouillons à confirmer), budget par enveloppes (Prêt à assigner), groupes & catégories modifiables, analyse (flux, patrimoine, catégories), actifs & crédits, dettes & créances, prévision, objectifs, habitudes, assistant local (sans IA externe), PIN, thème clair/sombre, masquage des montants, export/import JSON, export CSV, données de démonstration.

## Tests
`node --test tests/*.test.mjs` (logique) · `python3 tests/e2e.py` (Playwright, serveur sur :8765).
