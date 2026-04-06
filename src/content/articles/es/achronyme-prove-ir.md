---
title: "ProveIR: Compila Una Vez, Prueba Muchas — Dentro del Sistema de Templates de Circuitos de Achronyme"
description: "Cómo Achronyme pre-compila bloques prove en templates de circuitos paramétricos que se serializan en bytecode y se instancian en runtime con valores capturados."
pubDate: "2026-04-06"
tags: ["architecture", "compilers", "zero-knowledge", "achronyme", "cryptography"]
draft: false
translationKey: "achronyme-prove-ir"
abstract: "Este artículo explora ProveIR, la representación intermedia que impulsa los bloques prove de Achronyme. ProveIR es un sistema de templates de circuitos paramétricos: los bloques prove se compilan una vez en tiempo de compilación, se serializan en el constant pool del bytecode, y se instancian en runtime con valores capturados del scope circundante. El artículo deconstruye el pipeline completo — desde AST hasta template ProveIR, clasificación de capturas, serialización, instanciación a IR SSA, optimización, y finalmente generación de constraints R1CS o Plonkish — explicando por qué esta capa intermedia es esencial para la correctitud, el rendimiento y la portabilidad entre campos primos."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://docs.achrony.me"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
---

Cada vez que un bloque `prove {}` se ejecuta en Achronyme, se genera una prueba criptográfica. El circuito se compila, se asigna un witness, y sale una prueba Groth16 o PlonK. Si has trabajado con toolchains de ZK, sabes que ese proceso es costoso — parsear, bajar a constraints y ejecutar el prover puede tomar segundos fácilmente.

Ahora imagina un programa que ejecuta el mismo bloque prove en un loop, diez veces, con distintos inputs. Sin un diseño cuidadoso, estarías parseando y compilando el circuito diez veces, solo para producir exactamente el mismo sistema de constraints cada vez (solo con distintos valores de witness). Es un desperdicio.

ProveIR existe para resolver esto. Es la representación intermedia que le permite a Achronyme **compilar un bloque prove una sola vez** en tiempo de compilación, **serializarlo en el bytecode**, e **instanciarlo muchas veces** en runtime con distintos valores capturados. Piénsalo como un closure para circuitos: la estructura es fija, pero los datos son paramétricos.

## El Problema: La Compilación en Runtime es Costosa

En versiones tempranas de Achronyme, los bloques prove se compilaban en runtime. Cuando la VM encontraba un bloque `prove {}`, hacía lo siguiente:

1. Re-parsear el AST del bloque
2. Bajarlo a IR desde cero
3. Clasificar variables como públicas/witness
4. Compilar a constraints R1CS
5. Generar la prueba

Los pasos 1-3 eran idénticos cada vez que el mismo bloque prove se ejecutaba. El AST no cambia. La estructura del circuito no cambia. Solo los valores de las variables capturadas difieren entre invocaciones.

Esto también significaba que los errores de compilación de circuitos — cosas como usar `print()` dentro de un bloque prove, o referenciar una variable indefinida — eran errores de runtime. Escribías tu programa, lo ejecutabas, esperabas a que la ejecución llegara al bloque prove, y *entonces* descubrías que tu circuito estaba mal formado.

ProveIR mueve todo ese trabajo al tiempo de compilación.

## La Idea Central: Templates de Circuitos Paramétricos

Un template de ProveIR es un circuito pre-compilado con huecos. Los huecos son **capturas** — variables del scope circundante que el circuito referencia pero no define. En tiempo de compilación, la estructura del circuito es fija: qué variables son públicas, cuáles son witnesses, qué operaciones se realizan, cómo están estructurados los loops. En runtime, las capturas se llenan con valores concretos, los loops se desenrollan, y el template se convierte en un programa IR plano listo para compilarse a constraints.

Así se ve en la práctica:

```ach
let secret = 0p42
let expected_hash = poseidon(secret, 0p0)

prove(expected_hash: Public) {
    assert_eq(poseidon(secret, 0p0), expected_hash)
}
```

En tiempo de compilación, el compilador ve que el bloque prove:
- Declara `expected_hash` como input público
- Referencia `secret` del scope externo (una captura)
- Contiene un hash Poseidon y una constraint de igualdad

Toda esta estructura se compila en un template ProveIR y se serializa en el bytecode. El template no sabe qué valor tiene `secret` — solo sabe que en runtime, algo llamado `secret` será proporcionado, y debe tratarse como un witness input.

En runtime, la VM encuentra el opcode `Prove`, busca el template serializado en el constant pool, lo deserializa, inserta `secret = 42`, y le pasa el programa instanciado al prover.

## El Pipeline: Ocho Fases

El ciclo de vida completo de un bloque prove pasa por ocho fases. Las fases A a C ocurren en secuencia entre compile time y runtime. Las fases D a H son el pipeline estándar de pruebas ZK.

### Fase A: AST a Template ProveIR (Compile Time)

Aquí es donde ocurre el trabajo pesado. El `ProveIrCompiler` toma el AST de un bloque prove y el outer scope, y produce un template ProveIR.

**Desugaring de variables mutables.** Los circuitos son puros — no hay estado mutable. Pero Achronyme te permite escribir variables `mut` dentro de bloques prove por legibilidad. ProveIR las convierte a forma SSA:

```ach
prove(result: Public) {
    mut sum = 0p0
    sum = sum + a
    sum = sum + b
    assert_eq(sum, result)
}
```

Se convierte internamente en:

```
let sum$v0 = Const(0)
let sum$v1 = Add(sum$v0, Capture("a"))
let sum$v2 = Add(sum$v1, Capture("b"))
AssertEq(sum$v2, Input("result"))
```

Cada mutación crea una nueva variable SSA. Esta transformación es imposible sin una representación intermedia — necesitas rastrear el flujo de datos de cada variable a través de las asignaciones, lo cual requiere análisis que la evaluación cruda de AST no puede proporcionar.

**Inlining de funciones.** Las funciones definidas por el usuario referenciadas dentro del bloque prove se inlinean en cada call site. Los circuitos ZK no pueden tener dispatch dinámico — cada operación debe ser estáticamente conocida. ProveIR genera nombres de variables únicos por sitio de inline para evitar colisiones.

**Validación.** El compilador rechaza construcciones que no pueden existir en un circuito: `print()`, `break`, `return`, operaciones con strings, acceso a maps. Estos errores se detectan en compile time, no en runtime.

**Detección de capturas.** Cualquier variable referenciada dentro del bloque prove pero definida fuera de él se marca como captura. El compilador registra el nombre y, para arrays, el tamaño.

**Preservación de loops.** De forma crítica, los loops `for` *no* se desenrollan en la Fase A. Los bounds de los loops pueden depender de valores capturados que no se conocen hasta runtime. El template preserva la estructura del loop y difiere el desenrollado a la Fase B.

La salida es un struct `ProveIR`:

```
ProveIR {
    public_inputs:  [ProveInputDecl],   // visibles para el verificador
    witness_inputs: [ProveInputDecl],   // solo el prover
    captures:       [CaptureDef],       // huecos a llenar en runtime
    body:           [CircuitNode],      // el template del circuito
    capture_arrays: [CaptureArrayDef],  // info de reconstrucción de arrays
}
```

### Fase B: Instanciación (Runtime)

Cuando la VM encuentra el opcode `Prove`, deserializa el template y proporciona un mapa de valores de captura. El instanciador:

1. **Resuelve capturas** a valores concretos según su clasificación (más sobre esto abajo).
2. **Desenrolla loops.** Ahora que los bounds son concretos (`for i in 0..n` donde `n = 8`), los loops se convierten en secuencias planas de instrucciones.
3. **Expande arrays.** Las capturas de arrays como `path = [a, b, c]` se convierten en elementos individuales `path_0`, `path_1`, `path_2`.
4. **Aplana el árbol.** El árbol jerárquico de `CircuitNode`/`CircuitExpr` se convierte en una secuencia lineal de instrucciones SSA.

La salida es un `IrProgram` — una lista plana de 24 tipos de instrucción posibles en forma SSA, donde cada instrucción produce exactamente un resultado nombrado.

### Fase C: Optimización (Runtime)

Seis pases de optimización se ejecutan sobre el IR plano:

1. **Constant folding** — pre-computa expresiones donde ambos operandos son constantes.
2. **Boolean propagation** — detecta variables restringidas a {0, 1} via patrones `v * (v - 1) = 0`, habilitando operaciones booleanas más eficientes.
3. **Bit pattern detection** — reconoce patrones de descomposición Num2Bits (`suma de bits_i * 2^i = valor`) e infiere bounds de bitwidth sobre el valor original.
4. **Bound inference** — usa los bitwidths inferidos para reemplazar comparaciones no acotadas costosas (`IsLt`, que requiere descomposición de 252 bits) con versiones acotadas (`IsLtBounded`, que necesita solo N bits). Aquí es donde ocurren las reducciones dramáticas de constraints — un circuito `LessThan(8)` bajó de 518 a 11 constraints.
5. **Common subexpression elimination** — deduplica computaciones idénticas.
6. **Dead code elimination** — elimina instrucciones cuyos resultados nunca se usan (preservando nodos que generan constraints como `AssertEq`).

Reducción típica: 20-40% menos instrucciones.

### Fases D-H: Constraints, Witness, Prueba, Verificación

El IR optimizado se compila a R1CS (para Groth16) o gates Plonkish (para halo2-KZG). Los valores del witness se asignan, el prover se ejecuta, y una prueba se retorna a la VM como un valor de primera clase.

## Clasificación de Capturas: La Decisión de Diseño Clave

No todas las variables capturadas sirven el mismo propósito en un circuito. Considera:

```ach
let n = 8
let secret = 0p42

prove(hash: Public) {
    for i in 0..n {
        // ... n iteraciones
    }
    assert_eq(poseidon(secret, 0p0), hash)
}
```

Aquí, `n` determina la *estructura* del circuito (cuántas veces se desenrolla el loop), mientras que `secret` determina los *valores* que fluyen por las constraints. ProveIR clasifica cada captura en una de tres categorías:

| Clasificación | Rol | Qué pasa en la instanciación |
|---|---|---|
| `StructureOnly` | Bounds de loops, tamaños de arrays, exponentes | Se inlinea como constante. No genera witness. |
| `CircuitInput` | Usado dentro de constraints | Se convierte en witness input del circuito. |
| `Both` | Estructural Y en constraints | Witness input + `AssertEq` vinculando al valor constante. |

El caso `Both` es sutil. Si una variable se usa como bound de un loop *y* dentro de una constraint, el circuito necesita tanto desenrollar el loop (estructural) como probar algo sobre el valor (constraint). ProveIR maneja esto creando un witness input e inmediatamente restringiéndolo a ser igual a la constante conocida — asegurando que el prover no pueda mentir sobre el parámetro estructural.

Esta clasificación ocurre automáticamente en la Fase A al recorrer el cuerpo del circuito y analizar dónde aparece cada captura.

## Serialización: Circuitos como Bytes

Los templates de ProveIR se serializan en un formato binario compacto (v5):

```
[4 bytes: "ACHP"] [1 byte: version=5] [1 byte: prime_id] [payload bincode]
```

El header mágico `ACHP` (Achronyme Circuit — Prove) previene la deserialización accidental de datos incorrectos. El prime ID identifica a qué campo pertenecen las constantes (BN254, BLS12-381 o Goldilocks).

Una decisión de diseño crítica: las constantes se almacenan como `FieldConst([u8; 32])` — 32 bytes en forma canónica little-endian, independientes de cualquier tipo de campo específico. Esto hace a ProveIR **field-erased**: el mismo template serializado podría teóricamente instanciarse sobre distintos campos primos (con reinterpretación apropiada de constantes). En la práctica, el byte de prime ID asegura type safety.

El compilador de bytecode almacena los bytes serializados en el constant pool y emite:

```
BuildMap  R[map], R[captures_start], capture_count
Prove     R[map], K[prove_ir_index]
```

Donde `R[map]` contiene un mapa de nombres de capturas a sus valores en runtime, y `K[prove_ir_index]` apunta a los bytes serializados de ProveIR en el constant pool.

La definición completa del circuito viaja dentro del binario `.achb`. Sin archivos externos, sin definiciones de circuito separadas, sin ceremonia.

## Ejemplo End-to-End

Tracemos una prueba de compromiso Poseidon a través de todo el pipeline.

**Código fuente:**

```ach
let secret = 0p1
let blinding = 0p2
let h = 0p7853200120776062878684798364095072458815029376092732009249414926327459813530

prove(h: Public) {
    assert_eq(poseidon(secret, blinding), h)
}
```

**Salida de Fase A** (template ProveIR):

```
ProveIR {
    public_inputs: [{ name: "h" }],
    witness_inputs: [],
    captures: [
        { name: "secret",   usage: CircuitInput },
        { name: "blinding", usage: CircuitInput },
    ],
    body: [
        AssertEq {
            lhs: PoseidonHash(Capture("secret"), Capture("blinding")),
            rhs: Input("h"),
        }
    ]
}
```

**Serializado:** ~200 bytes, almacenado en `K[3]` en el constant pool.

**Fase B** (instanciación con `{ secret: 1, blinding: 2 }`):

```
%0 = Input("secret", Witness)      // secret = 1
%1 = Input("blinding", Witness)    // blinding = 2
%2 = Input("h", Public)            // proporcionado por el verificador
%3 = PoseidonHash(%0, %1)          // poseidon(1, 2)
%4 = AssertEq(%3, %2)              // constraint: hash == h
```

**Fase C** (optimización): Sin reducciones — el circuito ya es mínimo. 5 instrucciones, ~400 constraints R1CS (dominados por los internos de la permutación Poseidon).

**Fases D-H:** Compilación a R1CS, asignación de witness, generación de prueba Groth16. La prueba se retorna a la VM como un `Value::Proof`.

## ¿Por Qué No Compilar Directo a R1CS?

Podrías preguntarte: ¿por qué no saltarse ProveIR por completo e ir directo del AST a constraints?

**Eficiencia.** Sin un template intermedio, cada ejecución de un bloque prove re-parsea y re-baja el mismo circuito. Con ProveIR, la compilación ocurre una sola vez. El template pesa ~200 bytes; re-parsear el AST y re-ejecutar el compilador tomaría órdenes de magnitud más.

**Reporte de errores.** ProveIR atrapa errores de circuito en compile time. Usar `print()` dentro de un bloque prove, referenciar una variable indefinida, o escribir una construcción no soportada — todos estos son errores de compilación, no sorpresas en runtime.

**Conversión SSA.** Las variables mutables requieren análisis de flujo de datos para convertirse a forma SSA. Necesitas rastrear qué versión de una variable está activa en cada punto. Este es un problema de compilador que la evaluación cruda de AST no puede resolver — necesitas un IR para hacerlo correctamente.

**Portabilidad.** ProveIR usa `FieldConst([u8; 32])`, no `FieldElement<F>`. El template serializado es field-erased. El mismo bytecode puede apuntar a BN254, BLS12-381, o cualquier otra curva soportada — el tipo de campo se resuelve en el momento de instanciación basado en el byte de prime ID del header.

**Embeddability.** El circuito es parte del programa. Un archivo `.achb` es autocontenido: bytecode, constantes y templates de circuito en un solo artefacto. Sin archivos `.circom` separados, sin binarios WASM, sin dependencias externas.

## El Set de Instrucciones

La forma instanciada de ProveIR (el IR plano) usa 24 instrucciones SSA, diseñadas específicamente para constraints ZK:

**Aritmética core:** `Add`, `Sub`, `Mul`, `Div`, `Neg`, `Pow`

**Constraints:** `AssertEq` (la constraint fundamental de R1CS), `Assert` (verdad booleana)

**Comparaciones:** `IsEq`, `IsNeq`, `IsLt`, `IsLe`, `IsLtBounded`, `IsLeBounded` — las variantes bounded usan bitwidths inferidos para dramáticamente menos constraints

**Lógica:** `And`, `Or`, `Not`, `Mux` (selección condicional sin branching)

**Builtins criptográficos:** `PoseidonHash`, `RangeCheck`, `Decompose` (descomposición en bits)

**Aritmética entera:** `IntDiv`, `IntMod` (con max_bits para generación de constraints)

**Datos:** `Const`, `Input`

Cada instrucción produce exactamente una variable resultado (propiedad SSA). La única excepción es `Decompose`, que produce tanto un resultado como un array de variables de bits.

## Reflexiones Finales

ProveIR es, en esencia, una apuesta por la separación de responsabilidades. Al insertar una capa de templates entre el lenguaje fuente y el sistema de constraints, Achronyme gana validación en compile time, eficiencia en runtime, portabilidad entre campos, y la capacidad de tratar circuitos como artefactos de primera clase embebidos en el bytecode del programa.

El diseño fue impulsado por una observación práctica: la estructura de un circuito casi nunca cambia entre invocaciones — solo los datos cambian. ProveIR explota esa invariante para compilar una vez y probar muchas veces, convirtiendo lo que sería trabajo repetido en una sola serialización y muchas instanciaciones baratas.

El código fuente de ProveIR vive en `ir/src/prove_ir/` (tipos, compilador, instanciador, clasificador de capturas) y `compiler/src/control_flow/zk.rs` (integración con bytecode). El codebase completo está en [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme).
