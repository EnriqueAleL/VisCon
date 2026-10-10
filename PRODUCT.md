# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js 24, React + TypeScript, Vite, Socket.IO și SQLite pentru prima implementare locală. Provocările de cod sunt în Java, separat de tehnologia serverului. Găzduirea publică rămâne de stabilit.

## Users

Studenți ETH Zürich care vor să concureze între ei pe întrebări bazate pe materialele din Basisjahr. Specializarea și materiile inițiale rămân de stabilit.

## Product Purpose

Basis Arena oferă un joc competitiv multiplayer, inspirat de NeetCode Versus, cu rating Elo și camere accesibile prin link. VisCon completează aplicația cu întrebări despre cursuri, căutare în transcrieri și vizionarea momentelor relevante.

## Operating Context

Un coleg al utilizatorului se ocupă de parsarea transcripturilor cursurilor, pe baza cărora vor fi pregătite întrebările. Lucrul din această sesiune se concentrează pe interfața aplicației și integrarea ei cu datele întrebărilor.

Utilizatorul a cerut apoi preluarea repetată a modificărilor din repository și integrarea noului frontend cu aplicația existentă, păstrând ambele. Baza integrării este `ce8e44b`: Arena la `/`, VisCon la `/learn`, cu același server și navigare reciprocă.

Utilizatorul a cerut mai întâi un plan discutat împreună, apoi implementarea. Skillurile instalate se folosesc pe parcursul sesiunii, în etapele relevante.

## Capabilities and Constraints

Confirmate:
- Prima versiune are meciuri 1v1.
- Fiecare jucător are un rating Elo.
- Camerele pot fi distribuite prin link.
- Întrebările au ca bază transcripturile cursurilor; parsarea este responsabilitatea colegului.
- Întrebările pot fi grile tip Kahoot, răspunsuri numerice sau provocări de cod scurt.
- Configurarea meciului se face în lobby. Durata trebuie adaptată materiei și tipului de întrebări; utilizatorul a ales configurarea în lobby în locul unei durate fixe.
- Provocările de cod sunt în Java.
- Arena este în engleză; interfața VisCon importată își păstrează textele în germană.

Prima implementare:
- Runde sincronizate; gazda configurează materia, formatul, dificultatea, numărul și timpul rundelor. Modificările anulează confirmările de pregătire.
- 1.000 de puncte per răspuns corect; egalitatea de punctaj produce remiză. Ranked modifică ratingul global (inițial 1.200, K = 32); Friendly îl păstrează.
- Profil anonim persistent în browser, protejat de un cookie de sesiune HTTP-only. SQLite păstrează istoricul și Elo; recuperarea contului și autentificarea între dispozitive sunt în afara primei versiuni.
- Camere reale 1v1 și bot de practică etichetat. Camerele active sunt în memoria unui singur proces; rezultatele finalizate sunt persistente.
- Java folosește un adaptor Judge0, activ doar după configurarea unui executor izolat; în mediul livrat, rularea nu este configurată. Editorul și stările aferente sunt disponibile.
- Contractul de import și limitele verificării sunt documentate în docs/question-contract.md. Colegul furnizează întrebările și verificarea conținutului.

Integrarea VisCon:
- 24 de înregistrări originale cu transcrieri și capitole, plus trei videoclipuri demo etichetate.
- Selectorul de cursuri, navigarea prin iconuri și istoricul din noul frontend sunt păstrate. Înregistrările fără dată și program de studiu confirmate apar la „Aufzeichnungen”.
- Căutare locală în transcrieri fără cheie API; player cu subtitrări, capitole, salt la secunda relevantă și semne de carte persistente. Notele sunt afișate când există rezumate salvate.
- Pipeline-ul Python Q&A este opțional și necesită dependențe și credențiale proprii. Erorile furnizorului sunt semnalate și folosesc căutarea locală ca rezervă.
- Întrebările Arena rămân o bancă demo separată; integrarea nu transformă automat transcrierile în întrebări validate pentru meciuri.

Decizii deschise pentru extindere: specializarea și materiile reale, limba întrebărilor importate, banca verificată, serviciul Java, autentificarea completă și găzduirea publică.

## Brand Commitments

La 10 octombrie 2026, utilizatorul a cerut ca Versus să fie o continuare vizuală a galaxiei existente din `galaxy/`. Acest reper înlocuiește aspectul anterior al modulului competitiv: același spațiu bleumarin, Chakra Petch și IBM Plex, navigare înapoi către cursul explorat. Modificarea privește Versus și legăturile sale; comportamentul meciurilor, identitatea jucătorului și celelalte module se păstrează.

Ulterior, utilizatorul a ales intrarea în Versus printr-o navă din galaxie, apropierea camerei de cockpit și un duel între nave bazat pe răspunsuri. A confirmat păstrarea punctajului și a regulilor existente: lupta reprezintă rezultatele rundelor, fără puncte de viață sau finalizare anticipată prin distrugere. Răspunsurile rămân private până când serverul închide runda.

NeetCode Versus este referința funcțională pentru competiție și invitații. „Basis Arena” rămâne numele de lucru. Utilizatorul a selectat direcția Campus scorebook prin pagina de decizie (2d2cd69e), apoi a cerut continuarea implementării.

## Evidence on Hand

Aplicația se găsește în src/, web-interface/ și server/. Repository-ul furnizează înregistrări în lectures/ și indexul Q&A în qa/data/. O bancă validată de întrebări pentru meciuri nu a fost furnizată. Întrebările generate local sunt etichetate ca demo și nu sunt prezentate drept întrebări oficiale ETH. Testele și capturile sunt în tests/ și .impeccable/review/. Contractul integrării este în docs/integration.md.

## Product Principles

- Experiența centrală este participarea la un meci cu alți studenți.
- Ratingul face progresul competitiv vizibil pentru fiecare jucător.
- Intrarea în aceeași cameră trebuie să fie simplă printr-un link distribuit.
- Formatul de integrare trebuie să permită lucrul în paralel la interfață și la pregătirea întrebărilor.

The cockpit refinement uses a camera behind a seated astronaut in a full-screen physical cabin, with one compact task console and progressively disclosed setup. Boarding approaches from the rear and continues into that same cabin before the route handoff. The opposing ship appears only during an active duel (including explicitly labelled bot practice), never as a waiting-room decoration.
