---
title: "Anatomía de una Máquina Virtual: De Stack a Registros en Achronyme"
description: "Por qué Achronyme pasó de bytecode basado en stack a una VM de registros y qué cambió con ese tradeoff."
pubDate: "2026-03-07"
updatedDate: "2026-08-09"
tags: ["architecture", "compilers", "vm", "achronyme"]
draft: false
translationKey: "achronyme-vm-architecture"
abstract: "Una comparación entre bytecode de stack y de registros a partir de la primera reescritura de la VM de Achronyme. El diseño de registros agrandó cada instrucción, pero redujo los dispatches en las cargas medidas en ese momento."
technicalDepth: "Advanced"
references:
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://source.android.com/docs/core/runtime/dalvik-bytecode"
---

Achronyme comenzó con un intérprete que recorría el árbol de sintaxis. Evaluar el AST directamente era útil mientras el lenguaje cambiaba todos los días, pero se volvió costoso cuando los mismos nodos empezaron a ejecutarse dentro de loops. La primera implementación de bytecode usó un stack de operandos. La siguiente usó registros virtuales.

Este artículo registra por qué hice ese segundo cambio. Describe la VM como existía en marzo de 2026; después Achronyme dividió la ejecución entre [tres máquinas especializadas](/es/articles/achronyme-three-vms/).

## Qué significa "máquina virtual" aquí

Aquí, máquina virtual significa una VM de proceso que ejecuta bytecode de Achronyme mediante un loop de dispatch:

1. Lee la instrucción indicada por el instruction pointer.
2. Decodifica el opcode y sus operandos.
3. La ejecuta y avanza o reemplaza el instruction pointer.

El formato del bytecode determina dónde lee y escribe valores cada instrucción. Esa elección afecta la densidad del código, la complejidad del compilador y la cantidad de trabajo de dispatch que realiza el intérprete.

![Arquitectura de VM Stack vs Registros](/images/articles/achronyme-vm/architecture-comparison.svg)

## Bytecode basado en stack

Una Stack VM mantiene los operandos en una pila last-in, first-out. Instrucciones como `ADD` no nombran sus entradas porque se asumen los dos valores superiores del stack.

Para `a = b + c`, un compilador sencillo podría emitir:

```text
0001: LOAD_LOCAL 1  // coloca b en el stack
0002: LOAD_LOCAL 2  // coloca c en el stack
0003: ADD           // retira b y c, luego coloca el resultado
0004: STORE_LOCAL 0 // guarda el resultado en a
```

La codificación puede ser compacta. El costo es la secuencia de instrucciones de carga y almacenamiento necesaria para mover valores entre las variables locales y el stack de operandos. En los programas aritméticos de Achronyme, esas instrucciones aumentaban las vueltas por el loop de dispatch sin hacer aritmética por sí mismas.

Las Stack VMs siguen siendo sencillas de generar, fáciles de validar y con frecuencia compactas. Su tradeoff no encajaba con las cargas que yo estaba midiendo.

## Bytecode basado en registros

Una VM de registros asigna a cada función un frame con registros virtuales. Las instrucciones nombran explícitamente sus fuentes y destino:

```text
// Formato: OPCODE destino, fuente1, fuente2
0001: ADD R0, R1, R2
```

Una instrucción realiza ahora el movimiento de datos que la versión de stack expresaba con cuatro. A cambio, la instrucción es más ancha porque debe codificar tres índices de registro.

Lua 5.0 es el precedente más claro para este diseño. Dalvik también usó un formato orientado a registros, aunque sus restricciones y runtime eran distintos de los de Achronyme. Esos sistemas orientaron el layout del bytecode; las mediciones específicas de Achronyme todavía debían establecer el resultado de rendimiento.

## Qué cambió en Achronyme

En los programas que comparé durante la reescritura, el compilador de registros emitió cerca de la mitad de instrucciones despachadas que el compilador de stack. Ese es un resultado sobre conteo de instrucciones, no una afirmación de que todo programa se volvió dos veces más rápido. Un bytecode más ancho aumenta el tamaño del código, y el tiempo total también depende de ramas, asignaciones, llamadas nativas, caché y el trabajo de cada opcode.

Los registros también hicieron más claro el flujo de datos dentro del compilador. El productor y los consumidores de cada valor quedaron explícitos en la secuencia de instrucciones, lo que ayudó al trabajo posterior sobre lowering estilo SSA y rutas de ejecución especializadas.

Originalmente atribuí parte de la mejora a la localidad de caché. El frame de registros es contiguo y evita mover constantemente el stack de operandos, pero no publiqué mediciones con contadores de hardware para esa versión. El resultado defendible es la reducción de instrucciones despachadas; una afirmación precisa sobre caché necesitaría otra medición.

## El tradeoff

La migración cambió bytecode compacto por menos dispatches y un flujo de datos más explícito. Esa elección encajó con los programas aritméticos de Achronyme y facilitó el trabajo posterior del compilador. No sería necesariamente la elección correcta para cualquier intérprete.

Lo importante fue medir la secuencia real de instrucciones. El diseño de stack parecía eficiente al comparar el ancho de los opcodes. Se veía distinto al contar las cargas y stores adicionales que requería un programa real.
