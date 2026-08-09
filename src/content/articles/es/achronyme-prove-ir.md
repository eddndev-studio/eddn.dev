---
title: "ProveIR: Compila Una Vez, Instancia Cada Prueba"
description: "Cómo Achronyme guarda templates de circuito en el bytecode y resuelve valores capturados antes del proving."
pubDate: "2026-04-06"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "zero-knowledge", "achronyme", "cryptography"]
draft: false
translationKey: "achronyme-prove-ir"
abstract: "ProveIR compila un bloque prove como template de circuito paramétrico, lo guarda en el constant pool del bytecode y lo instancia con valores capturados en runtime. Este artículo sigue el template por clasificación, serialización, lowering a SSA, optimización y generación de constraints."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
---

Cuando se ejecuta un bloque `prove {}`, Achronyme necesita un circuito, una asignación de witness y un backend de proving. Reconstruir la misma estructura en cada invocación repetiría el parsing y el lowering aunque solo cambiaran los valores capturados.

ProveIR separa ambas partes. El compilador construye una vez el template del circuito y lo guarda en el bytecode. En runtime, la VM aporta los valores capturados e instancia un programa plano para el prover. El template funciona como un closure de circuito: su estructura es fija y sus capturas son parámetros.

## El trabajo repetido de compilar en runtime

En versiones tempranas de Achronyme, los bloques prove se compilaban en runtime. Cuando la VM encontraba un bloque `prove {}`, hacía lo siguiente:

1. Re-parsear el AST del bloque
2. Bajarlo a IR desde cero
3. Clasificar variables como públicas/witness
4. Compilar a constraints R1CS
5. Generar la prueba

Los pasos 1-3 eran idénticos cada vez que el mismo bloque prove se ejecutaba. El AST no cambia. La estructura del circuito no cambia. Solo los valores de las variables capturadas difieren entre invocaciones.

Esto también significaba que los errores de compilación de circuitos (cosas como usar `print()` dentro de un bloque prove, o referenciar una variable indefinida) eran errores de runtime. Escribías tu programa, lo ejecutabas, esperabas a que la ejecución llegara al bloque prove, y *entonces* descubrías que tu circuito estaba mal formado.

ProveIR mueve todo ese trabajo al tiempo de compilación.

## Templates de circuitos paramétricos

Un template de ProveIR es un circuito pre-compilado con huecos. Los huecos son **capturas**: variables del scope circundante que el circuito referencia pero no define. En tiempo de compilación, la estructura del circuito es fija: qué variables son públicas, cuáles son witnesses, qué operaciones se realizan, cómo están estructurados los loops. En runtime, las capturas se llenan con valores concretos, los loops se desenrollan, y el template se convierte en un programa IR plano listo para compilarse a constraints.

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

Toda esta estructura se compila en un template ProveIR y se serializa en el bytecode. El template no sabe qué valor tiene `secret`; solo sabe que en runtime, algo llamado `secret` será proporcionado, y debe tratarse como un witness input.

En runtime, la VM encuentra el opcode `Prove`, busca el template serializado en el constant pool, lo deserializa, inserta `secret = 42`, y le pasa el programa instanciado al prover.

## El Pipeline: Ocho Fases

El ciclo de vida completo de un bloque prove pasa por ocho fases. Las fases A a C ocurren en secuencia entre compile time y runtime. Las fases D a H son el pipeline estándar de pruebas ZK.

### Fase A: AST a Template ProveIR (Compile Time)

El `ProveIrCompiler` toma el AST de un bloque prove y el scope exterior, y produce un template ProveIR.

**Desugaring de variables mutables.** Los circuitos son puros: no hay estado mutable. Pero Achronyme te permite escribir variables `mut` dentro de bloques prove por legibilidad. ProveIR las convierte a forma SSA:

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

Cada mutación crea una nueva variable SSA. La representación intermedia permite rastrear qué versión alcanza cada uso.

**Inlining de funciones.** Las funciones definidas por el usuario referenciadas dentro del bloque prove se inlinean en cada call site. Los circuitos ZK no pueden tener dispatch dinámico: cada operación debe ser estáticamente conocida. ProveIR genera nombres de variables únicos por sitio de inline para evitar colisiones.

**Validación.** El compilador rechaza construcciones que no pueden existir en un circuito: `print()`, `break`, `return`, operaciones con strings, acceso a maps. Estos errores se detectan en compile time, no en runtime.

**Detección de capturas.** Cualquier variable referenciada dentro del bloque prove pero definida fuera de él se marca como captura. El compilador registra el nombre y, para arrays, el tamaño.

**Preservación de loops.** Los loops `for` no se desenrollan en la Fase A cuando sus límites dependen de capturas. El template conserva su estructura y pospone el desenrollado hasta la Fase B.

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

La salida es un `IrProgram`: una lista plana de 24 tipos de instrucción posibles en forma SSA, donde cada instrucción produce exactamente un resultado nombrado.

### Fase C: Optimización (Runtime)

Seis pases de optimización se ejecutan sobre el IR plano:

1. **Constant folding**: pre-computa expresiones donde ambos operandos son constantes.
2. **Boolean propagation**: detecta variables restringidas a {0, 1} via patrones `v * (v - 1) = 0`, habilitando operaciones booleanas más eficientes.
3. **Bit pattern detection**: reconoce patrones de descomposición Num2Bits (`suma de bits_i * 2^i = valor`) e infiere bounds de bitwidth sobre el valor original.
4. **Bound inference**: usa los anchos de bit inferidos para reemplazar comparaciones del ancho completo del campo por versiones acotadas. En el benchmark registrado para esta implementación, un circuito `LessThan(8)` bajó de 518 a 11 constraints.
5. **Common subexpression elimination**: deduplica computaciones idénticas.
6. **Dead code elimination**: elimina instrucciones cuyos resultados nunca se usan (preservando nodos que generan constraints como `AssertEq`).

Reducción típica: 20-40% menos instrucciones.

### Fases D-H: Constraints, Witness, Prueba, Verificación

El IR optimizado se compila a R1CS (para Groth16) o gates Plonkish (para halo2-KZG). Los valores del witness se asignan, el prover se ejecuta, y una prueba se retorna a la VM como un valor de primera clase.

## Clasificación de capturas

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

Si una variable se usa como límite de un loop y dentro de una constraint, el circuito debe usarla como estructura y como dato. ProveIR crea un witness input y lo restringe para que sea igual al valor estructural concreto. Sin esa igualdad, el witness podría diferir del valor usado para desenrollar el loop.

Esta clasificación ocurre automáticamente en la Fase A al recorrer el cuerpo del circuito y analizar dónde aparece cada captura.

## Serialización: Circuitos como Bytes

Los templates de ProveIR se serializan en un formato binario compacto (v5):

```
[4 bytes: "ACHP"] [1 byte: version=5] [1 byte: prime_id] [payload bincode]
```

El header mágico `ACHP` (Achronyme Circuit Prove) previene la deserialización accidental de datos incorrectos. El prime ID identifica a qué campo pertenecen las constantes (BN254, BLS12-381 o Goldilocks).

Las constantes se almacenan como `FieldConst([u8; 32])`: 32 bytes en forma canónica little-endian en lugar de un tipo genérico de campo de Rust. El prime ID vincula esos bytes al campo elegido para la instanciación e impide cargarlos con un objetivo incompatible.

El compilador de bytecode almacena los bytes serializados en el constant pool y emite:

```
BuildMap  R[map], R[captures_start], capture_count
Prove     R[map], K[prove_ir_index]
```

Donde `R[map]` contiene un mapa de nombres de capturas a sus valores en runtime, y `K[prove_ir_index]` apunta a los bytes serializados de ProveIR en el constant pool.

La definición del circuito viaja dentro del binario `.achb`, por lo que no necesita otro archivo fuente en runtime. Ese empaquetado no elimina el trusted setup requerido por claves Groth16 de producción.

## Ejemplo End-to-End

Tracemos una prueba de compromiso Poseidon a través de todo el pipeline.

**Código fuente** (de `test/prove/prove_with_poseidon.ach`):

```ach
let a = 0p1
let b = 0p2
let h = 0p7853200120776062878684798364095072458815029376092732009249414926327459813530

prove(h: Public) {
    assert_eq(poseidon(a, b), h)
}
```

**Salida de Fase A** (template ProveIR):

```
ProveIR {
    public_inputs: [{ name: "h" }],
    witness_inputs: [],
    captures: [
        { name: "a", usage: CircuitInput },
        { name: "b", usage: CircuitInput },
    ],
    body: [
        AssertEq {
            lhs: PoseidonHash(Capture("a"), Capture("b")),
            rhs: Input("h"),
        }
    ]
}
```

**Serializado:** almacenado como bytes en el constant pool.

**Fase B** (instanciación con `{ a: 1, b: 2 }`); esta es la salida real de `--dump-ir` del compilador:

```
%0 = Input("h", public)
%1 = Input("a", witness)
%2 = Input("b", witness)
%3 = PoseidonHash(%1, %2)
%4 = AssertEq(%3, %0)
5 instructions, 3 inputs, 1 constraints
```

Los inputs públicos se emiten primero, luego los witnesses. El circuito completo son 5 instrucciones: el hash Poseidon y una constraint de igualdad.

**Fase C** (optimización): Sin reducciones, el circuito ya es mínimo. ~400 constraints R1CS en la Fase D (dominados por los internos de la permutación Poseidon).

**Fases D-H:** Compilación a R1CS, asignación de witness, generación de prueba Groth16. La prueba se retorna a la VM como un `Value::Proof`.

## Por qué conservar una IR de templates

**Ejecución repetida.** Sin un template intermedio, cada ejecución de un bloque prove vuelve a parsear y bajar el mismo circuito. Con ProveIR, el compilador hace ese trabajo una vez y la instanciación en runtime solo resuelve las capturas variables.

**Reporte de errores.** ProveIR atrapa errores de circuito en compile time. Usar `print()` dentro de un bloque prove, referenciar una variable indefinida, o escribir una construcción no soportada: todos estos son errores de compilación, no sorpresas en runtime.

**Conversión SSA.** Las variables mutables requieren análisis de flujo de datos para convertirse a forma SSA. Necesitas rastrear qué versión de una variable está activa en cada punto. Este es un problema de compilador que la evaluación cruda de AST no puede resolver: necesitas un IR para hacerlo correctamente.

**Portabilidad.** ProveIR usa `FieldConst([u8; 32])`, no `FieldElement<F>`. El template serializado es field-erased. El mismo bytecode puede apuntar a BN254, BLS12-381, o cualquier otra curva soportada; el tipo de campo se resuelve en el momento de instanciación basado en el byte de prime ID del header.

**Embeddability.** El circuito es parte del programa. Un archivo `.achb` es autocontenido: bytecode, constantes y templates de circuito en un solo artefacto. Sin archivos `.circom` separados, sin binarios WASM, sin dependencias externas.

## El Set de Instrucciones

La forma instanciada de ProveIR (el IR plano) usa 24 instrucciones SSA, diseñadas específicamente para constraints ZK:

**Aritmética core:** `Add`, `Sub`, `Mul`, `Div`, `Neg`, `Pow`

**Constraints:** `AssertEq` (la constraint fundamental de R1CS), `Assert` (verdad booleana)

**Comparaciones:** `IsEq`, `IsNeq`, `IsLt`, `IsLe`, `IsLtBounded`, `IsLeBounded`. Las variantes acotadas usan anchos de bit inferidos para evitar descomponer un valor con todo el ancho del campo.

**Lógica:** `And`, `Or`, `Not`, `Mux` (selección condicional sin branching)

**Builtins criptográficos:** `PoseidonHash`, `RangeCheck`, `Decompose` (descomposición en bits)

**Aritmética entera:** `IntDiv`, `IntMod` (con max_bits para generación de constraints)

**Datos:** `Const`, `Input`

Cada instrucción produce exactamente una variable resultado (propiedad SSA). La única excepción es `Decompose`, que produce tanto un resultado como un array de variables de bits.

## Dónde encaja ProveIR

ProveIR evita repetir el análisis del código fuente durante cada ejecución de una prueba. También da a la validación, clasificación de capturas, serialización y vinculación con el campo una frontera documentada antes de que el backend emita constraints.

La optimización parte de una observación limitada: las invocaciones repetidas de un mismo bloque prove suelen compartir la estructura del circuito aunque cambien sus valores. Si una captura modifica la estructura, la instanciación la resuelve explícitamente antes de generar constraints, en lugar de fingir que todas las invocaciones tienen el mismo circuito plano.

El código fuente de ProveIR vive en `ir/src/prove_ir/` (tipos, compilador, instanciador, clasificador de capturas) y `compiler/src/control_flow/zk.rs` (integración con bytecode). El codebase completo está en [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme).
