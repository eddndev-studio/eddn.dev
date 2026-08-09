---
title: "Achronyme 0.1.0: por fin, estable"
description: "El release estable de Achronyme, la ceremonia que lo retrasó y la evidencia que necesitaba antes de publicarlo."
pubDate: "2026-08-08"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-stable"
---

Hoy publiqué [Achronyme 0.1.0](https://github.com/achronyme/achronyme/releases/tag/v0.1.0). El tag apunta al commit exacto `fd07b38e16256e2ed6a8f2b438d340a681c9b0ac`.

Primero tengo que decir algo sencillo: perdón por el tiempo que pasó y por el silencio. En marzo escribí sobre una beta como si la versión estable estuviera a la vuelta de la esquina. No lo estaba. Subestimé el trabajo que faltaba y después comuniqué muy poco mientras lo resolvía.

No quiero justificar el retraso con una lista de tareas. Sí quiero explicar por qué me negué a cambiar el número de versión hasta tener evidencia que pudiera revisar otra persona.

## Qué cambió desde la beta

Desde el experimento de lenguaje que describí al inicio del año, Achronyme incorporó concurrencia estructurada, tareas con alcance léxico, canales, E/S con propiedad explícita, límites de recursos y manifiestos de capacidades. El compilador propaga efectos entre llamadas para mantener clara la frontera entre lo que puede ejecutarse en el host y lo que puede formar parte de una prueba.

Ese comportamiento se cubre en el intérprete, LLVM JIT, AOT y WebAssembly. El sistema de módulos, el LSP, los diagnósticos y la compilación de circuitos forman parte del mismo release, no de demos separadas que solo coinciden en la página principal.

También publiqué [Achronyme Editor 0.3.0](https://github.com/achronyme/achronyme-editor/releases/tag/v0.3.0), con paquetes para Linux, macOS y Windows que entienden las características del lenguaje incluidas en 0.1.0.

## La parte que no cabía en una prueba unitaria

Groth16 necesita una configuración confiable ligada al circuito. Automatizar los comandos no elimina esa confianza. Por eso el gate del release exigía una contribución de fase 2 controlada fuera de mi entorno, un beacon público posterior y verificación cruzada con `snarkjs`.

El circuito de aceptación terminó con 1,501,364 restricciones y 5,201,533 variables. La `zkey` final pesa 2,213,426,379 bytes. Mover y verificar archivos de ese tamaño hizo visible cada supuesto incorrecto sobre memoria, almacenamiento y tiempo de ejecución.

Preparé un kit para Windows Home que no requería WSL, Docker, Rust, Git ni datos privados del circuito. Una persona de mi familia controló su computadora y su entropía durante la contribución. Yo recibí la `zkey` resultante y un recibo mínimo, y no acepté el archivo solo porque había regresado con el tamaño esperado.

La aceptación requirió reconstruir exactamente el R1CS y el witness, comprobar sus hashes, verificar el transcript de Powers of Tau, ejecutar `snarkjs zkey verify` y revisar la metadata de la contribución. Una de las verificaciones terminó con Signal 9 y hubo que replantear el uso de memoria antes de continuar.

Después fijé por adelantado una ronda de drand, esperé su publicación y usé ese valor como beacon final. El resultado quedó ligado al circuito, al binario y al source del release.

El nombre del contribuyente y los hashes dan trazabilidad. No convierten el control independiente en una propiedad criptográficamente demostrable. Lo que sí puedo afirmar es que no controlé su computadora ni su entropía y que el procedimiento conserva evidencia verificable de cada artefacto que entró en el resultado.

## Dos implementaciones tuvieron que estar de acuerdo

El gate final ejecutó 13 etapas medidas. `snarkjs` generó una prueba que verificaron tanto `snarkjs` como Achronyme. Luego Achronyme generó otra prueba desde el almacén confiable, sin hacer un setup local, y ambas implementaciones volvieron a verificarla. El R1CS regenerado por Achronyme fue idéntico byte por byte al usado en la ceremonia.

Los hashes, manifiestos, tiempos, consumos máximos de memoria, claves públicas y pruebas sin witness están en el [dossier inmutable de ceremonia e interoperabilidad](https://github.com/achronyme/achronyme/blob/cd0601402e03bbdff4b4ac4cae88c0e672d53ac8/release-evidence/0.1.0/final/README.md). El release incluye además `achronyme-0.1.0-proving-evidence.tar.gz` y su checksum.

No publiqué entropía, toxic waste, inputs privados, witness, Powers of Tau ni la proving key. Esos bytes no son evidencia pública y no deben convertirse en contenido de un repositorio.

## También fallaron cosas menos elegantes

El proceso no se atascó solo en criptografía. Un contrato de CI asumía que `rg` estaba instalado. Una prueba del límite de solicitudes dependía demasiado del momento exacto en que arrancaba un job. Un smoke test de AOT para un paquete instalado no declaraba las capacidades `file.read` y `file.write` que el runtime ya exigía.

Cada fallo parecía pequeño al aislarlo. Juntos mostraron que el release todavía dependía de mi máquina, de una carrera de scheduler o de permisos implícitos. Los corregí porque una versión estable debe sobrevivir fuera del entorno donde fue escrita.

Para las etapas pesadas usé cómputo desechable en Google Cloud. Al terminar, copié y volví a comprobar el almacén privado necesario, borré la VM de finalización y su disco con auto-delete, y verifiqué que ambos recursos ya no existieran. La infraestructura temporal no quedó corriendo después del release.

## Qué se publicó

La página de [Achronyme 0.1.0](https://github.com/achronyme/achronyme/releases/tag/v0.1.0) contiene binarios para Linux `x86_64` y `aarch64`, macOS Intel y Apple Silicon, y Windows `x86_64`. Los bundles de Linux tienen archivos SHA-256 y GitHub registra un digest para cada asset. La evidencia de proving se descarga por separado para que cualquiera pueda revisar el vínculo entre source, circuito, ceremonia y pruebas.

No estoy llamando terminado al lenguaje. Estoy llamando estable a un punto concreto del código y dejando claro cómo comprobarlo. Esa diferencia explica buena parte de estos meses.

Gracias a quienes siguieron preguntando por Achronyme cuando yo todavía no podía dar una fecha seria. Gracias también a la persona que hizo la contribución externa y cedió horas de su computadora para un proceso bastante poco emocionante de ver.

Ahora sí: Achronyme 0.1.0 está publicado. Esta vez la frase viene con tag, hashes, binarios y evidencia.
