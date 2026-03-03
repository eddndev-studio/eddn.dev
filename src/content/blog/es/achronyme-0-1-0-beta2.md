---
title: "Achronyme 0.1.0-beta2: La primera versión usable y el ecosistema de herramientas"
description: "Celebramos el lanzamiento de la beta 0.1.0-beta2 de Achronyme, marcando un hito con funciones de primera clase, estructuras dinámicas y soporte oficial para editores."
pubDate: "2026-03-03"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

Hoy me emociona anunciar el lanzamiento de **Achronyme 0.1.0-beta2**. Este no es solo un lanzamiento más; representa un hito fundamental en el desarrollo del lenguaje. Hemos pasado de un motor experimental a la primera versión verdaderamente utilizable para escribir circuitos Zero-Knowledge y lógica de propósito general, todo respaldado por un naciente ecosistema de herramientas.

## Un Lenguaje Completo

En las fases anteriores, Achronyme era capaz de compilar matemáticas básicas, pero carecía de la ergonomía que esperamos de un lenguaje moderno. Con esta beta, hemos introducido características clave que transforman la experiencia de desarrollo:

- **Funciones de Primera Clase y Closures:** Ahora puedes definir funciones de usuario, pasarlas como argumentos y aprovechar la captura léxica de variables (*Upvalues*) con estado mutable compartido. Incluso soportamos recursividad completa y funciones anidadas.
- **Estructuras de Datos Dinámicas:** Hemos añadido soporte nativo para **Listas** (`[1, 2, 3]`) y **Mapas** (`{"clave": "valor"}`), permitiendo una manipulación de datos mucho más rica dentro de la máquina virtual.
- **Flujo de Control Avanzado:** Integración de bucles `while`, iteradores `for x in list`, y expresiones `if`/`else` que devuelven valores, junto con saltos estructurados (`break`, `continue`).

Estas adiciones hacen que escribir scripts complejos y preparar testigos (witnesses) para tus circuitos ZK sea una experiencia fluida y familiar.

## El Ecosistema de Editores

Un lenguaje no está completo sin las herramientas adecuadas. Escribir código en el bloc de notas está bien para un prototipo, pero para un proyecto serio necesitas asistencia.

Es por eso que junto con esta versión, introducimos el primer soporte de herramientas para editores del ecosistema. Hemos desarrollado un **Language Server Protocol (LSP)** (`ach-lsp`) y una extensión oficial para **VS Code** (ubicada en nuestro repositorio `achronyme-editor`).

Ahora, al escribir código Achronyme, obtienes:
- Resaltado de sintaxis preciso.
- Detección de errores en tiempo real.
- Una mejor experiencia de depuración gracias a nuestra nueva "Debug Symbol Table", que mapea nombres de variables en binarios `.achb` para reportes de error detallados ("Happy Path" O(1)).

## Motor ZK y Rendimiento

Bajo el capó, el motor criptográfico sigue madurando. Hemos solidificado nuestro pipeline SSA IR (Intermediate Representation) con múltiples pases de optimización (Constant folding, Dead code elimination, Boolean propagation).

Además, el rendimiento de nuestra VM personalizada escrita en Rust es excepcional. En pruebas de bucles calientes (hot loops), Achronyme VM es aproximadamente un **50% más rápido que Python 3**, procesando 10 millones de iteraciones en ~0.41 segundos. Todo esto manteniendo la seguridad de memoria mediante estrategias como "Stack Pinning" y un recolector de basura Mark-and-Sweep rigurosamente probado con nuestro modo `--stress-gc`.

## ¿Qué sigue?

La beta 0.1.0-beta2 es un punto de inflexión. Tenemos un lenguaje expresivo, herramientas de desarrollo integradas y un pipeline de pruebas robusto con más de 970 pruebas unitarias y 90 de integración.

El siguiente paso es refinar los backends de pruebas (R1CS/Groth16 y Plonkish/KZG-PlonK) y expandir la biblioteca estándar. Te invito a descargar esta versión, probar la extensión de VS Code y empezar a escribir tus propios circuitos Zero-Knowledge.

¡El futuro de Achronyme está aquí y es más rápido, seguro y utilizable que nunca!
