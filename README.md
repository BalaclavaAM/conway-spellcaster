# Conway Spellcaster

Roguelike de 1 nivel donde **Clawd** cruza un tablero de Conway lanzando hechizos en lenguaje natural que Claude
traduce a patrones del Juego de la Vida. Construido en 1 h con múltiples agentes de Claude Code para el Claude Build Day.

- Arquitectura y contrato entre módulos: [`CLAUDE.md`](CLAUDE.md)
- Cards de trabajo: Issues del repo (una por módulo, archivos disjuntos, atacables en paralelo)
- Mockups: `docs/`

```
python -m http.server 8080
# abrir http://localhost:8080
```

## Controles

- **Flechas / WASD**: mover a Clawd 1 celda (el tablero envuelve toroidalmente: salir por un borde
  te aparece en el opuesto).
- **Enter**: enfoca la consola de hechizos (`Escribe un hechizo...`); `Enter` envía, `Shift+Enter` salto de línea.
- **1..7**: castea un hechizo del grimorio por teclado (sin IA) 3 celdas al este del héroe, dir E.
  Orden: 1 Glider · 2 LWSS · 3 Block · 4 Beehive · 5 Blinker · 6 R-pentomino · 7 Eater.
- **R**: reinicia la partida (vuelve directo a `play`, no repite el tutorial).
- **M**: mute.
- **F**: muestra/oculta el contador de FPS.
- **Escape**: dentro del tutorial, lo salta.

Guion de demo de 3 minutos: [`docs/DEMO.md`](docs/DEMO.md).
