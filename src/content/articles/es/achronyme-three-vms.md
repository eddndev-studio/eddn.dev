---
title: "Akron, Artik, Lysis: Por Qué Achronyme Usa Tres Máquinas Virtuales"
description: "Cómo scripting, generación de witness y emisión de constraints llevaron a Achronyme a tres modelos de memoria distintos."
pubDate: "2026-05-03"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "vm", "achronyme", "memory"]
draft: false
translationKey: "achronyme-three-vms"
abstract: "Achronyme separa scripting dinámico, generación de witness y emisión de constraints entre Akron, Artik y Lysis. Cada VM usa el modelo de memoria que requiere su trabajo en lugar de compartir un solo runtime de propósito general."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
  - "https://en.wikipedia.org/wiki/Tracing_garbage_collection"
---

Mi primer artículo sobre la VM de Achronyme explicaba el cambio de bytecode basado en stack a registros. En mayo de 2026, hablar de "la VM" ya era inexacto. El proyecto tenía tres motores de ejecución: **Akron**, **Artik** y **Lysis**.

No surgieron de un plan para maximizar la cantidad de máquinas virtuales. La generación de witness y los programas grandes de constraints imponían reglas de memoria incompatibles con el runtime dinámico del lenguaje. Separar las máquinas hizo explícitas esas reglas.

## Tres trabajos, tres modelos de memoria

Achronyme necesitaba ejecutar tres clases de trabajo:

1. **Programas de usuario y bloques `prove {}`.** Closures, strings, maps y valores con vidas dinámicas requieren un heap administrado.
2. **Funciones de witness.** Este código corre dentro del proving. Su asignación de memoria debe estar acotada y poder predecirse a partir del programa compilado.
3. **Emisión de constraints.** Los programas SSA grandes y desenrollados necesitan almacenar intermedios fuera del frame, pero el emisor no debería requerir análisis general de aliasing ni garbage collection.

Agregar todos los requisitos al mismo loop de dispatch habría acoplado invariantes que no tenían relación. Una función de heap para scripting podría afectar la ejecución del witness; una restricción para hacer predecible el witness podría volver incómodo el código ordinario del lenguaje.

## Akron: el runtime del lenguaje

Akron es la VM de registros que ejecuta programas `.achb`. Soporta las partes dinámicas del lenguaje y ejecuta el lado host de los bloques `prove {}`. Sus valores pueden sobrevivir a una sola expresión, así que tiene heap y un garbage collector por trazado.

```text
// a = b + c en bytecode de Akron
ADD R0, R1, R2
```

La recolección de basura encaja aquí porque el compilador de bytecode no siempre puede determinar estáticamente las vidas de closures, maps, arrays y strings. Una pausa es el tradeoff que Akron acepta a cambio de esa flexibilidad.

## Artik: ejecución acotada del witness

El frontend de Circom necesita evaluar funciones auxiliares imperativas mientras construye el witness. Primero intenté ejecutarlas mediante Akron. Eso reutilizaba más código, pero también permitía asignaciones en el heap y colecciones dentro de la ruta de proving.

Artik es una máquina de registros más pequeña para esas funciones. Opera sobre elementos de campo y enteros pequeños, y no tiene heap general ni garbage collector:

```text
LOAD_PARAM    R0, 0
CONST_FIELD   R1, 1
ADD_FIELD     R2, R0, R1
RET           R2
```

La cantidad de registros declarada en el bytecode acota el almacenamiento requerido por una llamada de Artik. Eso elimina el comportamiento del allocator y del collector de esta parte de la generación de witness. No vuelve constante en tiempo a todo el prover ni debe presentarse como una defensa completa contra canales temporales. Le da al runtime una propiedad más limitada que puede comprobarse desde el programa.

## Lysis: almacenamiento auxiliar con una escritura por slot

El siguiente límite apareció al bajar templates grandes de Circom como SHA-256. Una ronda desenrollada podía crear más intermedios SSA de los que cabían en el frame original. Aumentar el frame solo posponía el overflow sin expresar cuánto tiempo seguían siendo válidos los valores almacenados fuera de él.

Lysis ofrece instrucciones explícitas de spill:

```text
COMPUTE       %v3, %v1, %v2
STORE_HEAP    slot_42, %v3
...
LOAD_HEAP     %v77, slot_42
EMIT_R1CS     %v77, ...
```

Su heap sigue una regla central:

> Cada slot del heap se escribe exactamente una vez.

Con single-static-store, el emisor de constraints puede construir dependencias en una sola pasada. Una lectura posterior nunca observa un valor sobrescrito y los slots permanecen válidos hasta el final del frame. Lysis obtiene almacenamiento auxiliar sin adoptar el modelo de objetos ni el garbage collector de Akron.

Lysis también puede resolver desde su heap los argumentos usados al invocar código de witness en Artik. Las dos máquinas cooperan, pero conservan reglas de memoria distintas.

## La frontera entre ellas

| VM | Responsabilidad | Almacenamiento | GC |
|---|---|---|---|
| Akron | Programas dinámicos de Achronyme | Registros y heap administrado | Sí |
| Artik | Funciones auxiliares de witness | Registros | No |
| Lysis | Recorrido del programa de constraints | Registros y slots de una sola escritura | No |

La separación reduce los casos que cada motor debe manejar. Una asignación de Akron no puede disparar una colección dentro de Artik. Un slot de Lysis no puede sobrescribirse porque el validador de bytecode rechaza un segundo store. Cada problema puede investigarse dentro de la máquina que posee la invariante correspondiente.

## Por qué no las fusioné

Las parejas posibles comparten detalles de implementación, pero no el mismo contrato:

- Fusionar Akron y Artik volvería a introducir memoria administrada en la ejecución de auxiliares de witness o eliminaría funciones necesarias para el runtime del lenguaje.
- Fusionar Akron y Lysis obligaría a representar valores dinámicos mediante almacenamiento de una sola escritura.
- Fusionar Artik y Lysis daría a Artik un heap que no necesita o quitaría a Lysis el almacenamiento que le permite procesar programas grandes y desenrollados.

Tres no es una ley permanente. Si cambia el compilador, también pueden cambiar estas fronteras. Es simplemente la división más pequeña que encontré para que cada ruta de ejecución pudiera declarar sus reglas de memoria sin excepciones creadas por las otras dos.

El código está en el [repositorio de Achronyme](https://github.com/achronyme/achronyme). La prueba útil del diseño es si cada VM puede seguir aplicando su invariante en la frontera del bytecode. Si eso deja de ser cierto, conviene revisar la separación en lugar de defenderla por razones históricas.
