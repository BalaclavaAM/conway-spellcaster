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

Nivel fijo: héroe en (2,21), salida en (37,12) sellada por un `tub` (4 celdas, para siempre vivas)
en sus 4 vecinos ortogonales — (37,11) (36,12) (38,12) (37,13). Como el héroe solo se mueve en
ortogonal, **la salida es matemáticamente inalcanzable sin romper el tub con un hechizo**
(confirmado: caminar hasta ahí sin castear nada mata al jugador). `maxTurns` 24, población en
[10,60]. Verificado con Playwright contra `window.__game` (movePlayer/castSpell reales):

**Secuencia exacta (gana en el turno 15, con 1 hechizo, población 23-49 en toda la partida):**

```
A A A                (oeste con wrap: 2→1→0→39)
W W W W W W W W W    (norte: y 21→12, llegada a (39,12), junto al tub)
6                     (castea R-PENTOMINO por teclado → cae en (36,12) dir W: rompe 2 puntas
                       del tub, (38,12) y (37,13), en la siguiente generación)
A A                   (oeste: 39→38→37, entra a la salida → REACTOR ESTABILIZADO)
```

Resultado real de esta corrida: `turn 15`, `spellsCast 1`, `phase "won"`. Ojo con el orden de las
teclas de movimiento: son `A` (izquierda/oeste) y `W` (arriba/norte) del layout WASD, no letras
literales de "oeste"/"norte".

Amenaza extra en el corredor: hay un `LWSS` viajando al ESTE por la fila 16 desde x=28, que cruza
la zona de la salida sobre la gen 20-22. La secuencia de arriba entra a tiempo (turno 15) y no lo
cruza; si te retrasas (p.ej. bloqueando el LWSS con block/eater, teclas 3/7) el margen se reduce.

No probamos con LWSS (tecla 2) para romper el tub: su caja (5×4) desde `player.x-3` con el jugador
a solo 2 celdas de la salida acaba pisando la propia casilla del jugador y lo mata — usa
r_pentomino (tecla 6), que es más compacto (3×3) y no llega hasta el héroe.

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
