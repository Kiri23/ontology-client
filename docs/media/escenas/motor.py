# motor.py — the Explorador's local SPARQL engine, from the parent to the last file, narrated in Spanish with the
# real code: each listing is read from the repo by file and line range, nothing copied by hand. The chain comes from
# the grafo-comprension prototype (backtracking of explorador/src/grafo/motor.ts and archivo of each link).
# Regenerate with `bash generar.sh motor`.

import pathlib
import textwrap

import manimgx as m

from mapa import ACCENT, BOX, DIM, EDGE, GREEN, INK, mono, sans
from voice import Edge

REPO = pathlib.Path(__file__).resolve().parents[3]
MARK = "#ffcc66"
STRING = "#f2a65a"


def lines(path: str, a: int, b: int) -> str:
    """Las líneas a..b del archivo real, sin la sangría común."""
    text = (REPO / path).read_text().splitlines()[a - 1 : b]
    return textwrap.dedent("\n".join(text))


def listing(path: str, a: int, b: int, size: int = 16) -> m.Code:
    code = m.Code(
        code_string=lines(path, a, b), language="typescript", line_numbers_from=a,
        paragraph_config={"font_size": size}, background_config={"fill_color": BOX, "stroke_color": EDGE},
    )
    for line in code.code_lines:  # los strings salen en #CD0000, ilegible sobre fondo oscuro
        for glyph in line:
            if str(glyph.get_color()).upper() == "#CD0000":
                glyph.set_color(STRING)
    if code.width > 13.2:
        code.scale_to_fit_width(13.2)
    code.background.set_z_index(-2)
    code.primera = a
    return code


def mark(code: m.Code, a: int, b: int | None = None) -> m.Rectangle:
    """Un resaltado sobre las líneas a..b, con los números reales del archivo."""
    first = code.primera
    sel = [code.code_lines[i] for i in range(a - first, (b or a) - first + 1)]
    top = max(line.get_top()[1] for line in sel)
    bottom = min(line.get_bottom()[1] for line in sel)
    box = m.Rectangle(width=code.background.width - 0.2, height=top - bottom + 0.16, fill_color=MARK, fill_opacity=0.16, stroke_width=0)
    return box.move_to([code.background.get_center()[0], (top + bottom) / 2, 0]).set_z_index(-1)


def tab(text: str) -> m.Text:
    return mono(text, 18, ACCENT)


class Motor(m.Scene):
    voice = Edge("es-US-AlonsoNeural")

    def construct(self) -> None:
        cap = m.Text("", font_size=26)

        def caption_to(text: str) -> m.Animation:
            nonlocal cap
            new = sans(text, 26).to_edge(m.UP, buff=0.3)
            anim = m.ReplacementTransform(cap, new) if cap.text else m.FadeIn(new)
            cap = new
            return anim

        def crumbs(names: list[str]) -> m.VGroup:
            parts = []
            for i, name in enumerate(names):
                if i:
                    parts.append(mono("→", 24, DIM))
                parts.append(mono(name, 16, DIM))
            return m.VGroup(*parts).arrange(m.RIGHT, buff=0.18).move_to([0, 2.95, 0])

        def light(trail: m.VGroup, i: int) -> m.Animation:
            """La miga i en acento; las demás apagadas."""
            names = trail[::2]
            return m.AnimationGroup(*[n.animate.set_color(ACCENT if k == i else DIM) for k, n in enumerate(names)])

        shown: list[m.Mobject] = []

        def place(*mobs: m.Mobject) -> None:
            shown.extend(mobs)

        def clear() -> None:
            self.play(*[m.FadeOut(x) for x in shown], run_time=0.5)
            shown.clear()

        # 0 · la cadena (backtracking de grafo/motor.ts, al revés: quién llama a quién)
        self.next_section("cadena")
        trail = crumbs(["App.tsx", "VistaGrafo.tsx", "useGrafo.ts", "motor.ts", "sparql.ts"])
        gens = m.VGroup(*[mono(g, 16, DIM).next_to(trail[2 * k], m.DOWN, buff=0.12) for k, g in
                          enumerate(["padre", "hijo", "nieto", "bisnieto", "SDK"])])
        self.say(
            "[Sigamos el grafo desde el padre hasta el último descendiente], con el código real de cada archivo. "
            "[Cinco archivos, cada uno llama al siguiente.]",
            m.AnimationGroup(caption_to("Del padre al nieto: cómo llega el grafo"), m.FadeIn(trail)),
            m.FadeIn(gens),
        )

        # 1 · App.tsx, el padre (App.tsx:13 y :92)
        self.next_section("padre")
        c13 = listing("explorador/src/App.tsx", 13, 13, 18).move_to([0, 1.0, 0])
        t13 = tab("explorador/src/App.tsx · padre").next_to(c13, m.UP, buff=0.15, aligned_edge=m.LEFT)
        c92 = listing("explorador/src/App.tsx", 92, 92, 18).move_to([0, -0.9, 0])
        dots = mono("⋮", 30, DIM).move_to([0, 0.05, 0])
        place(c13, t13, c92, dots)
        b13, b92 = mark(c13, 13, 13), mark(c92, 92, 92)
        place(b13, b92)
        self.say(
            "[El padre es App punto tsx.] [En la línea trece] no importa la vista: le da a lazy una función que la "
            "importa después. [El import corre recién aquí], cuando la línea noventa y dos dibuja VistaGrafo, "
            "[y le pasa la url y el fetch], que van a bajar hasta el último archivo.",
            m.AnimationGroup(caption_to("App.tsx: la vista se importa recién al dibujarla"), light(trail, 0),
                             m.FadeIn(m.VGroup(c13, t13, c92, dots))),
            m.Create(b13),
            m.Create(b92),
            m.Indicate(c92.code_lines[0], color=ACCENT, scale_factor=1.04),
        )
        clear()

        # 2 · VistaGrafo.tsx, el hijo (VistaGrafo.tsx:52-56)
        self.next_section("hijo")
        cv = listing("explorador/src/grafo/VistaGrafo.tsx", 52, 56).move_to([0, -0.2, 0])
        tv = tab("explorador/src/grafo/VistaGrafo.tsx · hijo").next_to(cv, m.UP, buff=0.15, aligned_edge=m.LEFT)
        bv = mark(cv, 52, 52)
        place(cv, tv, bv)
        self.say(
            "[El hijo, VistaGrafo], [recibe esas props en la línea cincuenta y dos]. "
            "[En la cincuenta y cuatro se las pasa al hook useGrafo], "
            "[y en la cincuenta y seis espera]: mientras la fase no sea listo, no hay grafo que dibujar.",
            m.AnimationGroup(caption_to("VistaGrafo.tsx: le pide el grafo a un hook"), light(trail, 1), m.FadeIn(m.VGroup(cv, tv))),
            m.Create(bv),
            m.Transform(bv, mark(cv, 54, 54)),
            m.Transform(bv, mark(cv, 56, 56)),
        )
        clear()

        # 3 · useGrafo.ts, el nieto (useGrafo.ts:18-22)
        self.next_section("nieto")
        cu = listing("explorador/src/grafo/hooks/useGrafo.ts", 18, 22).move_to([0, -0.2, 0])
        tu = tab("explorador/src/grafo/hooks/useGrafo.ts · nieto").next_to(cu, m.UP, buff=0.15, aligned_edge=m.LEFT)
        bu = mark(cu, 18, 18)
        place(cu, tu, bu)
        self.say(
            "[El nieto es el hook.] [Cuando el componente monta, corre el efecto]. "
            "[Primero avisa que está cargando], [después llama a cargarGrafo con la url y el fetch], "
            "[y cuando vuelve el grafo, cambia la fase a listo].",
            m.AnimationGroup(caption_to("useGrafo.ts: cargando, error o listo"), light(trail, 2), m.FadeIn(m.VGroup(cu, tu))),
            m.Create(bu),
            m.Transform(bu, mark(cu, 20, 20)),
            m.Transform(bu, mark(cu, 21, 21)),
            m.Transform(bu, mark(cu, 22, 22)),
        )
        clear()

        # 4a · motor.ts, los imports: oxigraph es Rust compilado a WASM (motor.ts:3-5)
        self.next_section("oxigraph")
        ci = listing("explorador/src/grafo/motor.ts", 3, 5, 18).move_to([0, 0.6, 0])
        ti = tab("explorador/src/grafo/motor.ts · bisnieto").next_to(ci, m.UP, buff=0.15, aligned_edge=m.LEFT)
        rust = m.VGroup(
            mono("oxigraph (Rust)", 18, INK), mono("→", 26, DIM), mono("web_bg.wasm", 18, GREEN), mono("→", 26, DIM),
            mono("la pestaña", 18, INK),
        ).arrange(m.RIGHT, buff=0.25).move_to([0, -1.4, 0])
        bi = mark(ci, 3, 3)
        place(ci, ti, rust, bi)
        self.say(
            "[El bisnieto es motor punto ts, y aquí aparece oxigraph.] [La línea tres trae init y Store.] "
            "Oxigraph es una base de datos de grafos escrita en Rust, que entiende SPARQL. "
            "[Un navegador no corre Rust, pero sí corre WASM]: el Rust se compila a un archivo punto wasm. "
            "[La línea cuatro trae la dirección de ese archivo], [y la cinco trae el SDK], el único camino al servidor.",
            m.AnimationGroup(caption_to("motor.ts: oxigraph, Rust compilado a WASM"), light(trail, 3), m.FadeIn(m.VGroup(ci, ti))),
            m.Create(bi),
            m.FadeIn(rust),
            m.Transform(bi, mark(ci, 4, 4)),
            m.Transform(bi, mark(ci, 5, 5)),
        )
        clear()

        # 4b · motor.ts, la carga (motor.ts:31-37)
        self.next_section("carga")
        cc = listing("explorador/src/grafo/motor.ts", 31, 37).move_to([0, -0.3, 0])
        tc = tab("explorador/src/grafo/motor.ts · cargar()").next_to(cc, m.UP, buff=0.15, aligned_edge=m.LEFT)
        bc = mark(cc, 31, 31)
        place(cc, tc, bc)
        self.say(
            "[En cargar pasan dos cosas en paralelo.] [Init levanta el WASM dentro de la pestaña], "
            "[y el SDK pide el grafo entero], con un CONSTRUCT que trae todas las tripletas, en Turtle. "
            "[Cuando las dos terminan], [se crea un Store vacío], [y load lo llena con el Turtle que mandó el servidor].",
            m.AnimationGroup(caption_to("cargar(): el WASM y el grafo, en paralelo"), m.FadeIn(m.VGroup(cc, tc)), m.Create(bc)),
            m.Transform(bc, mark(cc, 32, 32)),
            m.Transform(bc, mark(cc, 33, 33)),
            m.Transform(bc, mark(cc, 34, 34)),
            m.Transform(bc, mark(cc, 36, 36)),
            m.Transform(bc, mark(cc, 37, 37)),
        )
        clear()

        # 4c · motor.ts, una vez por pestaña (motor.ts:49-54)
        self.next_section("una-vez")
        co = listing("explorador/src/grafo/motor.ts", 49, 54).move_to([0, -0.3, 0])
        to = tab("explorador/src/grafo/motor.ts · cargarGrafo()").next_to(co, m.UP, buff=0.15, aligned_edge=m.LEFT)
        bo = mark(co, 49, 50)
        place(co, to, bo)
        self.say(
            "Todo esto pasa una sola vez por pestaña. [El operador de la línea cincuenta guarda la promesa]: "
            "la segunda vista que pida el grafo recibe la misma. [Si la carga falla, se borra], "
            "[y el próximo intento vuelve a empezar].",
            m.AnimationGroup(caption_to("cargarGrafo(): una sola carga por pestaña"), m.FadeIn(m.VGroup(co, to)), m.Create(bo)),
            m.Transform(bo, mark(co, 51, 51)),
            m.Transform(bo, mark(co, 52, 52)),
        )
        clear()

        # 5 · sparql.ts del SDK (sparql.ts:42-43 y :52-57)
        self.next_section("sdk")
        ca = listing("sparql.ts", 42, 43).move_to([0, 1.3, 0])
        ta = tab("sparql.ts · el SDK, consultar()").next_to(ca, m.UP, buff=0.15, aligned_edge=m.LEFT)
        cb = listing("sparql.ts", 52, 55).move_to([0, -0.3, 0])
        cz = listing("sparql.ts", 57, 57).move_to([0, -1.95, 0])
        dots2 = mono("⋮", 30, DIM).move_to([0, (ca.get_bottom()[1] + cb.get_top()[1]) / 2, 0])
        dots4 = mono("⋮", 30, DIM).move_to([0, (cb.get_bottom()[1] + cz.get_top()[1]) / 2, 0])
        ba = mark(ca, 42, 43)
        bb = mark(cb, 52, 54)
        bz = mark(cz, 57, 57)
        place(ca, ta, cb, cz, dots2, dots4, ba, bb, bz)
        self.say(
            "[El último eslabón vive en el SDK]: sparql punto ts. [Arma la url con la consulta como parámetro], "
            "[hace el fetch con el Accept que pidió el motor], [y devuelve el texto tal cual]. "
            "No interpreta nada: eso le toca al motor.",
            m.AnimationGroup(caption_to("sparql.ts: un GET /sparql y el texto tal cual"), light(trail, 4),
                             m.FadeIn(m.VGroup(ca, ta, cb, cz, dots2, dots4))),
            m.Create(ba),
            m.Create(bb),
            m.Create(bz),
        )
        clear()

        # el texto sube: sparql.ts → motor.ts → useGrafo.ts → VistaGrafo.tsx
        self.next_section("sube")
        path = m.Line(trail[8].get_bottom() + 0.55 * m.DOWN, trail[2].get_bottom() + 0.55 * m.DOWN, color=GREEN, stroke_width=3)
        dot = m.Dot(radius=0.1, color=GREEN).move_to(path.get_start())
        sube = sans("Turtle → Store → listo → se dibuja", 26, GREEN).move_to([0, 0.3, 0])
        place(path, dot, sube)
        self.say(
            "[Y el resultado sube por la misma cadena]: [del SDK al motor, del motor al hook, del hook a la vista], "
            "[que por fin dibuja].",
            m.AnimationGroup(caption_to("Y el grafo sube por la misma cadena"), m.FadeIn(dot), m.Create(path)),
            m.MoveAlongPath(dot, path, rate_func=m.linear),
            m.FadeIn(sube),
        )
        clear()
        self.play(m.FadeOut(trail), m.FadeOut(gens), run_time=0.4)

        # 6 · la consulta libre (ConsultaLibre.tsx:25-34)
        self.next_section("consulta")
        trail2 = crumbs(["VistaGrafo.tsx", "ConsultaLibre.tsx", "validador.ts", "motor.ts"])
        cl = listing("explorador/src/grafo/vistas/ConsultaLibre.tsx", 25, 34, 15).move_to([0, -0.5, 0])
        tl = tab("explorador/src/grafo/vistas/ConsultaLibre.tsx").next_to(cl, m.UP, buff=0.15, aligned_edge=m.LEFT)
        bl = mark(cl, 25, 25)
        place(cl, tl, bl)
        self.say(
            "[Ahora una consulta que escribes tú.] VistaGrafo elige la consulta libre, [y correrValidada hace dos pasos]. "
            "[Primero valida], [y si hay motivos, ni toca el motor]. [Después corre], y mide cuánto tardó.",
            m.AnimationGroup(caption_to("Una consulta libre: validar, después correr"), m.FadeIn(trail2), light(trail2, 1),
                             m.FadeIn(m.VGroup(cl, tl))),
            m.Create(bl),
            m.Transform(bl, mark(cl, 26, 26)),
            m.Transform(bl, mark(cl, 27, 27)),
            m.Transform(bl, mark(cl, 30, 30)),
        )
        clear()

        # 7 · el validador (validador.ts:107-112 y :127-128)
        self.next_section("validador")
        cx = listing("explorador/src/grafo/logica/validador.ts", 107, 112, 15).move_to([0, 0.75, 0])
        tx = tab("explorador/src/grafo/logica/validador.ts · validar()").next_to(cx, m.UP, buff=0.15, aligned_edge=m.LEFT)
        cy = listing("explorador/src/grafo/logica/validador.ts", 127, 128, 15).move_to([0, -1.75, 0])
        dots3 = mono("⋮", 30, DIM).next_to(cx, m.DOWN, buff=0.1)
        bx = mark(cx, 107, 112)
        by = mark(cy, 127, 128)
        place(cx, tx, cy, dots3, bx, by)
        self.say(
            "[El validador lee la consulta antes que el motor.] [Si cambia datos, un INSERT o un DELETE, la rechaza]. "
            "[SERVICE y FROM también]: aquí solo se consulta el grafo que se cargó.",
            m.AnimationGroup(caption_to("validar(): lo que no se corre, explicado"), light(trail2, 2),
                             m.FadeIn(m.VGroup(cx, tx, cy, dots3))),
            m.Create(bx),
            m.Create(by),
        )
        clear()

        # 8 · correr (motor.ts:58-60)
        self.next_section("correr")
        cr = listing("explorador/src/grafo/motor.ts", 58, 60, 17).move_to([0, 0.2, 0])
        tr = tab("explorador/src/grafo/motor.ts · correr()").next_to(cr, m.UP, buff=0.15, aligned_edge=m.LEFT)
        br = mark(cr, 59, 59)
        sin_red = sans("store.query corre en el WASM: sin red", 24, GREEN).next_to(cr, m.DOWN, buff=0.6)
        place(cr, tr, br, sin_red)
        self.say(
            "[Y correr es una línea.] [Store punto query corre el SPARQL dentro del WASM, sin red], "
            "[y leerResultado lo convierte en tabla, sí o no, o tripletas].",
            m.AnimationGroup(caption_to("correr(): una línea, dentro de la pestaña"), light(trail2, 3), m.FadeIn(m.VGroup(cr, tr))),
            m.Create(br),
            m.FadeIn(sin_red),
        )
        clear()
        self.play(m.FadeOut(trail2), run_time=0.4)

        # cierre
        self.next_section("cierre")
        uno = sans("El grafo baja una vez, por el SDK.", 28)
        dos = sans("Vive en un Store de oxigraph, dentro de la pestaña.", 28)
        tres = sans("Cada consulta corre ahí, sin volver al servidor.", 28, ACCENT)
        m.VGroup(uno, dos, tres).arrange(m.DOWN, buff=0.45).move_to([0, -0.2, 0])
        self.say(
            "Así queda. [El grafo baja una vez, por el SDK.] [Vive en un Store de oxigraph, dentro de la pestaña.] "
            "[Y cada consulta corre ahí, sin volver al servidor.]",
            m.AnimationGroup(caption_to("Oxigraph, WASM y SPARQL, en una frase"), m.FadeIn(uno)),
            m.FadeIn(dos),
            m.FadeIn(tres),
        )
        self.wait(1.5)
