# Prompt maestro para el Build Day

Pégalo en Claude Code abierto en la raíz del repo. Usa la palabra "ultracode" para habilitar orquestación multi-agente.

---

ultracode

Vamos a construir Conway Spellcaster en 60 minutos usando múltiples agentes en paralelo. Somos 2 personas: yo dirijo a los agentes, mi compañero produce los assets a mano (issue #11), así que ningún agente toca `assets/`.

Antes de hacer nada:
1. Lee `CLAUDE.md` completo. Es el contrato de arquitectura: archivos, interfaces, nivel, tema visual, assets. Nadie cambia una firma sin decirlo.
2. Lee los mockups `docs/mockup-1.png` y `docs/mockup-2.png`. Ese es el resultado visual esperado.
3. Corre `gh issue list -R BalaclavaAM/conway-spellcaster --state open --json number,title,labels,body` y lee cada card. Cada issue es dueño de archivos disjuntos y trae criterios de aceptación.

Plan de ejecución:
- **Ola 1 (paralelo, ahora):** un agente por cada issue con label P0 excepto #12 (integración) y #11 (assets, humano). Son: #1 shell, #2 life, #3 patterns, #4 render, #5 game, #6 spells, #7 ui. Cada agente trabaja SOLO en los archivos de su card, programa contra las interfaces de CLAUDE.md cuando el módulo vecino no exista todavía, verifica sus criterios de aceptación y commitea directo a `main` con prefijo `#<n>` y push. Sin ramas, sin PRs.
- **Ola 2 (paralelo, apenas termine la ola 1):** #8 audio, #9 tutorial, #10 score.
- **Ola 3 (un solo agente, secuencial):** #12 integración. Levanta `python -m http.server 8080`, juega una partida completa, arregla errores de consola, corre `life.test.html` y `patterns.selftest()`, mide FPS con F (objetivo 120+), ajusta el nivel para que se gane en 15–25 turnos con al menos un hechizo, escribe `docs/DEMO.md` con el guion de 3 minutos, y cierra todos los issues con `gh issue close`.

Reglas para todos los agentes:
- Vanilla JS con ES modules, cero build, cero npm. Chrome y Edge.
- Estética neón sobre negro según `css/theme.css`. Si algo se ve feo comparado con el mockup, se arregla, no se acepta.
- El juego debe correr sin API key (modo teclado 1..7) y sin ningún asset (fallbacks procedurales). Los assets del humano se cargan si existen.
- Cada agente termina reportando: archivos tocados, criterios cumplidos, criterios no cumplidos y por qué.
- Si un agente necesita cambiar una interfaz de CLAUDE.md, comenta en su issue con `gh issue comment` y lo aplica también en CLAUDE.md.

Tú, orquestador: después de cada ola dime en 5 líneas qué cerró, qué quedó pendiente y qué riesgo ves para el ensayo de la demo. Al final abre el juego en el navegador y dame un screenshot.

---

## Notas para el humano de assets (#11)

Orden por impacto: `clawd.svg` → SFX en sfxr.me → música en beepbox.co → sprite sheet en piskelapp.com → iconos → logo → medallas → favicon. Commitea cada archivo apenas esté listo. Nombres exactos en la tabla "Assets" de `CLAUDE.md`.

## Antes del evento (5 minutos)

- Tener la API key de Anthropic a mano; el juego la pide una vez y la guarda en localStorage.
- `gh auth status` en verde y `python` en el PATH.
- Probar que `claude` arranca en la raíz del repo y que lee `CLAUDE.md`.
