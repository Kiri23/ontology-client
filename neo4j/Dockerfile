# syntax=docker/dockerfile:1.6
# La imagen de la vista: Neo4j community con neosemantics (n10s), las dos versiones fijadas.
#
# n10s 2025.06.1 se compila contra Neo4j 2025.06.2 (<neo4j.version> de su pom.xml en el tag
# 2025.06.1 de github.com/neo4j-labs/neosemantics): un plugin de otra versión de Neo4j no carga.
# El jar va con su sha256, no por NEO4J_PLUGINS=["n10s"]: eso elige la versión en runtime. ADD --checksum
# pide el frontend dockerfile 1.6: de ahí la primera línea.
FROM neo4j:2025.06.2-community@sha256:0347fe5b1126dd328cc68a54449c2cf83636e348e2da1547abf62b2dbfad67f2

ADD --checksum=sha256:4c461087e08405c7cb472ecfefc043e9e8ed93628ed74988e4fda1f1bac54b3e \
    https://github.com/neo4j-labs/neosemantics/releases/download/2025.06.1/neosemantics-2025.06.1.jar \
    /var/lib/neo4j/plugins/neosemantics-2025.06.1.jar
