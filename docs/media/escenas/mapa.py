# mapa.py — how ontology-client is built, narrated in Spanish (edge-tts, es-US-AlonsoNeural): the two
# systems, the SDK's layers, the trip of jobs.get(), what the agent wrote in PR #10 and the jobs ↔ motor
# cycle. Each box comes from the grafo-comprension prototype (pr 10, capas, archivo mod.ts) and from the
# file at its anchor: mod.ts:20-29, motor.ts:1-14, jobs.ts:5-18, explorador/src/App.tsx:13,
# explorador/src/grafo/motor.ts:5. Regenerate with `bash generar.sh mapa`.

import manimgx as m

from voice import Edge

MONO = "monospace"
INK = "#d4d4d4"
DIM = "#8a8a8a"
BOX = "#1b1f24"
EDGE = "#555555"
ACCENT = "#ffcc66"
GREEN = "#7ee787"
RED = "#ff7b72"
BLUE = "#79c0ff"


def mono(text: str, size: int = 22, color: str = INK, **kw) -> m.Text:
    return m.Text(text, font=MONO, font_size=size, color=color, **kw)


def sans(text: str, size: int = 24, color: str = INK) -> m.Text:
    return m.Text(text, font="sans-serif", font_size=size, color=color)


def window(title: str, width: float, height: float, fill: str = BOX) -> m.VGroup:
    """A window: rounded box, title bar with three dots, centred title."""
    box = m.RoundedRectangle(width=width, height=height, corner_radius=0.2, stroke_color=EDGE, stroke_width=1, fill_color=fill, fill_opacity=1)
    bar = m.Line(box.get_corner(m.UL) + 0.55 * m.DOWN, box.get_corner(m.UR) + 0.55 * m.DOWN, stroke_color=EDGE, stroke_width=1)
    dots = m.VGroup(*[m.Dot(radius=0.07, color=c) for c in ("#ff5f57", "#febc2e", "#28c840")]).arrange(m.RIGHT, buff=0.12)
    dots.move_to(box.get_corner(m.UL) + [0.5, -0.28, 0])
    label = mono(title, 16, DIM).move_to(bar.get_center() + 0.28 * m.UP)
    return m.VGroup(box, bar, dots, label)


def node(text: str, x: float, y: float, color: str = BLUE, width: float = 0, size: int = 18) -> m.VGroup:
    label = m.Text(text, font="sans-serif", font_size=size, color=INK)
    box = m.RoundedRectangle(width=max(label.width + 0.5, width), height=label.height + 0.3, corner_radius=0.15, stroke_color=color, stroke_width=2, fill_color=BOX, fill_opacity=1)
    return m.VGroup(box, label).move_to([x, y, 0])


def arrow(start, end, color: str = DIM, ratio: float = 0.25) -> m.Arrow:
    """Una flecha entre dos puntos (entre dos mobjects, Arrow sale torcida)."""
    return m.Arrow(start, end, buff=0.06, color=color, stroke_width=2, max_tip_length_to_length_ratio=ratio)


class Mapa(m.Scene):
    voice = Edge("es-US-AlonsoNeural")

    def construct(self) -> None:
        cap = m.Text("", font_size=26)

        def caption_to(text: str) -> m.Animation:
            nonlocal cap
            new = sans(text, 26).to_edge(m.UP, buff=0.3)
            anim = m.ReplacementTransform(cap, new) if cap.text else m.FadeIn(new)
            cap = new
            return anim

        def clear() -> None:
            self.play(*[m.FadeOut(x) for x in self.mobjects if x is not cap], run_time=0.6)

        # 1 · dos sistemas (cypher de roles por sistema: SDK y Explorador)
        self.next_section("sistemas")
        sdk = window("SDK", 5.4, 4.2).move_to([-3.4, -0.5, 0])
        sdk_body = m.VGroup(
            mono("mod.ts   jobs.ts", 20), mono("motor.ts   sparql.ts", 20), mono("cliente.ts   api.ts", 20), mono("cli.ts   action.yml", 20)
        ).arrange(m.DOWN, buff=0.3).move_to(sdk[0].get_center() + 0.3 * m.DOWN)
        exp = window("Explorador", 5.4, 4.2).move_to([3.4, -0.5, 0])
        exp_body = m.VGroup(
            mono("App.tsx   historias/", 20), mono("grafo/   (PR #10)", 20, ACCENT), sans("React + Vite", 20, DIM)
        ).arrange(m.DOWN, buff=0.35).move_to(exp[0].get_center() + 0.3 * m.DOWN)
        uses = arrow(sdk[0].get_right(), exp[0].get_left(), ACCENT, 0.3)
        uses_label = mono("mod.ts", 16, ACCENT).next_to(uses, m.DOWN, buff=0.3)
        self.say(
            "[Este repo tiene dos sistemas.] [El SDK], una librería que le habla al servidor de ontología. "
            "Y [el Explorador], una app de React que muestra el SDK y dibuja el grafo. "
            "El Explorador [usa el SDK por su puerta pública], mod punto ts.",
            caption_to("Dos sistemas: el SDK y el Explorador"),
            m.FadeIn(m.VGroup(sdk, sdk_body)),
            m.FadeIn(m.VGroup(exp, exp_body)),
            m.AnimationGroup(m.GrowArrow(uses), m.FadeIn(uses_label)),
        )
        self.wait(0.5)
        clear()

        # 2 · las capas del SDK (roles.json; mod.ts:20-29)
        self.next_section("capas")
        capas = [
            ("cli.ts", "Superficie", GREEN), ("mod.ts", "Entrada", ACCENT), ("jobs.ts", "Módulo", BLUE),
            ("motor.ts", "Motor", BLUE), ("cliente.ts", "Transporte", BLUE), ("generado/api.ts", "Derivado", DIM),
            ("contrato/openapi.json", "Fuente", DIM),
        ]
        boxes, roles = [], []
        for i, (ruta, rol, color) in enumerate(capas):
            b = node(ruta, -4.0, 2.55 - i * 0.92, color, width=3.6, size=17)
            boxes.append(b)
            roles.append(mono(rol, 17, DIM).next_to(b, m.RIGHT, buff=0.3))
        links = [arrow(boxes[i + 1][0].get_top(), boxes[i][0].get_bottom(), DIM, 0.6) for i in range(len(boxes) - 1)]
        pila = [m.VGroup(boxes[i], roles[i], *( [links[i]] if i < len(links) else [] )) for i in range(len(boxes))]
        self.say(
            "[El SDK es una pila de capas.] Abajo está [el contrato], que genera el servidor. "
            "De él salen [los tipos]. Encima, [el transporte], que hace cada pedido. "
            "Después [el motor], [los módulos] como jobs, [la puerta pública], y arriba [la CLI].",
            caption_to("El SDK: cada capa se apoya en la de abajo"),
            m.FadeIn(pila[6]), m.FadeIn(pila[5]), m.FadeIn(pila[4]), m.FadeIn(pila[3]),
            m.FadeIn(pila[2]), m.FadeIn(pila[1]), m.FadeIn(pila[0]),
        )
        self.wait(0.4)

        # los tipos suben (jobs.ts:5-6): contrato → api.ts → JobPost
        sube = m.Line([0.4, boxes[6].get_center()[1], 0], [0.4, boxes[2].get_center()[1], 0], color=GREEN, stroke_width=4)
        sube_label = sans("JobPost", 20, GREEN).next_to(sube.get_end(), m.RIGHT, buff=0.2)
        dot = m.Dot(radius=0.12, color=GREEN).move_to(sube.get_start())
        self.say(
            "[Los tipos no se escriben a mano.] [Suben desde el contrato hasta jobs], "
            "y ahí se llaman [JobPost].",
            m.AnimationGroup(caption_to("Los tipos suben: contrato → api.ts → JobPost"), m.FadeIn(dot)),
            m.MoveAlongPath(dot, sube, rate_func=m.linear),
            m.AnimationGroup(m.Create(sube), m.FadeIn(sube_label)),
        )

        # la llamada baja (motor.ts:1-14): mod → jobs → motor → http | neo4j
        http = node("HTTP\nGET /jobs", 2.4, boxes[3].get_center()[1], GREEN, size=17)
        neo = node("Neo4j\nPR #9", 5.4, boxes[3].get_center()[1], GREEN, size=17)
        to_http = arrow(roles[3].get_right(), http[0].get_left(), ACCENT, 0.1)
        to_neo = m.CurvedArrow(roles[3].get_right() + 0.2 * m.RIGHT + 0.2 * m.UP, neo[0].get_top(), angle=-0.9, color=ACCENT, stroke_width=2)
        baja = m.Line(boxes[1].get_left() + 0.2 * m.LEFT, boxes[3].get_left() + 0.2 * m.LEFT, color=ACCENT, stroke_width=4)
        pulso = m.Dot(radius=0.12, color=ACCENT).move_to(baja.get_start())
        self.say(
            "Una llamada a jobs punto get hace el camino al revés. [Baja desde la puerta pública hasta el motor], "
            "y el motor elige de dónde leer: [del servidor por HTTP], que es el default, "
            "[o de Neo4j], que llegó en el PR nueve. Las acciones que escriben van siempre por HTTP.",
            m.AnimationGroup(caption_to("La llamada baja, y el motor elige la fuente"), m.FadeOut(m.VGroup(sube, dot, sube_label)), m.FadeIn(pulso), m.MoveAlongPath(pulso, baja, rate_func=m.linear), lag_ratio=0.2),
            m.AnimationGroup(m.GrowArrow(to_http), m.FadeIn(http)),
            m.AnimationGroup(m.Create(to_neo), m.FadeIn(neo)),
        )
        self.wait(0.5)
        clear()

        # 3 · lo que escribió el agente en el PR #10 (grafo pr 10; App.tsx:13; grafo/motor.ts:5)
        self.next_section("pr10")
        app = node("App.tsx", -5.3, 1.3, ACCENT)
        vista = node("VistaGrafo.tsx", -2.2, 1.3)
        vistas = node("4 vistas\nMapa, Nodo,\nPrearmada, Libre", 1.1, 1.3)
        lienzo = node("Lienzo.tsx\nCytoscape", 4.6, 1.3, GREEN)
        sdkmod = node("mod.ts\n(SDK)", -5.3, -1.6, ACCENT)
        motor = node("grafo/motor.ts\noxigraph WASM", -2.2, -1.6, RED)
        logica = node("grafo/logica\n10 archivos", 1.1, -1.6, GREEN)
        a_lazy = arrow(app[0].get_right(), vista[0].get_left(), ACCENT, 0.3)
        lazy_label = mono("import()", 17, ACCENT).next_to(a_lazy, m.DOWN, buff=0.25)
        a_vistas = arrow(vista[0].get_right(), vistas[0].get_left(), DIM, 0.4)
        a_lienzo = arrow(vistas[0].get_right(), lienzo[0].get_left(), DIM, 0.4)
        a_logica = arrow(logica[0].get_top(), vistas[0].get_bottom(), DIM, 0.12)
        a_motor = arrow(motor[0].get_top(), vista[0].get_bottom(), DIM, 0.12)
        a_sdk = arrow(sdkmod[0].get_right(), motor[0].get_left(), ACCENT, 0.3)
        sdk_label = mono("sparql", 17, ACCENT).next_to(a_sdk, m.DOWN, buff=0.25)
        self.say(
            "[En el PR diez, el agente escribió la vista Grafo]: treinta y nueve archivos nuevos. "
            "[App punto tsx la carga perezosa], para no bajar el WASM si no hace falta. "
            "[VistaGrafo elige una de cuatro vistas.] Las vistas [dibujan con Lienzo], que usa Cytoscape, "
            "y [piensan con diez archivos de lógica pura]. "
            "Los datos vienen de [un motor SPARQL que corre en el navegador], oxigraph en WASM, "
            "que recibe el grafo entero [por el SDK], nunca con un fetch a mano.",
            caption_to("PR #10: la vista Grafo, en el navegador"),
            m.AnimationGroup(m.FadeIn(app), m.GrowArrow(a_lazy), m.FadeIn(lazy_label), m.FadeIn(vista), lag_ratio=0.3),
            m.AnimationGroup(m.GrowArrow(a_vistas), m.FadeIn(vistas), lag_ratio=0.3),
            m.AnimationGroup(m.GrowArrow(a_lienzo), m.FadeIn(lienzo), lag_ratio=0.3),
            m.AnimationGroup(m.FadeIn(logica), m.GrowArrow(a_logica), lag_ratio=0.3),
            m.AnimationGroup(m.FadeIn(motor), m.GrowArrow(a_motor), lag_ratio=0.3),
            m.AnimationGroup(m.FadeIn(sdkmod), m.GrowArrow(a_sdk), m.FadeIn(sdk_label), lag_ratio=0.3),
        )
        self.wait(0.5)
        clear()

        # 4 · lo que marca `capas`: el ciclo jobs ↔ motor (motor.ts:12, jobs.ts:18)
        self.next_section("ciclo")
        jobs = node("jobs.ts\nMódulo", -3.2, -0.3, BLUE, width=2.6, size=20)
        mot = node("motor.ts\nMotor", 3.2, -0.3, BLUE, width=2.6, size=20)
        codigo = m.CurvedArrow(jobs[0].get_top(), mot[0].get_top(), angle=-1.0, color=ACCENT, stroke_width=3)
        codigo_label = mono("jobs.ts:18  usa motorActual", 18, ACCENT).next_to(codigo, m.UP, buff=0.2)
        tipos = m.CurvedArrow(mot[0].get_bottom(), jobs[0].get_bottom(), angle=-1.0, color=RED, stroke_width=3)
        tipos_label = mono("motor.ts:12  import type JobPost", 18, RED).next_to(tipos, m.DOWN, buff=0.2)
        self.say(
            "La herramienta capas encontró ocho imports contra la matriz. El más interesante es [un ciclo]. "
            "[Jobs usa al motor en el código], para saber de dónde leer. "
            "[Y el motor usa los tipos de jobs], porque devuelve puestos. Es solo de tipos, pero cierra la vuelta.",
            m.AnimationGroup(caption_to("capas: un ciclo entre jobs.ts y motor.ts"), m.FadeIn(jobs), m.FadeIn(mot)),
            m.AnimationGroup(m.Create(codigo), m.FadeIn(codigo_label)),
            m.AnimationGroup(m.Create(tipos), m.FadeIn(tipos_label)),
        )
        self.wait(0.5)
        clear()

        # cierre
        self.next_section("cierre")
        uno = sans("El grafo guarda el índice: rutas, líneas, PRs.", 30)
        dos = sans("El porqué está en el archivo del ancla.", 30, ACCENT)
        m.VGroup(uno, dos).arrange(m.DOWN, buff=0.5).move_to([0, -0.3, 0])
        self.say(
            "[Ese es el mapa.] [El grafo guarda el índice]: rutas, líneas y PRs. "
            "[El porqué lo lees en el archivo] al que apunta cada ancla.",
            caption_to("Índice en el grafo, significado en el código"),
            m.FadeIn(uno),
            m.FadeIn(dos),
        )
        self.wait(1.5)
