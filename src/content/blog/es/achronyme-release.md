---
title: "La beta de Achronyme anterior a 0.1.0"
description: "Una mirada fechada al lenguaje y al flujo de proving que precedieron al release estable de Achronyme."
pubDate: "2026-03-14"
updatedDate: "2026-08-08"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

Este artículo describía Achronyme cuando todavía estaba en `v0.1.0-beta.19`. Lo conservo como registro de esa etapa, pero corregí dos afirmaciones que no sobrevivieron al release estable: el setup estaba automatizado, no libre de confianza, y la beta todavía era un prototipo en varios aspectos importantes.

Para leer sobre el release completo, ve a [Achronyme 0.1.0: por fin, estable](/es/blog/achronyme-0-1-0/).

## Lo que podía hacer la beta

Achronyme usaba una sola sintaxis para ejecución de propósito general y circuitos aritméticos. Un bloque `prove(...)` capturaba valores del scope exterior, compilaba su cuerpo como circuito, generaba un witness y devolvía una prueba al programa en ejecución.

```ach
let secret = 0p12345
let blinding = 0p98765
let commitment = poseidon(secret, blinding)

let p = prove(commitment: Public) {
    assert_eq(poseidon(secret, blinding), commitment)
}

print(proof_json(p))
assert(verify_proof(p))
```

El mismo lenguaje fuente tenía dos rutas de ejecución:

- `ach run` ejecutaba código dinámico con closures, recursión, arrays, maps, strings y memoria administrada.
- `ach circuit` bajaba el código compatible a restricciones R1CS o Plonkish. Los loops necesitaban límites estáticos, las ramas se convertían en selecciones y las funciones se insertaban dentro del circuito.

El bloque `prove` conectaba ambas rutas. El código del host preparaba valores; el código de circuito expresaba qué restringía la prueba.

## Lo que la automatización eliminaba y lo que no

La beta incluía backends nativos de Groth16 y Plonkish, así que el proving cotidiano no requería un proceso separado de Node.js. También podía exportar archivos `.r1cs` y `.wtns` para interoperar con `snarkjs`.

Esa comodidad no eliminaba el trusted setup de Groth16. Durante el desarrollo la herramienta podía crear claves locales automáticamente, pero un release de producción todavía necesitaba una ceremonia ligada al circuito, entropía controlada externamente, verificación de artefactos y una política clara de retención. La versión estable 0.1.0 agregó ese gate y publicó su evidencia.

## Lo útil de esa vista previa

En marzo el proyecto ya tenía una IR de circuitos basada en SSA, diagnósticos del compilador, módulos, una extensión para VS Code y campos primos seleccionables. Esas partes eran reales, pero no hacían que todo el sistema estuviera listo para un release. Todavía faltaba resolver semántica de concurrencia, capacidades, conformidad entre backends, gates reproducibles y la política de proving confiable.

La entrada original presentaba 0.1.0 como el siguiente hito cercano. Tomó casi cinco meses más. El retraso está documentado en la nota estable en lugar de ocultarlo reescribiendo esta fecha.

Código y descargas: [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme/releases/tag/v0.1.0).
