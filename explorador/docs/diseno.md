# Diseño del explorador (plan, 2026-10-16)

Brief: herramienta de desarrollador de uso diario, en el teléfono y en el desktop. Menos texto, más aire, jerarquía
clara, ninguna feature escondida (token, confirmación, JSON, tabla, JSDoc y firma siguen a la vista, a lo sumo
plegados).

1. **Color, el mismo fichero**: papel `#f6efe3`, papel de ficha `#fbf8f1`, tinta `#3a2c20`, regla `#dccdb6`, rojo
   `#b8452c` solo para lo que escribe. Se suma una paleta de seis tonos para las clases del grafo, sin rojo (el rojo ya
   significa "escribe"): los Jobs en azules, los Repos en verde, ocre, oliva y ciruela, así las dos islas se leen por
   color.
2. **Tipos, los tres de siempre con un rol cada uno**: Literata para títulos y prosa, Schibsted Grotesk para la UI,
   Martian Mono solo para código, IRIs y firmas (no para rótulos chicos de datos).
3. **Rótulos en minúscula de oración**: fuera las etiquetas en mayúsculas espaciadas (CONTROLES, RESPUESTA, FIRMA).
4. **Teléfono, una columna y una sola barra sticky** de 48 px con la historia o la vista actual; la cabecera entra en
   una línea. Correr ocupa el ancho entero. Documentación (JSDoc y firma) y la ayuda del token van en `<details>`:
   plegadas en el teléfono, abiertas en el desktop.
5. **Desktop, como hoy**: barra a la izquierda; la historia con documentación y controles lado a lado. En el Grafo, el
   lienzo a la izquierda (sticky) y el panel de la vista a la derecha.
6. **Lo memorable, en un solo lugar**: el lienzo es papel cuadriculado (el renglón azul de los inputs, en grilla) y los
   nodos van en tinta de su clase. El resto de la página queda quieto.
7. **Movimiento**: solo el que responde a un toque (abrir, agregar vecinos con un layout corto); con
   `prefers-reduced-motion`, nada se anima, ni el layout de Cytoscape.
8. **Dedo primero**: todo lo tocable mide ≥ 44 px, nada depende de hover, los paneles van debajo del lienzo y no encima.

Revisión contra el brief: el papel crema con serif y acento rojo es uno de los defaults de página generada; se queda
porque es la identidad que ya tiene el explorador y el brief pide mantenerla. Lo que sí cambié del plan inicial: saqué
los rótulos en mayúsculas y los `·` como separador de metadatos (plantilla), y la mono deja de ser la letra de los
rótulos chicos. El lienzo cuadriculado es la decisión propia de este brief: un grafo dibujado en papel de grafo.
