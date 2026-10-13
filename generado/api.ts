// GENERADO por scripts/generar.ts desde contrato/openapi.json con openapi-typescript. No editar:
// para cambiarlo, `deno task contrato` (o editá el contrato en el servidor) y `deno task generar`.

export interface paths {
    "/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Los puestos como JobPost[]: cada uno con la forma de j:JobPostShape, el schema JobPost del contrato.
         * @description GET /jobs. Filtra por tecnologia como consultas/jobs.rq (prefLabel o altLabel, sin mayúsculas) y por
         *     fuente contra el campo fuente del puesto (igual, sin mayúsculas: remotive, hn). El orden es el del
         *     .rq: lo más nuevo primero. Para traer puestos nuevos, POST /jobs?kiri_jobs=--all.
         */
        get: operations["jobs_get"];
        put?: never;
        /** Trae puestos con kiri-jobs, los pasa a triples, los valida con SHACL y guarda datos/jobs.trig. */
        post: operations["jobs"];
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
         * Valida fichas proyecto.ttl contra domain/proyecto-reglas.ttl. Responde {"conforma": bool, "reporte": str}.
         * @description POST /proyectos con la ficha en el body (text/turtle), nunca una ruta, y con token. No conformar es un
         *     resultado: 200 igual. El motor y las reglas se quedan en el servidor: sale sólo el reporte.
         */
        post: operations["proyectos"];
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
        JobPost: {
            /**
             * Format: uri
             * @description La URI del nodo: su identificador.
             */
            link: string;
            empresa?: string;
            /**
             * Format: date-time
             * @description Cuándo lo trajo kiri-jobs (no cuándo se publicó).
             */
            fecha: string;
            /** @description De dónde salió el puesto: remotive, hn… */
            fuente: string;
            pide: components["schemas"]["Technology"][];
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
            /** @description datos/jobs.trig es de una forma vieja: POST /jobs?kiri_jobs=--all lo rehace */
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
                /** @description args para kiri-jobs: --all, --hn, react… (separados por espacios) */
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
        /** @description fichas proyecto.ttl a validar (CLI sin archivos: proyectos/*\/proyecto.ttl) */
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
                        /** @description true si todas las fichas pasan las reglas */
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
}
