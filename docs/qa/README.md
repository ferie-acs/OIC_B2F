# Assurance qualité — POC B2F

**Dernière vérification locale :** [refonte du marché public](04-refonte-marche-public.md), 494 tests réussis. Les rapports en ligne ci-dessous concernent la version antérieure.

> Agent `qa-testeur`. Campagne adversariale du jalon J3, 24 septembre 2026.

| Document | Contenu | Pour qui |
|---|---|---|
| **`03-smoke-test-deploiement.md`** | **Verdict courant : GO en ligne.** Smoke test ciblé sur <https://oic-b2f-production.up.railway.app/> — CSP stricte, MIME des modules ES, repli SPA, anciens bloquants rejoués. Aucune régression de déploiement. | **Tout le monde — à lire en premier.** |
| `02-contre-verification-correctifs.md` | Réattaque des correctifs D61–D66 en local : GO, défauts résiduels, position sur les deux reports. | Fond du dossier qualité |
| `01-rapport-campagne-adversariale.md` | La campagne initiale : 21 défauts classés par sévérité avec scénario de reproduction, ce qui a été vérifié sain, couverture des cas d'échec UX, réponses aux six points d'audit du § 8 sécurité. Conservé comme état des lieux d'origine. | Historique, et lecture des causes |
| `../../tests/qa-adversarial.test.mjs` | Les tests de la campagne : non-régression + un test par défaut trouvé. **Tous verts depuis les correctifs.** | `senior-fullstack` |

## Exécuter

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F

# la campagne QA seule
node --test tests/qa-adversarial.test.mjs

# la suite entière
node --test tests/*.test.mjs
```

État au 24/09/2026, après les correctifs D61–D66 : **480 tests, 480 verts.**
Les dix tests qui figeaient les bugs ouverts sont passés au vert **sans avoir été
neutralisés ni affaiblis** — vérifié assertion par assertion lors de la
contre-vérification.

## Principe de lecture

Un test rouge dans `qa-adversarial.test.mjs` n'est pas une suite cassée : c'est la
liste des travaux. Chaque assertion porte en message l'emplacement `fichier:ligne`
du défaut et ce qu'on attend à la place. **Ne jamais neutraliser un rouge pour
obtenir du vert** (D58) : un test supprimé est un bug oublié.
