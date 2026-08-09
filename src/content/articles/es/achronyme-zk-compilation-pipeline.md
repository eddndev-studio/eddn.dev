---
title: "Del AST a Restricciones Aritméticas: El Pipeline ZK de Achronyme"
description: "Cómo Achronyme baja código fuente a SSA, lo optimiza y emite constraints R1CS o Plonkish."
pubDate: "2026-03-12"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "zero-knowledge", "achronyme", "cryptography"]
draft: false
translationKey: "achronyme-zk-pipeline"
abstract: "Un recorrido técnico por la ruta de circuitos de Achronyme: validación estática, lowering a SSA, optimización, layout del witness y los distintos modelos de costo de R1CS y Plonkish."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://zcash.github.io/halo2/concepts/arithmetization.html"
  - "https://learn.0xparc.org/materials/circom/additional-learning-resources/r1cs%20explainer/"
  - "https://eprint.iacr.org/2019/458.pdf"
---

Achronyme usa un solo parser para programas ordinarios y circuitos de prueba, y después envía el AST resultante por rutas de lowering diferentes. `ach run` necesita flujo de control dinámico, asignación de memoria y E/S. `ach circuit` debe producir un conjunto fijo de relaciones algebraicas.

Este artículo sigue la ruta de circuitos. Termina en constraints y generación de witness; la proving key y la ceremonia de Groth16 forman otra frontera de confianza que explico al final.

## Un AST, dos modelos de ejecución

El parser no decide si una suma pertenece a un programa host o a un circuito. Produce el mismo nodo de nivel fuente en ambos casos. El comando y el contexto que lo rodea eligen la siguiente etapa:

```text
source
  -> lexer y parser
  -> AST
       -> bytecode y runtime host
       -> validación y lowering de circuito
```

El runtime host puede asignar memoria, leer archivos cuando las capacidades lo permiten, llamar funciones nativas y elegir ramas en runtime. Un circuito no puede emitir una cantidad distinta de constraints después de leer un valor privado. Su forma debe conocerse antes del proving.

Por eso la ruta de circuitos aplica varias restricciones:

- Los loops necesitan límites que puedan resolverse antes de emitir constraints.
- Los efectos del host, como E/S de archivos o red, se rechazan dentro del código demostrable.
- El dispatch dinámico se resuelve en el compilador o se rechaza.
- Un condicional se convierte en una selección algebraica en lugar de omitir una rama.

Algunos bloques `prove {}` capturan valores estructurales del host. Achronyme los serializa como templates y resuelve esos valores antes de aplanar el circuito final. [El artículo sobre ProveIR](/es/articles/achronyme-prove-ir/) explica esa frontera en detalle.

## Lowering del flujo de control a SSA

El lowering de circuitos asigna un nombre nuevo a cada valor calculado. La mutación del código fuente se reescribe como versiones:

```ach
mut total = 0p0
total = total + a
total = total + b
assert_eq(total, expected)
```

La forma lowered es conceptualmente:

```text
total$v0 = Const(0)
total$v1 = Add(total$v0, a)
total$v2 = Add(total$v1, b)
AssertEq(total$v2, expected)
```

SSA tradicional usa phi nodes para combinar valores que vienen de predecesores distintos en el flujo de control. La IR aplanada del circuito usa en cambio una selección explícita. Para un booleano `cond` y valores de rama `left` y `right`, el resultado puede restringirse así:

$$
out = cond \cdot left + (1 - cond) \cdot right
$$

El compilador también debe restringir `cond` a un valor booleano, por ejemplo con $cond \cdot (cond - 1) = 0$. Las expresiones de ambas ramas existen en el circuito; `cond` elige el valor que continúa.

Esta representación hace explícitas las dependencias de datos y da a los pases de optimización una secuencia lineal de instrucciones que pueden inspeccionar.

## La optimización sigue el costo de constraints

Un compilador convencional suele optimizar instrucciones de CPU, tráfico de memoria o tamaño del binario. Un compilador de circuitos también considera la cantidad y el tipo de constraints que recibirá el prover.

Achronyme aplica pases como:

1. **Constant folding**, que evalúa expresiones con entradas conocidas.
2. **Propagación de booleanos y patrones de bits**, que registra valores ya restringidos a bits o enteros acotados.
3. **Inferencia de límites**, que reemplaza una comparación del ancho completo del campo por una comparación acotada cuando el programa demuestra un ancho menor.
4. **Common subexpression elimination**, que reutiliza cálculos idénticos.
5. **Dead code elimination**, conservando assertions y otras instrucciones que crean constraints.

El compilador también rastrea flujos desde entradas privadas para detectar valores sospechosos que nunca alcanzan una constraint. Ese análisis es una barrera de seguridad, no una prueba de que todo circuito sea sólido. Puede rechazar patrones conocidos de sub-restricción; no sustituye la revisión de la semántica del circuito.

## Emisión de R1CS

Groth16 suele consumir un Rank-1 Constraint System. Cada fila tiene la forma:

$$
(A \cdot w) \times (B \cdot w) = C \cdot w
$$

Aquí $w$ es el vector completo de asignaciones. Achronyme lo organiza con un slot constante igual a uno, seguido por inputs públicos y después valores privados del witness:

```text
w = [1, public_0, public_1, ..., private_0, private_1, ...]
```

El primer slot permite incluir constantes en una combinación lineal. Los valores públicos aparecen antes que los privados porque el verificador necesita un prefijo público estable al comprobar una prueba.

Para esta relación fuente:

```ach
pub x
witness y
assert_eq(x * y + 1, 42)
```

el compilador puede reorganizar la ecuación como $x \cdot y = 41$ y emitir una constraint de multiplicación:

```text
A = [0, 1, 0]   // x
B = [0, 0, 1]   // y
C = [41, 0, 0]  // 41 * ONE
```

Las combinaciones lineales grandes pueden compartir una fila sin agregar otra constraint de multiplicación. Decir que la suma es "gratis" resulta práctico, pero no es literalmente cierto: las matrices crecen y el prover todavía procesa sus coeficientes.

Las comparaciones y operaciones a nivel de bits cuestan más. Un campo primo no tiene un orden nativo, por lo que una comparación suele requerir range constraints y descomposición en bits. La inferencia de límites importa porque descomponer un valor de 8 bits es mucho menor que descomponer uno con todo el ancho del campo.

## Emisión Plonkish

Achronyme también puede bajar operaciones de circuito a un backend Plonkish. En lugar de tres matrices dispersas, un circuito Plonkish coloca valores del witness en filas y columnas y activa gates mediante polinomios selectores. Un gate aritmético común tiene esta forma:

$$
q_L a + q_R b + q_M ab + q_O c + q_C = 0
$$

Los selectores eligen si una fila realiza una suma, multiplicación u otra relación compatible. Los signos y layouts exactos de columnas son convenciones del backend.

Esto cambia el modelo de costo. Una combinación lineal R1CS puede mencionar muchos valores en una fila, mientras un gate Plonkish estrecho puede necesitar varias. Los sistemas Plonkish pueden recuperar eficiencia mediante copy constraints, gates personalizados y tablas de lookup cuando el backend los ofrece.

![Comparación del costo de constraints: R1CS y Plonkish](/images/articles/achronyme-zk/constraint-cost-comparison.png)

Un lookup puede demostrar que una tupla de entrada y salida pertenece a una tabla precalculada. Es útil para range checks y algunas operaciones de bits, pero no reemplaza automáticamente cualquier gadget costoso con una sola fila. Construir la tabla, ejecutar el argumento de lookup y soportarlo en el backend también tienen un costo.

## Campos y primitivas criptográficas

El lenguaje fuente hace explícito el campo primo seleccionado. BN254 es importante porque las pruebas Groth16 sobre esa curva interoperan con `snarkjs` y herramientas de verificación de Ethereum. También es el campo usado por el gate de proving de producción para Achronyme 0.1.0. Otros objetivos del compilador pueden usar otros campos compatibles; BN254 no es una propiedad universal de todo programa Achronyme.

Las bibliotecas de campo suelen usar representación de Montgomery internamente para hacer eficiente la multiplicación modular en CPUs ordinarias. Esa representación es un detalle de implementación debajo de la IR de circuitos. La responsabilidad del compilador es conservar la semántica del campo y vincular las constantes serializadas al primo elegido.

Poseidon está disponible porque su aritmética encaja mejor con circuitos de campo primo que SHA-256. Una S-box de Poseidon puede usar $x^5$, implementado con tres multiplicaciones:

1. $x^2 = x \cdot x$
2. $x^4 = x^2 \cdot x^2$
3. $x^5 = x^4 \cdot x$

El costo completo del hash depende de su ancho, constantes de ronda y backend. La comparación útil es estructural: Poseidon usa directamente sumas y multiplicaciones del campo, mientras SHA-256 requiere muchos gadgets booleanos y de bits al expresarse como circuito aritmético.

## Las constraints no son todo el sistema de prueba

Emitir R1CS y asignar un witness no produce por sí solo un setup de Groth16 seguro para producción. Las proving y verification keys deben estar vinculadas al circuito exacto. Un release también necesita una política sobre quién controla la entropía del setup, cómo se comprueban los artefactos y qué evidencia puede publicarse sin exponer material privado.

Achronyme 0.1.0 usó una contribución de fase 2 controlada externamente, un beacon de drand comprometido por adelantado y pruebas verificadas en ambas direcciones por Achronyme y `snarkjs`. [La historia del release](/es/blog/achronyme-0-1-0/) explica el proceso y el [dossier inmutable](https://github.com/achronyme/achronyme/blob/cd0601402e03bbdff4b4ac4cae88c0e672d53ac8/release-evidence/0.1.0/final/README.md) contiene los hashes y artefactos públicos de interoperabilidad.

El compilador puede hacer explícitos los efectos no permitidos, bajar el flujo de control de forma consistente y detectar algunas clases de datos sub-restringidos. El backend de pruebas y el setup establecen propiedades distintas. Mantener separadas esas responsabilidades permite decir qué se comprobó sin afirmar que un solo pase del compilador demuestra la correctitud de todo el sistema.
