// GENERADO por scripts/generar.ts desde contrato/openapi.json con openapi-typescript. No editar:
// para cambiarlo, `deno task contrato` (o editá el contrato en el servidor) y `deno task generar`.

export interface paths {
    "/ai/sparql": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Los mensajes de la AI del explorador a Gemma 4 (Google AI Studio); devuelve su texto
         * @description El body son los mensajes que arma el explorador (armarMensajes): el system, si está, va uno solo y primero, y la conversación empieza y termina con un mensaje de user. El servidor no arma el prompt ni valida la consulta.
         */
        post: operations["ai_sparql"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Los puestos como JobPost[]: cada uno con la forma de ontologia:JobPostShape, el schema JobPost del contrato.
         * @description GET /jobs. Filtra por tecnologia como consultas/jobs.rq (prefLabel o altLabel, sin mayúsculas) y por
         *     fuente contra el campo fuente del puesto (igual, sin mayúsculas: remotive, hn). El orden es el del
         *     .rq: lo más nuevo primero. Para traer puestos nuevos, POST /jobs (las dos fuentes).
         */
        get: operations["jobs_get"];
        put?: never;
        /**
         * Trae puestos con kiri-jobs, los pasa a triples, los valida con SHACL y guarda datos/jobs.trig.
         * @description Sin bandera de fuente trae las dos (--all). jobs.trig se reescribe entero: con el default de
         *     kiri-jobs (solo remotive), un POST /jobs sin argumentos se quedaría sin los puestos de HN. --hn o
         *     --remotive eligen una sola.
         */
        post: operations["jobs"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/con-mi-stack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Los puestos que piden alguna tecnología que ya sé, más coincidencias primero: JobConMiStack[].
         * @description GET /jobs/con-mi-stack. Cada uno es un JobPost con un campo más, coincidencias: cuántas tecnologías
         *     mías pide. El schema JobConMiStack extiende a JobPost (l:JobConMiStack, domain/lecturas-formas.ttl).
         *     El orden y la cuenta son los de consultas/jobs-con-mi-stack.rq, que /preguntar sigue sirviendo como filas.
         */
        get: operations["jobs_con_mi_stack"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/descartar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Descarta un puesto: no me interesa, y digo por qué.
         * @description La acción https://kiri231.com/jobs/Descartar (dash:ModifyAction): la declara domain/, la corre core/acciones.py.
         */
        post: operations["jobs_descartar"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/marcar-aplicado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marca que apliqué a un puesto. Uno descartado también se puede marcar.
         * @description La acción https://kiri231.com/jobs/MarcarAplicado (dash:ModifyAction): la declara domain/, la corre core/acciones.py.
         */
        post: operations["jobs_marcar_aplicado"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/preguntar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Corre consultas/<consulta>.rq y devuelve la respuesta en un formato (default: objetos, JSON).
         * @description Los filtros llenan los parámetros del .rq (?_x requerido, ?__x opcional, como en grlc):
         *     /preguntar/jobs?tecnologia=python en HTTP, `preguntar jobs tecnologia=python` en la CLI.
         */
        get: operations["preguntar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proyectos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Valida proyecto.ttl contra domain/proyecto-reglas.ttl. Responde {"conforma": bool, "reporte": str}.
         * @description POST /proyectos con el proyecto.ttl en el body (text/turtle), nunca una ruta, y con token. No conformar es un
         *     resultado: 200 igual. El motor y las reglas se quedan en el servidor: sale sólo el reporte.
         *
         *     Dos modos, una función cada uno: validar() y contra_el_codigo(). correr() solo elige.
         */
        post: operations["proyectos"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reportes/demanda": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cuántos puestos piden cada una de mis tecnologías, la más pedida primero: Demanda[].
         * @description GET /reportes/demanda. Un reporte: cada fila es una de consultas/demanda.rq, con la forma l:Demanda
         *     (domain/lecturas-formas.ttl): nombre y puestos.
         */
        get: operations["reporte_demanda"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reportes/dependencias": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Qué action usa cada repo, una fila por uso: Dependencia[].
         * @description GET /reportes/dependencias. Un reporte: cada fila es una de consultas/dependencias.rq (lee
         *     generado/repos.trig), con la forma l:Dependencia (domain/lecturas-formas.ttl): repo, accion, ref y
         *     archivo. Los filtros son los del .rq, opcionales, por substring y sin mayúsculas: "¿quién se rompe si
         *     cambio pm-actividad?" es ?accion=pm-actividad.
         */
        get: operations["reporte_dependencias"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/vocabularios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Valida vocabulary.ttl contra domain/vocabulario-reglas.ttl. Responde {"conforma": bool, "reporte": str}.
         * @description POST /vocabularios con el vocabulary.ttl en el body (text/turtle), nunca una ruta, y con el mismo token que
         *     POST /proyectos. No conformar es un resultado: 200 igual. El motor y las reglas se quedan en el servidor: sale sólo
         *     el reporte.
         */
        post: operations["vocabularios"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            error: string;
        };
        Demanda: {
            /** @description La tecnología: su prefLabel. */
            nombre: string;
            /** @description En cuántos puestos aparece. */
            puestos: number;
        };
        Dependencia: {
            /** @description La action como va en uses:, sin la ref: owner/repo[/ruta]. */
            accion: string;
            /** @description El workflow donde está el uses:. */
            archivo: string;
            /** @description La versión que pide: rama, tag o SHA; default (por el puente del checkout) o local. */
            ref: string;
            /** @description El doap:name del repo que declara el uso. */
            repo: string;
        };
        JobConMiStack: components["schemas"]["JobPost"] & {
            /** @description Cuántas tecnologías mías pide el puesto (?n de consultas/jobs-con-mi-stack.rq). */
            coincidencias: number;
        };
        JobPost: {
            /**
             * Format: uri
             * @description La URI del nodo: su identificador.
             */
            link: string;
            /**
             * Format: date-time
             * @description Cuándo apliqué (POST /jobs/marcar-aplicado).
             */
            aplicadoEl?: string;
            /**
             * Format: date-time
             * @description Cuándo lo descarté (POST /jobs/descartar).
             */
            descartadoEl?: string;
            empresa?: string;
            /**
             * Format: date-time
             * @description Cuándo lo trajo kiri-jobs (no cuándo se publicó).
             */
            fecha: string;
            /** @description De dónde salió el puesto: remotive, hn… */
            fuente: string;
            pide: components["schemas"]["Technology"][];
            /** @description Por qué lo descarté. */
            porque?: string;
            titulo: string;
        };
        Technology: {
            /**
             * Format: uri
             * @description La URI del nodo: su identificador.
             */
            link: string;
            nombre: string;
            sinonimos: string[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    ai_sparql: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    mensajes: {
                        /** @enum {unknown} */
                        role: "system" | "user" | "assistant";
                        content: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description el texto del modelo, tal cual: la consulta la extrae y la valida el cliente */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        texto: string;
                    };
                };
            };
            /** @description el body no es {mensajes} con la forma de armarMensajes */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no llegó entero a tiempo */
            408: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta Content-Length (el body no puede ir chunked) */
            411: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body pasa el tope de la vista */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no viene como application/json */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description más de 5 pedidos por minuto desde la misma IP (una IPv6 cuenta por su /64), o más de 10 por minuto a Google entre todos (ver Retry-After) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Google AI Studio no contestó en 30 s, contestó un error o no devolvió texto, después de los reintentos (Retry-After si es un 5xx de Google, el timeout o un error de conexión); o el servidor está sin key de Google AI Studio (falla cerrado, sin Retry-After) */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    jobs_get: {
        parameters: {
            query?: {
                /** @description prefLabel o altLabel, sin mayúsculas: python, ts, node */
                tecnologia?: string;
                /** @description de qué fuente, igual que el campo fuente: remotive o hn */
                fuente?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobPost"][];
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description datos/jobs.trig es de una forma vieja: POST /jobs lo rehace; o un .trig de datos/ no se puede leer */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    jobs: {
        parameters: {
            query?: {
                /** @description args para kiri-jobs (default --all, las dos fuentes): --hn, --remotive, react… (separados por espacios) */
                kiri_jobs?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    jobs_con_mi_stack: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobConMiStack"][];
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description datos/jobs.trig es de una forma vieja: POST /jobs lo rehace; o un .trig de datos/ no se puede leer */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    jobs_descartar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uri
                     * @description El link del JobPost sobre el que corre.
                     */
                    link: string;
                    /** @description Por qué lo descarto, en mis palabras. */
                    porque: string;
                };
            };
        };
        responses: {
            /** @description el JobPost como queda después de descartar */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobPost"];
                };
            };
            /** @description no se pudo: falta un parámetro o no es del tipo, el objeto no existe, o no cumple la precondición (el error trae sus sh:message) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta el token o no es el correcto */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no llegó entero a tiempo */
            408: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta Content-Length (el body no puede ir chunked) */
            411: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body pasa el tope de la vista */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no viene como application/json */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el servidor no tiene token configurado (falla cerrado), o un .trig de datos/ no se puede leer */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    jobs_marcar_aplicado: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uri
                     * @description El link del JobPost sobre el que corre.
                     */
                    link: string;
                };
            };
        };
        responses: {
            /** @description el JobPost como queda después de marcarAplicado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobPost"];
                };
            };
            /** @description no se pudo: falta un parámetro o no es del tipo, el objeto no existe, o no cumple la precondición (el error trae sus sh:message) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta el token o no es el correcto */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no llegó entero a tiempo */
            408: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta Content-Length (el body no puede ir chunked) */
            411: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body pasa el tope de la vista */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no viene como application/json */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el servidor no tiene token configurado (falla cerrado), o un .trig de datos/ no se puede leer */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    preguntar: {
        parameters: {
            query: {
                /** @description nombre de un .rq de consultas/ */
                consulta: string;
                /** @description objetos, tsv, json, csv, xml, txt; turtle o json-ld para grafos */
                formato?: string;
                /** @description parámetros del .rq como nombre=valor: tecnologia=python */
                filtros?: {
                    [key: string]: string;
                };
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    proyectos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description proyecto.ttl a validar (CLI sin archivos: los de las raíces o proyectos/) */
        requestBody: {
            content: {
                "text/turtle": string;
            };
        };
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description true si todos los proyecto.ttl pasan las reglas */
                        conforma: boolean;
                        /** @description el reporte de SHACL, con los errores de carga primero */
                        reporte: string;
                    };
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta el token o no es el correcto */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no llegó entero a tiempo */
            408: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta Content-Length (el body no puede ir chunked) */
            411: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body pasa el tope de la vista */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no viene como text/turtle */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el servidor no tiene token configurado: falla cerrado */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    reporte_demanda: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Demanda"][];
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    reporte_dependencias: {
        parameters: {
            query?: {
                /** @description parte de la action, sin mayúsculas: pm-actividad, checkout */
                accion?: string;
                /** @description parte del nombre del repo, sin mayúsculas: portfolio */
                repo?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Dependencia"][];
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    vocabularios: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description vocabulary.ttl a validar (CLI sin archivos: los de las raíces) */
        requestBody: {
            content: {
                "text/turtle": string;
            };
        };
        responses: {
            /** @description la respuesta del comando */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description true si todos los vocabulary.ttl pasan las reglas */
                        conforma: boolean;
                        /** @description el reporte de SHACL, con los regex rotos y los vocabularios repetidos primero */
                        reporte: string;
                    };
                };
            };
            /** @description el comando no pudo hacer su trabajo (parámetros, datos) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta el token o no es el correcto */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no llegó entero a tiempo */
            408: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description falta Content-Length (el body no puede ir chunked) */
            411: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body pasa el tope de la vista */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el body no viene como text/turtle */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description el servidor no tiene token configurado: falla cerrado */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
}
