# Development instructions

## Sequentiële Codex-prompt — GitFlow per issue

Wanneer een opdracht expliciet **sequentieel** is en meerdere issues bevat, geldt deze vaste procedure, in de opgegeven volgorde:

1. Werk volgens het bestaande GitFlow-model. Begin ieder issue vanaf de actuele `develop`-branch en maak een eigen `feature/<issue>-<korte-naam>`-branch.
2. Onderzoek bestaande code en eisen; implementeer alleen de scope van dat issue.
3. Commit het relevante werk op de featurebranch en voer proportionele tests uit, inclusief de afgesproken gebruikershandeling.
4. **Groen:** uitsluitend wanneer relevante tests én functionele acceptatie slagen, merge de featurebranch terug naar `develop` en verwijder daarna de featurebranch.
5. **Rood of onvoldoende geverifieerd:** commit de actuele wijzigingen op de featurebranch; **niet mergen en niet verwijderen**. Rapporteer de fout of het ontbrekende bewijs.
6. Ga daarna naar het volgende issue, opnieuw vanaf de actuele `develop`. Neem nooit niet-gemergede wijzigingen uit een falend issue over.

Werk met één issue en één actieve featurebranch tegelijk; geen parallelle agents of worktrees. Behoud bestaande commits, tags en gebruikerswijzigingen. Voer geen release of deployment uit als dat niet afzonderlijk is opgedragen. Bestaande projectafspraken over remote pushes, GitHub-mutaties en approvals blijven gelden; wanneer die acties niet zijn toegestaan, bereid ze lokaal voor en rapporteer de blokkade in plaats van de regels te omzeilen.
