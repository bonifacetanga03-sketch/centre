# ÉtatCivil — application full-stack

Application web de gestion d'un centre d'état civil, réalisée à partir du cahier des charges fourni.

## Lancer l'application

Dans ce dossier, ouvrez un terminal puis exécutez :

```powershell
npm start
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000) dans votre navigateur.

La base de données SQLite est créée automatiquement dans `data/etatcivil.sqlite` lors du premier lancement. Il n'y a aucune dépendance à installer.

## Comptes de démonstration

| Profil | Adresse e-mail |
| --- | --- |
| Agent d'état civil | `agent@etatcivil.cm` |
| Officier d'état civil | `officier@etatcivil.cm` |
| Administrateur | `admin@etatcivil.cm` |
| Citoyen | `citoyen@etatcivil.cm` |

Mot de passe commun : `EtatCivil2026!`

## Fonctionnalités livrées

- connexion sécurisée et accès par rôles ;
- registre des actes de naissance, mariage et décès ;
- création des actes par l'agent et validation par l'officier / administrateur ;
- demandes citoyennes, suivi des statuts et traitement interne ;
- mentions marginales, journal d'audit et vérification publique d'un document ;
- statistiques opérationnelles et interface responsive améliorée ;
- création de comptes internes par l'administrateur.

## Architecture de cette version

Le cahier des charges cible Laravel et MySQL. L'environnement ne disposant pas de PHP/Laravel, cette version utilise un serveur Node.js natif et SQLite afin d'être immédiatement exécutable, tout en couvrant la même séparation frontend / API / données. L'API applique des requêtes SQL préparées, des mots de passe hachés par `scrypt`, des sessions à durée limitée, des contrôles de rôles côté serveur et un journal d'audit.

Pour une mise en production, il faudra remplacer SQLite par MySQL, ajouter l'envoi réel d'e-mails, le stockage chiffré des pièces jointes, les PDF avec QR code et déployer l'API derrière HTTPS.
