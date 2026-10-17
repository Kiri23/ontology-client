<!-- Generated from docs/vocabulary.ttl by `deno task vocabulario`. Do not edit by hand: edit the TTL and run the task. -->

# Vocabulary

The terms this project uses, one page each. The source is [`docs/vocabulary.ttl`](../vocabulary.ttl), a SKOS vocabulary.

- [Knowledge graph](knowledge-graph.md): A collection of facts stored as a graph: things are nodes and the named relationships between them are edges. Because every fact connects to others, you can follow and query those connections instead of looking up isolated records.
- [Ontology](ontology.md): A formal description of the kinds of things in a domain and the ways they can relate, such as which classes exist and which properties connect them. It gives data a shared meaning that both people and software can rely on.
- [OpenAPI contract](openapi-contract.md): A machine-readable description of an HTTP API in the OpenAPI Specification format, listing its endpoints, parameters, request bodies, and responses. Clients and servers can be checked against it, and tools can generate code and documentation from it.
- [RDF](rdf.md): The Resource Description Framework, a W3C data model that states every fact as a triple of subject, predicate, and object. Things and relationships are named with IRIs, so data from different sources can be merged into one graph.
- [SHACL shape](shacl-shape.md): A set of conditions that the targeted nodes of an RDF graph must meet, such as which properties are required, which values they may take, and how many times they may appear. Shapes are written in RDF with SHACL, the W3C Shapes Constraint Language, and a validator reports every node that breaks them.
- [SPARQL](sparql.md): The W3C query language for RDF. A query describes a pattern of triples with variables, and the engine returns every part of the graph that matches it.
- [Turtle](turtle.md): A compact, human-readable text syntax for writing RDF. It lets you declare short prefixes for long IRIs and group the triples that share a subject.
