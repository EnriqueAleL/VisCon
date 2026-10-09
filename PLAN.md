# Plan de lucru: joc competitiv Basisjahr

Stare: prima implementare realizată după instrucțiunea „continua”. PRODUCT.md și README.md descriu starea livrată; secțiunile de mai jos păstrează raționamentul planului inițial. Utilizatorul a selectat Campus scorebook în pagina de design. Sunt implementate interfața, camerele Node.js, evaluarea grilelor și numerelor, Elo și persistența. Java are editor și adaptor de evaluare; executorul extern și întrebările din transcripturi așteaptă integrarea.

## Obiectiv și prima livrare

Interfață web pentru meciuri 1v1 între studenți, cu invitație prin link și Elo personal. Un coleg pregătește întrebările din transcripturile cursurilor.

Propunere de ordine: interfață interactivă cu date demonstrative, apoi conectarea la serviciile Node.js pentru camere, evaluare și persistență. Un prototip local trebuie etichetat ca demo; un meci multiplayer este considerat funcțional numai după verificare din două sesiuni independente.

## Fluxul propus

1. Acasă: Elo, creare cameră, acces prin invitație și meciuri recente.
2. Lobby: materia, formatul, durata estimată, linkul de invitație, participanții și confirmarea pregătirii.
3. Meci: aceeași întrebare pentru ambii jucători, numărul rundei, cronometru, scor și starea adversarului.
4. Încheiere de rundă: răspunsurile și explicația devin vizibile după ce ambii au blocat răspunsul sau timpul a expirat.
5. Rezultate: câștigător sau remiză, punctaj, Elo înainte/după, recapitularea răspunsurilor și revanșă.
6. Profil: istoric și evoluția ratingului.

Invitația trebuie păstrată pe durata autentificării. Camerele pline, expirate și meciurile deja începute au stări explicite.

## Trei moduri de răspuns

| Tip | Interacțiune | Evaluare propusă |
| --- | --- | --- |
| Grilă | Selectare și confirmare; una sau mai multe opțiuni, conform enunțului | Compararea exactă a selecției cu baremul |
| Numeric | Câmp numeric, unitate și precizia cerută vizibile | Valoare exactă sau toleranță definită în întrebare |
| Cod scurt (Java) | Enunț, șablon Java, editor, exemple și rezultate de test | Teste deterministe într-un executor izolat |

După confirmare, răspunsul final este blocat. Pentru cod, rularea exemplelor și trimiterea finală sunt acțiuni diferite. Răspunsul adversarului rămâne ascuns până la încheierea rundei.

## Durată și scor: propunere de discutat

- Confirmat: utilizatorul dorește configurarea meciului în lobby.
- Propunere: gazda alege materia, capitolele, tipul întrebărilor, dificultatea, numărul rundelor și timpul de răspuns. Configurările folosesc intervale permise pentru conținutul disponibil; lobby-ul afișează durata estimată. Ambii jucători văd aceleași reguli; modificarea lor anulează confirmările de pregătire.
- Grile: preset propus de 15–20 de minute pe meci, modificabil în lobby, nu durată obligatorie.
- Numeric și cod: timpul se stabilește după complexitatea problemei, fără a impune același interval ca unei grile.
- Punctajul de corectitudine decide câștigătorul. Propunere: scor egal înseamnă remiză, ca viteza conexiunii să nu decidă singură rezultatul.
- Răspunsul primit de server după termen este respins; o evaluare de cod pentru un răspuns primit înainte de termen poate termina ulterior, cu starea „în evaluare”.
- Cronometrul autoritar și punctajele aparțin serverului. Reconectarea recuperează starea curentă, fără repornirea timpului.

## Elo și identitate: propunere pentru revizuirea planului

- Cont persistent pentru meciurile cu Elo; contul și metoda de autentificare rămân de ales.
- Rating global inițial, cu istoricul filtrabil pe materie; un rating separat pe materie rămâne o alternativă.
- Ratingul se actualizează o singură dată la final, după rezultatul complet, și se salvează împreună cu meciul.
- Propunere inițială: 1.200 Elo și factor K = 32. Ratingul se modifică după rezultatul meciului și ratingul adversarului, nu direct după numărul de puncte obținute. Exemplu: doi jucători cu același rating schimbă 16 puncte la un rezultat decisiv. Valorile sunt propuneri configurabile.
- Remiza, abandonul, întreruperea temporară și meciul anulat au rezultate distincte. O eroare tehnică de evaluare nu produce automat o înfrângere.
- Propunere: alegere Ranked / Friendly în lobby. Ranked modifică Elo și cere identități persistente; Friendly permite exersare fără schimbarea ratingului. Limitele configurărilor Ranked vor fi stabilite cu banca de întrebări.

## Interfața cu parserul colegului

Propunere de contract versionat pentru import, separat de datele publice ale meciului:

- Identificare: id, versiune, materie, capitol, limbă, dificultate, referință la sursă.
- Conținut: enunț cu suport pentru formule, tipul răspunsului, punctaj maxim, timp recomandat.
- Grile: opțiuni cu id stabil și modul de selectare.
- Numere: unitatea afișată; valoarea așteptată și toleranța rămân în baremul privat.
- Cod: limbaj, șablon și exemple publice; teste de evaluare private și limite de execuție.
- Explicația și statutul de verificare editorială a întrebării.

Parserul nu stabilește singur regulile meciului sau ratingul. Selecția întrebărilor folosește doar tipuri suportate și suficiente întrebări eligibile; lipsa lor este afișată înainte de începerea meciului. Baremul și testele private nu sunt trimise browserului în timpul rundei.

## Implementare propusă

React + TypeScript pentru interfață, Node.js pentru server și Socket.IO pentru sincronizare. Persistența, autentificarea, furnizorul de execuție a codului și găzduirea rămân de decis. Separarea executorului de cod este o cerință de arhitectură; codul jucătorilor nu rulează în procesul API.

Ordinea propusă:
1. Închiderea regulilor și alegerea structurii vizuale prin Impeccable și frontend-design.
2. Fluxul complet de interfață, folosind date demonstrative în contractul de integrare.
3. Conectarea camerelor și a stărilor live, apoi evaluare, conturi și Elo persistent.
4. Integrarea întrebărilor verificate din fluxul colegului.
5. Verificare cu webapp-testing: două sesiuni distincte, invitație, pregătire, toate tipurile de răspuns, termen, reconectare, rezultate și revanșă. Verificări separate pentru calculul Elo și actualizarea lui unică.

## Livrarea interfeței: criterii de acceptare propuse

- Flux navigabil complet: acasă, lobby, rundă, recapitulare, rezultat și profil.
- Toate textele interfeței în engleză.
- Lobby cu materie, capitole, format, dificultate, runde, timp și link de invitație; invalidările și stările de pregătire sunt vizibile.
- O componentă de rundă comună și trei zone de răspuns: grilă, numeric și Java.
- Editor Java cu șablon, exemple, stări de compilare/rulare/evaluare și erori lizibile; prototipul nu prezintă o simulare drept execuție reală.
- Rezultate care separă scorul meciului de rating și arată variația Elo explicit.
- Date demonstrative izolate într-un adaptor înlocuibil cu API-ul Node.js; contractul pentru import poate fi dat colegului.
- Interfață desktop și mobil, navigabilă de la tastatură, cu stări pentru încărcare, conexiune întreruptă, cameră invalidă/plină, conținut insuficient și evaluare indisponibilă.
- Verificarea multiplayer-ului real și a persistenței devine criteriu obligatoriu la conectarea backendului, distinct de evaluarea prototipului de interfață.

## Propunerea vizuală în curs

Decizia se vede la http://127.0.0.1:52324/ (cheie locală 2d2cd69e). Direcția Campus scorebook folosește o interfață luminoasă, tonuri violet temperate și progresul pereche al jucătorilor. Alternativa de categorie este o interfață întunecată familiară din produsele de duel pe cod. Sunt schițe de lobby, nu implementarea aplicației.

Confirmat: interfață în engleză, provocări de cod în Java și alegerea Campus scorebook. Numele Basis Arena este provizoriu. Implementarea și instrucțiunile de rulare sunt în README.md.

## Referințe tehnice verificate

- Socket.IO: https://socket.io/docs/v4/
- Recuperarea conexiunii: https://socket.io/docs/v4/connection-state-recovery/
- Exemplu de API pentru evaluarea codului: https://ce.judge0.com/ (candidat, nu furnizor ales).
- Limita Node.js vm: https://nodejs.org/api/vm.html (nu reprezintă o graniță de securitate pentru cod neîncrezut).
