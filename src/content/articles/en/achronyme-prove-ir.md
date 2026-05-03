---
title: "ProveIR: Compile Once, Prove Many. Inside Achronyme's Circuit Template System"
description: "How Achronyme pre-compiles prove blocks into parametric circuit templates that serialize into bytecode and instantiate at runtime with captured values."
pubDate: "2026-04-06"
tags: ["architecture", "compilers", "zero-knowledge", "achronyme", "cryptography"]
draft: false
translationKey: "achronyme-prove-ir"
abstract: "This article explores ProveIR, the intermediate representation that powers Achronyme's prove blocks. ProveIR is a parametric circuit template system: prove blocks are compiled once at compile time, serialized into the bytecode constant pool, and instantiated at runtime with captured values from the surrounding scope. The article deconstructs the full pipeline (from AST to ProveIR template, capture classification, serialization, instantiation into SSA IR, optimization, and finally R1CS or Plonkish constraint generation), explaining why this intermediate layer is essential for correctness, performance, and portability across prime fields."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://docs.achrony.me"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
---

Every time a `prove {}` block executes in Achronyme, a cryptographic proof is generated. The circuit is compiled, a witness is assigned, and a Groth16 or PlonK proof comes out the other end. If you've worked with ZK toolchains before, you know that process is expensive: parsing, lowering to constraints, and running the prover can easily take seconds.

Now imagine a program that runs the same prove block in a loop, ten times, with different inputs. Without careful design, you'd be parsing and compiling the circuit ten times, only to produce the exact same constraint system each time (just with different witness values). That's wasteful.

ProveIR exists to solve this. It's the intermediate representation that lets Achronyme **compile a prove block once** at compile time, **serialize it into the bytecode**, and **instantiate it many times** at runtime with different captured values. Think of it as a closure for circuits: the structure is fixed, but the data is parametric.

## The Problem: Runtime Compilation is Expensive

In early versions of Achronyme, prove blocks were compiled at runtime. When the VM hit a `prove {}` block, it would:

1. Re-parse the block's AST
2. Lower it to IR from scratch
3. Classify variables as public/witness
4. Compile to R1CS constraints
5. Generate the proof

Steps 1-3 were identical every time the same prove block ran. The AST doesn't change. The structure of the circuit doesn't change. Only the values of captured variables differ between invocations.

This also meant that circuit compilation errors (things like using `print()` inside a prove block, or referencing an undefined variable) were runtime errors. You'd write your program, run it, wait for execution to reach the prove block, and *then* find out your circuit was malformed.

ProveIR moves all of that work to compile time.

## The Core Idea: Parametric Circuit Templates

A ProveIR template is a pre-compiled circuit with holes. The holes are **captures**: variables from the surrounding scope that the circuit references but doesn't define. At compile time, the structure of the circuit is fixed: which variables are public, which are witnesses, what operations are performed, how loops are structured. At runtime, the captures are filled in with concrete values, loops are unrolled, and the template becomes a flat IR program ready for constraint compilation.

Here's what this looks like in practice:

```ach
let secret = 0p42
let expected_hash = poseidon(secret, 0p0)

prove(expected_hash: Public) {
    assert_eq(poseidon(secret, 0p0), expected_hash)
}
```

At compile time, the compiler sees that the prove block:
- Declares `expected_hash` as a public input
- References `secret` from the outer scope (a capture)
- Contains a Poseidon hash and an equality constraint

This entire structure is compiled into a ProveIR template and serialized into the bytecode. The template doesn't know what value `secret` holds; it just knows that at runtime, something called `secret` will be provided, and it should be treated as a witness input.

At runtime, the VM encounters the `Prove` opcode, looks up the serialized template in the constant pool, deserializes it, plugs in `secret = 42`, and hands the instantiated program to the prover.

## The Pipeline: Eight Phases

The full lifecycle of a prove block passes through eight phases. Phases A through C happen in sequence across compile time and runtime. Phases D through H are the standard ZK proof pipeline.

### Phase A: AST to ProveIR Template (Compile Time)

This is where the heavy lifting happens. The `ProveIrCompiler` takes the AST of a prove block and the outer scope, and produces a ProveIR template.

**Mutable variable desugaring.** Circuits are pure: there's no mutable state. But Achronyme lets you write `mut` variables inside prove blocks for readability. ProveIR converts them to SSA form:

```ach
prove(result: Public) {
    mut sum = 0p0
    sum = sum + a
    sum = sum + b
    assert_eq(sum, result)
}
```

Becomes internally:

```
let sum$v0 = Const(0)
let sum$v1 = Add(sum$v0, Capture("a"))
let sum$v2 = Add(sum$v1, Capture("b"))
AssertEq(sum$v2, Input("result"))
```

Each mutation creates a new SSA variable. This transformation is impossible without an intermediate representation: you need to track the dataflow of each variable across assignments, which requires analysis that raw AST evaluation can't provide.

**Function inlining.** User-defined functions referenced inside the prove block are inlined at each call site. ZK circuits can't have dynamic dispatch: every operation must be statically known. ProveIR generates unique variable names per inline site to avoid collisions.

**Validation.** The compiler rejects constructs that can't exist in a circuit: `print()`, `break`, `return`, string operations, map access. These errors are caught at compile time, not runtime.

**Capture detection.** Any variable referenced inside the prove block but defined outside it is marked as a capture. The compiler records the name and, for arrays, the size.

**Loop preservation.** Critically, `for` loops are *not* unrolled in Phase A. The loop bounds might depend on captured values that aren't known until runtime. The template preserves the loop structure and defers unrolling to Phase B.

The output is a `ProveIR` struct:

```
ProveIR {
    public_inputs:  [ProveInputDecl],   // verifier-visible
    witness_inputs: [ProveInputDecl],   // prover-only
    captures:       [CaptureDef],       // holes to fill at runtime
    body:           [CircuitNode],      // the circuit template
    capture_arrays: [CaptureArrayDef],  // array reconstruction info
}
```

### Phase B: Instantiation (Runtime)

When the VM hits the `Prove` opcode, it deserializes the template and provides a map of capture values. The instantiator:

1. **Resolves captures** to concrete values based on their classification (more on this below).
2. **Unrolls loops.** Now that bounds are concrete (`for i in 0..n` where `n = 8`), loops become flat sequences of instructions.
3. **Expands arrays.** Array captures like `path = [a, b, c]` become individual elements `path_0`, `path_1`, `path_2`.
4. **Flattens the tree.** The hierarchical `CircuitNode`/`CircuitExpr` tree becomes a linear sequence of SSA instructions.

The output is an `IrProgram`: a flat list of 24 possible instruction types in SSA form, where each instruction produces exactly one named result.

### Phase C: Optimization (Runtime)

Six optimization passes run on the flat IR:

1. **Constant folding**: pre-computes expressions where both operands are constants.
2. **Boolean propagation**: detects variables constrained to {0, 1} via `v * (v - 1) = 0` patterns, enabling cheaper boolean operations downstream.
3. **Bit pattern detection**: recognizes Num2Bits decomposition patterns (`sum of bits_i * 2^i = value`) and infers bitwidth bounds on the original value.
4. **Bound inference**: uses inferred bitwidths to replace expensive unbounded comparisons (`IsLt`, which requires 252-bit decomposition) with bounded versions (`IsLtBounded`, which needs only N bits). This is where the dramatic constraint reductions happen: a `LessThan(8)` circuit dropped from 518 to 11 constraints.
5. **Common subexpression elimination**: deduplicates identical computations.
6. **Dead code elimination**: removes instructions whose results are never used (preserving constraint-generating nodes like `AssertEq`).

Typical reduction: 20-40% fewer instructions.

### Phases D-H: Constraints, Witness, Proof, Verification

The optimized IR compiles to R1CS (for Groth16) or Plonkish gates (for halo2-KZG). Witness values are assigned, the prover runs, and a proof is returned to the VM as a first-class value.

## Capture Classification: The Key Design Decision

Not all captured variables serve the same purpose in a circuit. Consider:

```ach
let n = 8
let secret = 0p42

prove(hash: Public) {
    for i in 0..n {
        // ... n iterations
    }
    assert_eq(poseidon(secret, 0p0), hash)
}
```

Here, `n` determines the *structure* of the circuit (how many times the loop unrolls), while `secret` determines the *values* flowing through constraints. ProveIR classifies each capture into one of three categories:

| Classification | Role | What happens at instantiation |
|---|---|---|
| `StructureOnly` | Loop bounds, array sizes, exponents | Inlined as a constant. No witness generated. |
| `CircuitInput` | Used inside constraints | Becomes a witness input to the circuit. |
| `Both` | Structural AND in constraints | Witness input + `AssertEq` binding to the constant value. |

The `Both` case is subtle. If a variable is used as a loop bound *and* inside a constraint, the circuit needs to both unroll the loop (structural) and prove something about the value (constraint). ProveIR handles this by creating a witness input and immediately constraining it to equal the known constant, ensuring the prover can't lie about the structural parameter.

This classification happens automatically in Phase A by walking the circuit body and analyzing where each capture appears.

## Serialization: Circuits as Bytes

ProveIR templates are serialized into a compact binary format (v5):

```
[4 bytes: "ACHP"] [1 byte: version=5] [1 byte: prime_id] [bincode payload]
```

The magic header `ACHP` (Achronyme Circuit Prove) prevents accidental deserialization of wrong data. The prime ID identifies which field the constants belong to (BN254, BLS12-381, or Goldilocks).

A critical design choice: constants are stored as `FieldConst([u8; 32])`: 32 bytes in canonical little-endian form, independent of any specific field type. This makes ProveIR **field-erased**: the same serialized template could theoretically be instantiated over different prime fields (with appropriate constant reinterpretation). In practice, the prime ID byte ensures type safety.

The bytecode compiler stores the serialized bytes in the constant pool and emits:

```
BuildMap  R[map], R[captures_start], capture_count
Prove     R[map], K[prove_ir_index]
```

Where `R[map]` holds a map of capture names to their runtime values, and `K[prove_ir_index]` points to the serialized ProveIR bytes in the constant pool.

The entire circuit definition travels inside the `.achb` binary. No external files, no separate circuit definitions, no ceremony.

## End-to-End Example

Let's trace a Poseidon commitment proof through the entire pipeline.

**Source code** (from `test/prove/prove_with_poseidon.ach`):

```ach
let a = 0p1
let b = 0p2
let h = 0p7853200120776062878684798364095072458815029376092732009249414926327459813530

prove(h: Public) {
    assert_eq(poseidon(a, b), h)
}
```

**Phase A output** (ProveIR template):

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

**Serialized:** stored as bytes in the constant pool.

**Phase B** (instantiation with `{ a: 1, b: 2 }`); this is the actual `--dump-ir` output from the compiler:

```
%0 = Input("h", public)
%1 = Input("a", witness)
%2 = Input("b", witness)
%3 = PoseidonHash(%1, %2)
%4 = AssertEq(%3, %0)
5 instructions, 3 inputs, 1 constraints
```

Public inputs are emitted first, then witnesses. The entire circuit is 5 instructions: the Poseidon hash and one equality constraint.

**Phase C** (optimization): No reductions, the circuit is already minimal. ~400 R1CS constraints at Phase D (dominated by the Poseidon permutation internals).

**Phase D-H:** R1CS compilation, witness assignment, Groth16 proof generation. The proof is returned to the VM as a `Value::Proof`.

## Why Not Compile Directly to R1CS?

You might wonder: why not skip ProveIR entirely and go straight from AST to constraints?

**Efficiency.** Without an intermediate template, every prove block execution re-parses and re-lowers the same circuit. With ProveIR, compilation happens once. The template is ~200 bytes; re-parsing the AST and re-running the compiler would take orders of magnitude longer.

**Error reporting.** ProveIR catches circuit errors at compile time. Using `print()` inside a prove block, referencing an undefined variable, or writing an unsupported construct: all of these are compile-time errors, not runtime surprises.

**SSA conversion.** Mutable variables require dataflow analysis to convert to SSA form. You need to track which version of a variable is live at each point. This is a compiler problem that raw AST evaluation can't solve: you need an IR to do it correctly.

**Portability.** ProveIR uses `FieldConst([u8; 32])`, not `FieldElement<F>`. The serialized template is field-erased. The same bytecode can target BN254, BLS12-381, or any other supported curve; the field type is resolved at instantiation time based on the prime ID header.

**Embeddability.** The circuit is part of the program. A `.achb` file is self-contained: bytecode, constants, and circuit templates in a single artifact. No separate `.circom` files, no WASM binaries, no external dependencies.

## The Instruction Set

ProveIR's instantiated form (the flat IR) uses 24 SSA instructions, purpose-built for ZK constraints:

**Core arithmetic:** `Add`, `Sub`, `Mul`, `Div`, `Neg`, `Pow`

**Constraints:** `AssertEq` (the fundamental R1CS constraint), `Assert` (boolean truth)

**Comparisons:** `IsEq`, `IsNeq`, `IsLt`, `IsLe`, `IsLtBounded`, `IsLeBounded`. The bounded variants use inferred bitwidths for dramatically fewer constraints.

**Logic:** `And`, `Or`, `Not`, `Mux` (conditional selection without branching)

**Cryptographic builtins:** `PoseidonHash`, `RangeCheck`, `Decompose` (bit decomposition)

**Integer arithmetic:** `IntDiv`, `IntMod` (with max_bits for constraint generation)

**Data:** `Const`, `Input`

Every instruction produces exactly one result variable (SSA property). The only exception is `Decompose`, which produces both a result and an array of bit variables.

## Closing Thoughts

ProveIR is, at its core, a bet on separation of concerns. By inserting a template layer between the source language and the constraint system, Achronyme gains compile-time validation, runtime efficiency, field portability, and the ability to treat circuits as first-class artifacts embedded in program bytecode.

The design was driven by a practical observation: the structure of a circuit almost never changes between invocations; only the data does. ProveIR exploits that invariant to compile once and prove many times, turning what would be repeated work into a single serialization and many cheap instantiations.

The source code for ProveIR lives in `ir/src/prove_ir/` (types, compiler, instantiator, capture classifier) and `compiler/src/control_flow/zk.rs` (bytecode integration). The full codebase is at [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme).
