---
title: "Akron, Artik, Lysis: Por Qué Achronyme Compone Tres Máquinas Virtuales en Lugar de Una"
description: "Cuando una sola VM de propósito general no alcanza: cómo Achronyme terminó con tres máquinas virtuales especializadas (una para scripting, una para generación de witness y una para emisión de constraints), cada una con su propia disciplina de memoria."
pubDate: "2026-05-03"
tags: ["architecture", "compilers", "vm", "achronyme", "memory"]
draft: false
translationKey: "achronyme-three-vms"
abstract: "Este artículo continúa el análisis arquitectónico de la VM de Achronyme publicado en marzo, esta vez explicando cómo y por qué el proyecto evolucionó de tener una única máquina virtual register-based a componer tres VMs especializadas: Akron (scripting + bloques prove con heap y GC tri-color), Artik (generación determinista de witness sin heap ni GC) y Lysis (bytecode SSA con disciplina single-static-store que la frontend de constraints recorre). Cada una nació de un invariante que la anterior no podía sostener, y la disciplina de memoria de cada una está exactamente alineada con la pregunta que la VM existe para responder. El artículo argumenta que la composición de máquinas pequeñas con invariantes precisos resulta en menos código y más garantías que una VM unificada que intenta absorber todos los casos."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
  - "https://en.wikipedia.org/wiki/Tracing_garbage_collection"
---

Hace dos meses publiqué un artículo sobre la arquitectura de la máquina virtual de Achronyme: la transición de pila a registros, las lecciones de Lua 5.0 y Dalvik, la localidad de caché. Ese artículo sigue siendo correcto, pero está incompleto: en algún punto entre marzo y mayo, Achronyme dejó de tener *una* máquina virtual y pasó a tener tres.

No fue una decisión que tomé sentado frente a una pizarra. Fue la consecuencia acumulada de chocar contra dos paredes que la VM original no podía atravesar (una con la generación de witness, otra con SHA-256), y darme cuenta de que la respuesta correcta no era hacer una VM más grande, sino componer varias VMs pequeñas, cada una con su propia disciplina de memoria.

Este artículo es la historia de **Akron**, **Artik** y **Lysis**: por qué cada una existe, qué problema resuelve, y por qué juntas son menos que la suma de sus partes en líneas de código pero más que la suma de sus partes en garantías estructurales.

## La trampa de la VM de propósito general

La forma natural de extender una VM cuando aparece un caso de uso nuevo es agregar opcodes, agregar tipos, agregar paths en el dispatch loop. La consecuencia no es solo más código; es más invariantes simultáneos que la misma máquina debe sostener al mismo tiempo. Una VM que tiene heap con GC y al mismo tiempo debe ser determinista en latencia para witness es una VM que rompe uno de los dos invariantes en cada decisión de diseño.

En algún punto del camino me di cuenta de que las tres responsabilidades centrales que Achronyme estaba pidiéndole a su única VM eran fundamentalmente incompatibles:

1. **Scripting y bloques `prove {}`**: necesita semántica dinámica completa: closures, alocación arbitraria, valores con vidas impredecibles. Eso pide *heap* con *garbage collection*.
2. **Generación de witness**: corre dentro del hot path de la prueba; tiene que ser determinista en tiempo y libre de pausas. Eso pide *sin heap*, *sin GC*.
3. **Emisión de constraints**: la frontend de circom genera SSA tan grande que un solo iter body de SHA-256 ya no cabe en un frame de registros. Eso pide *heap con disciplina explícita de spill*, no GC pero sí slots persistentes.

Cualquier VM única que intenta sostener los tres invariantes al mismo tiempo resuelve mal los tres. La salida fue separar.

## Akron: la VM de scripting

Akron es la VM original, la que describí en el artículo de marzo, ahora con nombre propio. Es register-based, tiene cuarenta y tantos opcodes, valores de 64 bits con tag de 4 bits en los bits altos, y un *garbage collector* mark-sweep tri-color sobre el heap. Ejecuta `.achb` (bytecode compilado del lenguaje completo), incluyendo los bloques `prove { ... }` que un usuario escribe en su código.

```text
// a = b + c en bytecode Akron (register-based)
ADD R0, R1, R2
```

¿Por qué Akron puede permitirse un GC? Porque su trabajo es *human-perceptible*: scripting de pruebas, transformaciones de datos, configuración. Una pausa de GC de pocos milisegundos cada tanto no rompe nada. El usuario no percibe esa latencia, y los valores que viven en su heap pueden tener vidas arbitrarias (closures que capturan variables, mapas que crecen en runtime, strings concatenados).

Akron sostiene el modelo mental de "lenguaje de programación normal con tipos dinámicos". Heap + GC es la respuesta correcta a esa pregunta.

## Artik: la VM determinista para witness

El primer límite apareció con la generación de witness. Cuando una prueba ZK se construye, la frontend de circom describe *qué* signals existen y *qué* constraints las relacionan, pero no calcula directamente sus valores. Eso es trabajo del *witness generator*, que ejecuta las funciones imperativas del usuario (declaraciones `function` en circom: `nbits`, `log2`, etc.) para producir los números concretos que después la prueba criptográfica firma.

Este código corre dentro del hot path de la prueba: cada vez que alguien genera una proof, el witness se recomputa. Tiene que ser rápido y, más importante, tiene que ser **determinista**. Una pausa de GC en medio de una computación de witness puede no romper la corrección (el resultado final es el mismo), pero rompe propiedades observacionales del sistema (timing channels, throughput predecible bajo carga, capacidad de ejecutar witness en entornos de memoria estricta).

Intenté primero levantar witness gen sobre Akron. Funcionaba, pero no podía garantizar las propiedades que necesitaba. Cualquier llamada que alocara strings o cerrara un `Vec` podía disparar una colección. La solución fue construir una VM separada cuya disciplina de memoria fuera estructuralmente incompatible con el problema:

**Artik** tiene aproximadamente veinticinco opcodes, ejecuta `.artik` bytecode liftado de los cuerpos de funciones de circom, usa registros estilo SSA, y, críticamente, **no tiene heap y no tiene GC**. Cada valor vive en un registro con vida computable estáticamente; el dispatch loop es un switch sobre opcodes que solo manipulan campos finitos y enteros pequeños. El R1CS backend la dispatcha vía un opcode dedicado (`WitnessOp::ArtikCall`).

```text
// Pseudocódigo de un cuerpo de función circom liftado a Artik
LOAD_PARAM    R0, 0       // primer parámetro
CONST_FIELD   R1, 1
ADD_FIELD     R2, R0, R1
RET           R2
```

La invariante que Artik sostiene es simple y verificable: la memoria que usa una llamada a Artik es exactamente la suma de los registros declarados por su bytecode, no más. Eso hace que Artik sea trivialmente compatible con witness generation, exactamente porque renunció a la flexibilidad que Akron necesita.

## Lysis: la VM de SSA que la frontend de constraints recorre

El segundo límite apareció con SHA-256.

La frontend de circom de Achronyme lleva los `template`s de circom a un IR SSA propio. Para circuitos chicos (Num2Bits, IsZero, EdDSA, MiMCSponge) ese IR cabe limpiamente en un esquema "frame de registros + emisor de constraints que recorre el IR linealmente". Para SHA-256 con 64 bytes de input, ese esquema se rompe: un solo cuerpo de iteración del round principal genera tantas operaciones SSA que el frame de registros previsto no las contiene, y el emisor de constraints (que yo había llamado *Walker*) empieza a fallar con frame overflow.

La salida obvia era hacer el frame más grande. Pero el problema no era el tamaño; era estructural. Lo que el Walker realmente necesitaba era un mecanismo explícito de *spill*: un heap donde poder guardar valores intermedios cuando un cuerpo de iteración excedía el frame, y reglas estrictas sobre cómo ese heap se usa para que el emisor pudiera caminar el bytecode sin tener que hacer análisis de aliasing.

**Lysis** es esa VM. Tiene treinta y tantos opcodes, un header con `heap_size_hint`, opcodes explícitos `StoreHeap` y `LoadHeap` para spill controlado, y un opcode `EmitWitnessCallHeap` para invocar Artik con argumentos resueltos desde el heap. Pero la decisión arquitectónica clave no es la presencia del heap; es el invariante que gobierna su uso:

> **Cada slot del heap se escribe exactamente una vez.**

Esa regla (*single-static-store*) es lo que hace que Lysis sea recorrible por el constraint emitter sin análisis de aliasing. Si cada slot se escribe una sola vez, el grafo de dependencias del bytecode es estático y construible en una sola pasada. No hay GC porque no hay liveness dinámica que rastrear; los slots viven hasta que el frame termina, y como cada uno se escribió una vez, el lector siempre puede recuperar el valor sin preocuparse de race conditions o sobreescrituras.

```text
// Pseudocódigo Lysis: spill de un valor SSA al heap
COMPUTE       %v3, %v1, %v2     // operación interna
STORE_HEAP    slot_42, %v3      // spill al heap (single-static-store)
...
LOAD_HEAP     %v77, slot_42     // recuperar más tarde
EMIT_R1CS     %v77, ...         // el emitter lee desde aquí
```

Lysis no es una VM "más" general que Artik; es una VM cuya disciplina (heap con escritura única) está alineada exactamente con la pregunta que el emisor de constraints necesita responder: *"¿cómo conecto las restricciones a través de las iteraciones desenrolladas de un loop grande?"*.

## La invariante que une a las tres

La elección de modelo de memoria de cada VM no es una decisión separada del propósito de la VM; es una *consecuencia* del propósito.

| VM     | Pregunta que responde                          | Memoria         | GC  |
|--------|------------------------------------------------|-----------------|-----|
| Akron  | "¿Qué quiere computar el usuario?"             | Heap            | Sí  |
| Artik  | "¿Cuál es el witness para esta proof?"         | Solo registros  | No  |
| Lysis  | "¿Cómo conecto estos constraints entre iters?" | Heap (1-store)  | No  |

Akron pregunta por flexibilidad y la responde con heap libre y GC tri-color. Artik pregunta por determinismo y lo responde renunciando al heap. Lysis pregunta por spillabilidad sin aliasing y lo responde con un heap restringido por construcción.

Lo que tres VMs me dieron, y una sola no, es la habilidad de razonar localmente. Cuando estoy escribiendo código en Akron, no tengo que preocuparme si una alocación rompe una invariante de witness: Artik no toca el heap de Akron. Cuando estoy debuggeando un emisor de constraints sobre Lysis, no tengo que considerar si un slot pudo haber sido sobreescrito: el invariante single-static-store lo prohíbe estructuralmente.

## Por qué tres, no dos ni cuatro

La pregunta natural es si esta separación es óptima o si refleja accidentes históricos. Mi respuesta honesta es: tres es lo que el problema pidió, y cualquier fusión rompe un invariante.

- **Akron + Artik**: forzaría witness gen a convivir con GC. Inviable por las razones de la sección de Artik.
- **Akron + Lysis**: forzaría el lenguaje de scripting a operar bajo single-static-store. Imposible para closures y mutación normal.
- **Artik + Lysis**: las dos comparten "no GC", pero Artik es no-heap y Lysis es heap-con-disciplina. Fusionar las dos significaría darle a Artik un heap que no necesita, o quitarle a Lysis un heap que sí necesita. Cualquiera de las dos direcciones empeora una de las dos.

La cuarta VM hipotética sería una para *optimization passes* sobre el IR; eventualmente quizás exista, si los passes acumulan suficiente complejidad para justificar su propio bytecode. Pero hoy los optimization passes corren como código Rust nativo sobre el grafo SSA, y no hay un invariante claro que pida una VM nueva. Tres es lo correcto para el problema actual; cuatro sería complejidad sin justificación.

## Conclusión

La tentación cuando un sistema empieza a romperse bajo carga es agregar features: un nuevo flag, un nuevo opcode, un caso especial. A veces eso es lo correcto. Pero a veces, lo que estás viendo no es un bug en una abstracción; es la abstracción intentando sostener dos invariantes incompatibles al mismo tiempo. La salida no es un parche; es reconocer que hay dos problemas pretendiendo ser uno, y separarlos.

En Achronyme la separación produjo tres máquinas virtuales pequeñas (cada una de las cuales podría borrarse y reconstruirse en un par de semanas si el problema cambiara) en lugar de una máquina grande que nadie podría tocar sin romper algo lejano. La disciplina de memoria de cada una es estricta porque la pregunta que cada una responde es estricta. La complejidad agregada del sistema completo no aumentó por componer tres VMs; *bajó*, porque cada VM puede analizarse aislada de las otras.

Si te llevás algo de este artículo, que sea esto: cuando una invariante se rompe, antes de agregar otro caso especial, preguntate si lo que tenés enfrente es realmente un solo sistema, o son dos sistemas que se vienen disfrazando de uno hace meses.
