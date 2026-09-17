# Guion de demo — Conway Spellcaster (3 minutos)

## 0. Antes de empezar

- `python -m http.server 8080` y abrir `http://localhost:8080` en Chrome.
- Si vas a usar la API real: al escribir el primer hechizo el juego pide la key con un modal
  (`ui.promptApiKey`); se guarda en `localStorage`, nunca en el repo.
- Si no hay key o falla la API: el juego sigue jugable 100% por teclado (ver plan B, abajo).

## 1. Pitch (30 s)

> "Esto es Conway Spellcaster. Cruzas un tablero del Juego de la Vida de Conway — las celdas cian
> están vivas, siguen las reglas de nacimiento y muerte de siempre, y te matan si las pisas. No
> colocas patrones a mano: le escribes a la IA en español lo que quieres — 'lanza un proyectil',
> 'protégeme por arriba' — y Claude Haiku 4.5 traduce eso a un patrón del grimorio (glider, LWSS,
> block...) con posición y dirección, usando tool use con `tool_choice` forzado para que la
> respuesta sea siempre una llamada de función válida, nunca texto libre. Si la IA falla o no hay
> key, hay un modo teclado 1-7 sin red, así que la partida nunca se bloquea."

## 2. Tutorial (10 s)

Enter × 4 (o clic en "JUGAR") para pasar los 4 pasos, o `Escape` para saltarlo del todo si hay prisa.

## 3. Secuencia ganadora verificada (teclado, sin API)

Nivel fijo: héroe en (2,21), salida en (37,12), `maxTurns` 30. El tablero envuelve toroidalmente,
así que la ruta corta es ir al OESTE (wrap) y luego al NORTE. Verificado con Playwright contra
`window.__game` (movePlayer/castSpell reales) tras cada cambio de nivel:

**Secuencia exacta (14 teclas de movimiento + 1 hechizo = 15 turnos, dentro de la ventana ideal
15-25 turnos, con 1 hechizo lanzado):**

```
A            (oeste, wrap 2→1)
5            (castea BLINKER por teclado — "un faro" a 3 celdas al este del héroe)
A A A A      (oeste, wrap ...→0→39→38→37)
W W W W W W W W W   (norte, de y=21 a y=12: llegada a la salida → REACTOR ESTABILIZADO)
```

Resultado real de esta corrida: `turn 15`, `spellsCast 1`, `phase "won"`, score 1700 (rank B).
Si prefieres no castear nada, la ruta pura de movimiento (5× oeste + 9× norte) también gana, en
14 turnos — usa la de arriba para la demo porque muestra el grimorio en acción.

Nota de diseño (honesta): la salida está guardada por 3 `block` + 1 `beehive` estables a distancia
2 en las direcciones cardinales (no un anillo topológicamente sellado — ver `CLAUDE.md`, no es
alcanzable con still-lifes pequeños contra un jugador que solo se mueve en ortogonal sin que el
propio anillo se vuelva inestable). Bloquean la aproximación recta por el sur; en esta corrida esa
guardia ya se había disuelto por la evolución del `r_pentomino` cercano antes de que el héroe
llegara, así que caminar bastaba. El hechizo de la secuencia de arriba es para el show, no
estrictamente obligatorio — sé transparente con esto si preguntan.

## 4. Cinco hechizos de prueba con la API (si hay key)

Resultados reales probados contra la API (Claude Haiku 4.5, tool_choice forzado), para que sepas
qué esperar en vivo — no debería variar mucho:

| Frase | Hechizo | Posición / dir | Latencia |
|---|---|---|---|
| "lanza un proyectil hacia la derecha" | LWSS | `(player.x+2, player.y)` dir E | ~1.9 s |
| "protégeme por arriba" | Block | `(player.x, player.y-2)` dir N | ~1.6 s |
| "haz estallar el centro" | R-pentomino | `(19,11)` | ~1.6 s |
| "pon un faro a mi lado" | Blinker | `(player.x+2, player.y)` dir E | ~1.6 s |
| "algo que aguante los disparos" | Eater | `(player.x+2, player.y)` dir E | ~1.5 s |

Los comentarios de la IA (`REACTOR AI`, estilo GLaDOS en español) llegaron bien en las 5 pruebas.

## 5. Plan B: la API falla o no hay key

El juego nunca se bloquea: `spells.interpret` tiene timeout de 4 s y cualquier error (sin key, red
caída, rate limit) devuelve `keyboardFallback('2')` con el comentario
**"Reactor offline. Improviso."** en el log. Desde ahí sigue jugándose 100% con las teclas 1-7
(ver tabla de controles en el `README.md`). Para la demo: si la API tarda o fallas al pedir la key,
sigue con la secuencia de teclado de la sección 3 sin pausar el guion.

## 6. Cierre (20 s)

Ganar → overlay de score con medalla (`REACTOR ESTABILIZADO`, rank y desglose de puntos) → `R`
para reiniciar. Mencionar: motor de Conway y grimorio son puros y con tests (`js/life.test.html`,
`patterns.selftest()`), el resto del juego se integró en vivo durante la sesión.
