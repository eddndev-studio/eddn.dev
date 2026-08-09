---
title: "Achronyme: de un Hola Mundo de 500 KB a circuitos criptográficos"
description: "El error de memoria que me obligó a acotar el propósito de Achronyme y rediseñar su runtime."
pubDate: "2026-01-24"
updatedDate: "2026-08-09"
tags: ["achronyme", "rust", "engineering-mistakes", "cryptography", "optimization"]
translationKey: "achronyme-rebirth"
---

Achronyme comenzó como un experimento para pipelines de procesamiento digital de señales. Pronto amplié el alcance para incluir un lenguaje de propósito general, un motor gráfico, UI y soporte asíncrono. El proyecto no tenía una restricción central que guiara su arquitectura.

## La medición de 500 KB

En una compilación temprana, un programa Hola Mundo retenía alrededor de 500 KB de memoria. Un programa de escritorio podía absorber esa cantidad, pero la medición mostraba la poca disciplina del runtime. Casi todos los valores eran objetos en el heap, `Arc<T>` aparecía por todo el modelo de datos y las estructuras estilo JavaScript eran la opción predeterminada incluso cuando bastaba un valor compacto.

El runtime pagaba el costo de seguir punteros, actualizar contadores de referencias y perder localidad de caché antes de hacer trabajo útil. Pausé el proyecto porque agregar más funciones sobre ese modelo solo haría más difícil reemplazarlo.

## Un problema más acotado

Reinicié Achronyme alrededor de programas criptográficos y circuitos de prueba. Ese alcance dio restricciones útiles al runtime: los elementos de campo debían ser valores de primera clase, el comportamiento de memoria debía poder inspeccionarse y la ejecución de circuitos tenía que mantenerse separada del comportamiento dinámico del host.

El rediseño comenzó con tres decisiones:

1. **Arenas tipadas para objetos administrados.** Los objetos con vidas similares podían alojarse juntos en lugar de cargar contadores de referencias atómicos en todas partes.
2. **Valores etiquetados compactos.** NaN boxing permitía guardar los valores comunes en 64 bits sin asignar memoria en el heap.
3. **Enteros grandes y elementos de campo nativos.** La aritmética criptográfica podía usar representaciones propias en lugar de pasar por tipos de punto flotante.

Esas decisiones solo iniciaron el rediseño. Más adelante la VM se dividió en motores de ejecución especializados, el pipeline de proving obtuvo representaciones intermedias propias y los requisitos del release se volvieron mucho más estrictos de lo que imaginaba en enero.

El viejo Hola Mundo expuso un problema de representación: yo había elegido estructuras de datos sin medir su costo ni definir para qué existía el runtime. Cuando el propósito se volvió concreto, los tradeoffs también se pudieron probar.

Actualización de agosto de 2026: [Achronyme 0.1.0 ya está disponible](/es/blog/achronyme-0-1-0/). La nota del release cuenta el trabajo de arquitectura y proving que siguió a este primer rediseño.
