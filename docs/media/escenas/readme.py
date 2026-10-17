# readme.py — the animation at the top of README.md: a Turtle class becomes a knowledge graph, a
# TypeScript type, a module of the SDK, and a call from the editor. Rendered with ManimGX
# (https://manimgx.academa.ai/) by docs/media/escenas/generar.sh; the GIF is docs/media/readme.gif.
#
# Book is a stand-in class (the real graph's classes are private): the shapes shown are the ones
# `deno task generar` produces from contrato/openapi.json (see generado/api.ts) and jobs.ts's.

import manimgx as m

MONO = "monospace"
CAPTION = 26
CODE = 20
INK = "#d4d4d4"
KEY = "#c586c0"
IRI = "#4fc1ff"
LIT = "#ce9178"
NUM = "#b5cea8"
BOX = "#2a2a2a"
ACCENT = "#ffcc66"

TURTLE = [
    ("@prefix ex: <https://example.org/books#> .", {"@prefix": KEY, "ex:": IRI}),
    ("", {}),
    ("ex:dune a ex:Book ;", {"ex:dune": IRI, "ex:Book": IRI, " a ": KEY}),
    ('  ex:title  "Dune" ;', {"ex:title": IRI, '"Dune"': LIT}),
    ('  ex:author "Frank Herbert" ;', {"ex:author": IRI, '"Frank Herbert"': LIT}),
    ("  ex:year   1965 .", {"ex:year": IRI, "1965": NUM}),
]

TYPE_TS = """export interface components {
  schemas: {
    Book: {
      /** Format: uri */
      link: string;
      author: string;
      title: string;
      year: number;
    };
  };
}"""

BOOKS_TS = """import type { components, operations } from "./generado/api.ts";
import { pedir } from "./cliente.ts";

export type Book = components["schemas"]["Book"];
export type FiltrosBooks =
  NonNullable<operations["books_get"]["parameters"]["query"]>;

export function get(
  filtros: FiltrosBooks = {}, opciones: OpcionesBooks = {},
): Promise<Book[]> {
  return motorActual().books.get(filtros, opciones);
}

export async function marcarLeido(
  book: Book | Book["link"], opciones: OpcionesAcciones = {},
): Promise<Book> {
  const body = { link: linkDe(book) };
  return await pedir(opciones, (c, signal) =>
    c.POST("/books/marcar-leido", { body, signal }), ES_BOOK);
}"""

USE_TS = """import { books } from "jsr:@kiri23/ontology-client";

const libros = await books.get({ author: "Frank Herbert" });
libros[0]."""

REAL_TS = """import { sparql } from "jsr:@kiri23/ontology-client";

const { texto } = await sparql.consultar(
  "SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }",
);
console.log(texto);"""


def turtle_block() -> m.VGroup:
    """The Turtle listing, one Text per line so each line can be animated on its own. Typst
    drops leading spaces, so the indent is applied by hand; a blank line is a wider gap."""
    lines = m.VGroup()
    y = 0.0
    for text, colors in TURTLE:
        if not text:
            y -= 0.2
            continue
        indent = len(text) - len(text.lstrip())
        line = m.Text(text.strip(), font=MONO, font_size=CODE, color=INK, t2c=colors)
        line.move_to([0, y, 0], aligned_edge=m.UL).shift(indent * 0.15 * m.RIGHT)
        y -= line.height + 0.14
        lines.add(line)
    return lines


def boxed(code: m.Mobject, color: str = BOX) -> m.VGroup:
    box = m.SurroundingRectangle(
        code, buff=0.3, corner_radius=0.15, stroke_width=1, stroke_color="#555555",
        fill_color=color, fill_opacity=1,
    )
    return m.VGroup(box, code)


def ts(code: str, name: str) -> m.Code:
    """A TypeScript listing with its file name as an editor tab above the box."""
    listing = m.Code(
        code_string=code, language="typescript", add_line_numbers=False,
        paragraph_config={"font_size": CODE},
        background_config={"fill_color": BOX, "stroke_color": "#555555"},
    )
    tab = m.Text(name, font=MONO, font_size=20, color="#8a8a8a")
    tab.next_to(listing.background, m.UP, buff=0.08, aligned_edge=m.LEFT).shift(0.2 * m.RIGHT)
    listing.add(tab)
    return listing


def node(text: str, color: str = IRI) -> m.VGroup:
    label = m.Text(text, font=MONO, font_size=CODE, color=color)
    box = m.RoundedRectangle(
        width=label.width + 0.4, height=0.6, corner_radius=0.15,
        stroke_color=color, stroke_width=2, fill_color="#111111", fill_opacity=1,
    )
    return m.VGroup(box, label)


def edge(a: m.Mobject, b: m.Mobject, text: str, side: m.Vector3D) -> m.VGroup:
    """An arrow from node a to node b, its label beside it (towards `side`) on a dark pad."""
    arrow = m.Arrow(a, b, buff=0.1, stroke_width=2, color="#999999", max_tip_length_to_length_ratio=0.12)
    label = m.Text(text, font=MONO, font_size=18, color=ACCENT)
    label.move_to(arrow.get_center() + 0.32 * side)
    pad = m.SurroundingRectangle(label, buff=0.06, stroke_width=0, fill_color="#000000", fill_opacity=1)
    return m.VGroup(arrow, pad, label)


class ReadmeStory(m.Scene):
    def construct(self) -> None:
        caption = m.Text("", font_size=CAPTION)

        def say(text: str) -> m.Animation:
            nonlocal caption
            new = m.Text(text, font_size=CAPTION, color=INK).to_edge(m.UP, buff=0.35)
            anim = m.ReplacementTransform(caption, new) if caption.text else m.FadeIn(new)
            caption = new
            return anim

        # 1. A class, in Turtle
        self.next_section("turtle")
        turtle = turtle_block()
        ttl = boxed(turtle).move_to(m.ORIGIN)
        self.play(say("A class in the knowledge graph, in Turtle"), m.FadeIn(ttl[0]))
        self.play(m.LaggedStart(*[m.FadeIn(l, shift=0.2 * m.RIGHT) for l in turtle], lag_ratio=0.35), run_time=2.5)
        self.wait(1.5)

        # 2. The same Turtle as nodes and edges
        self.next_section("graph")
        self.play(say("Every line is a fact: a node, an edge, a node"), ttl.animate.scale(0.9).to_edge(m.LEFT, buff=0.4))
        dune = node("ex:dune").move_to([3.6, 0.4, 0])
        book = node("ex:Book").move_to([3.6, 2.5, 0])
        title = node('"Dune"', LIT).move_to([1.4, -1.9, 0])
        author = node('"Frank Herbert"', LIT).move_to([5.3, -1.9, 0])
        year = node("1965", NUM).move_to([6.3, 0.4, 0])
        facts = [
            (1, book, "rdf:type", m.RIGHT),
            (2, title, "ex:title", m.LEFT + 0.3 * m.UP),
            (3, author, "ex:author", m.RIGHT + 0.3 * m.UP),
            (4, year, "ex:year", m.UP),
        ]
        edges: list[m.VGroup] = []
        self.play(m.TransformFromCopy(turtle[1][0:7], dune))
        for line, target, label, side in facts:
            e = edge(dune, target, label, side)
            edges.append(e)
            self.play(m.Indicate(turtle[line], color=ACCENT, scale_factor=1.05), m.GrowArrow(e[0]), m.FadeIn(e[1:]), m.FadeIn(target), run_time=0.9)
        self.wait(1.5)

        # 3. The class's rules become a TypeScript type
        self.next_section("types")
        graph = m.VGroup(dune, book, title, author, year, *edges)
        self.play(say("Its rules, as an OpenAPI schema, become a type: deno task generar"), m.FadeOut(graph))
        type_code = ts(TYPE_TS, "generado/api.ts")
        type_code.move_to([3.6, -0.3, 0])
        self.play(m.FadeIn(type_code.background), m.FadeIn(type_code[-1]))
        lines = type_code.code_lines
        from_turtle = {2: 6, 3: 5, 4: 7}  # the Turtle line each property line comes from
        self.play(m.LaggedStart(*[m.FadeIn(l) for i, l in enumerate(lines) if i not in from_turtle.values()], lag_ratio=0.2), run_time=1.5)
        for line, target in from_turtle.items():
            self.play(m.TransformFromCopy(turtle[line], lines[target]), run_time=0.7)
        self.wait(1.5)

        # 4. A module of the SDK uses that type
        self.next_section("module")
        self.play(say("One module per class, on that type (like jobs.ts)"), m.FadeOut(ttl))
        self.play(type_code.animate.scale(0.6).to_corner(m.UL, buff=0.4).shift(0.9 * m.DOWN))
        books = ts(BOOKS_TS, "books.ts").scale(0.85)
        books.move_to([1.5, -0.6, 0])
        self.play(m.FadeIn(books.background), m.FadeIn(books[-1]))
        self.play(m.LaggedStart(*[m.FadeIn(l, shift=0.1 * m.RIGHT) for l in books.code_lines], lag_ratio=0.12), run_time=3)
        link = m.Arrow(type_code.get_right(), books.code_lines[3].get_left(), buff=0.15, color=ACCENT, stroke_width=3)
        self.play(m.GrowArrow(link), m.Indicate(books.code_lines[3], color=ACCENT, scale_factor=1.02))
        self.wait(2)

        # 5. Import it and use it
        self.next_section("use")
        self.play(say("Import it, and the editor knows the graph"), m.FadeOut(books), m.FadeOut(link), m.FadeOut(type_code))
        use = ts(USE_TS, "main.ts").move_to([0, 1.2, 0])
        self.play(m.FadeIn(use.background), m.FadeIn(use[-1]))
        self.play(m.LaggedStart(*[m.FadeIn(l) for l in use.code_lines], lag_ratio=0.3), run_time=1.5)
        items = m.VGroup(*[
            m.Text(f"{name:<8}{kind}", font=MONO, font_size=18, color=INK)
            for name, kind in (("author", "string"), ("link", "string"), ("title", "string"), ("year", "number"))
        ]).arrange(m.DOWN, aligned_edge=m.LEFT, buff=0.1)
        popup = boxed(items, "#1e1e1e")
        popup.next_to(use.code_lines[-1], m.DOWN, buff=0.12, aligned_edge=m.LEFT).shift(1.4 * m.RIGHT)
        hint = m.Text("libros: Book[]", font=MONO, font_size=18, color=ACCENT).next_to(use.code_lines[-1], m.RIGHT, buff=0.4)
        self.play(m.FadeIn(popup, shift=0.1 * m.DOWN), m.FadeIn(hint))
        self.play(items[2].animate.set_color(ACCENT))
        self.wait(2)

        self.play(say("Book is a stand-in. This call runs today:"), m.FadeOut(popup), m.FadeOut(hint), m.FadeOut(use))
        real = ts(REAL_TS, "main.ts").move_to([0, -0.2, 0])
        self.play(m.FadeIn(real))
        self.wait(3)
