ocean-labelling/
├── backend/                # Logique Django & Orchestration CVAT
│   ├── core/               # Configuration du projet Django
│   ├── api/                # Ton application métier (logic, models, views)
│   ├── Dockerfile          # Recette de construction de l'image Python
│   └── requirements.txt    # Dépendances Python
├── frontend/               # Application React Native
│   ├── src/                # Code source JS/TS
│   ├── Dockerfile          # Recette pour l'environnement Node/Web
│   └── package.json        # Dépendances JS
├── data/                   # DOSSIER CRITIQUE : Stockage persistant
│   ├── pgdata/             # Données PostgreSQL (exclu de Git)
│   └── media/              # Images importées de l'Open Data (exclu de Git)
├── .env                    # Secrets et variables d'environnement (exclu de Git)
├── .env.example            # Template des secrets pour les collaborateurs
├── .gitignore              # Règles d'exclusion Git
└── docker-compose.yml      # Chef d'orchestre des services