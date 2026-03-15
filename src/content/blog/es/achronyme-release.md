---
title: "Achronyme: Un Lenguaje para Pruebas Zero-Knowledge"
description: "Presentamos Achronyme — escribe codigo legible, genera pruebas criptograficas. Un lenguaje, dos modos de ejecucion, cero ceremonia."
pubDate: "2026-03-14"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

Si alguna vez escribiste un circuito ZK, conoces el dolor. Escribes constraints en un DSL, generas witnesses en JavaScript, descargas un archivo Powers of Tau, ejecutas un trusted setup, invocas snarkjs tres veces por separado, y rezas para que todo cuadre. Siete pasos, tres herramientas, dos lenguajes — solo para probar que conoces un numero.

Construi Achronyme para simplificar esto.

## Que es Achronyme?

Achronyme es un lenguaje de programacion donde la misma sintaxis puede ejecutarse como programa de proposito general o compilarse a restricciones aritmeticas para pruebas zero-knowledge.

Asi se ve probar un compromiso Poseidon:

```ach
let secret = 0p12345
let blinding = 0p98765

let p = prove {
    witness secret
    witness blinding
    public commitment
    assert_eq(poseidon(secret, blinding), commitment)
}

print(proof_json(p))    // Prueba Groth16, verificable on-chain
assert(verify_proof(p)) // verificada
```

Seis lineas. Un archivo. El bloque `prove {}` compila un circuito, captura variables del scope, genera un witness, y retorna una prueba criptografica — todo inline. Sin ceremonia.

Compara con el equivalente en Circom: escribir un template, compilar a WASM, generar witness con JavaScript, descargar ptau, ejecutar trusted setup, probar, verificar. Siete pasos con tres herramientas distintas.

La razon por la que esto funciona es que Achronyme no separa "el lenguaje en el que piensas" del "lenguaje que entiende el prover." El mismo codigo fuente cumple ambos roles.

## Doble Ejecucion

Esto es posible gracias a la doble ejecucion — el mismo codigo, dos destinos:

**Modo VM** (`ach run`) te da un lenguaje de programacion real — closures, recursion, GC mark-sweep, arrays, maps, strings, 43 funciones nativas. Escribe algoritmos, manipula datos, prepara inputs.

**Modo Circuito** (`ach circuit`) compila la misma sintaxis a restricciones R1CS o Plonkish sobre BN254. Los loops se desenrollan estaticamente, `if/else` se convierte en `mux`, las funciones se inlinean en cada call site. La salida es un sistema de restricciones plano listo para generar pruebas.

El bloque `prove {}` conecta ambos: se ejecuta dentro de la VM pero compila su cuerpo como circuito.

## Provers Nativos

Achronyme incluye backends nativos de Groth16 (ark-groth16) y PlonK (halo2-KZG) compilados directamente en el binario. Sin Node.js, sin snarkjs, sin dependencias externas. Las pruebas se generan en proceso.

```bash
# Groth16 (por defecto)
ach run my_proof.ach

# PlonK
ach run my_proof.ach --prove-backend plonkish

# Compilar circuito + generar verificador Solidity
ach circuit vote.ach --inputs "..." --solidity Verifier.sol
```

Los archivos `.r1cs` y `.wtns` de salida tambien son compatibles con snarkjs, asi que puedes usar herramientas externas si lo prefieres.

## Que Incluye

Esto no es un prototipo. La version actual (v0.1.0-beta.7) es el resultado de meses de trabajo en correctitud, experiencia de desarrollo y herramientas:

- **1,300+ tests unitarios y 150+ tests de integracion** — cada feature se prueba en ambos modos de ejecucion, cada commit pasa por CI
- **SSA IR con 4 pases de optimizacion** — taint analysis detecta variables sub-restringidas antes de que pierdas 20 minutos en una prueba fallida; boolean propagation elimina constraints redundantes automaticamente
- **Diagnosticos estilo rustc** — cuando algo falla, obtienes snippets de codigo, sugerencias "did you mean?" y codigos de warning — no un indice de constraint crudo
- **Sistema de modulos** — `import`/`export` con deteccion de dependencias circulares, para que los circuitos puedan compartir codigo sin copiar y pegar
- **Extension VS Code** — syntax highlighting y deteccion de errores en tiempo real via LSP, porque escribir constraints a ciegas es como se crean los bugs
- **Script de instalacion** — un solo comando, sin necesidad de toolchain de Rust

## Empieza

```bash
curl -fsSL https://achrony.me/install.sh | sh
```

Esto instala el binario `ach` en `~/.local/bin`. Luego:

```bash
ach --version          # verificar
ach run script.ach     # ejecutar un programa
ach circuit circ.ach   # compilar un circuito
ach disassemble f.ach  # inspeccionar bytecode o IR
```

El codigo fuente esta en [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme). Docs en [docs.achrony.me](https://docs.achrony.me). Extension VS Code en [achronyme-editor](https://github.com/achronyme/achronyme-editor).

## Que Sigue

El roadmap hacia 1.0:

- **0.1.0** — primer release estable (stdlib, imports pulidos)
- **0.2.0** — LSP completions, go-to-definition, hover docs
- **0.3.0** — playground en el navegador (compilador + VM en WASM)
- **1.0.0** — API estable, soporte multi-curva

Si escribes circuitos ZK y estas cansado de la ceremonia, intenta portar uno de tus circuitos existentes a Achronyme y ve como se siente. Si algo se rompe o no tiene sentido, [abre un issue](https://github.com/achronyme/achronyme/issues) — ese es el feedback mas util en esta etapa.
