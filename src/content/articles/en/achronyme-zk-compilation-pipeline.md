---
title: "From AST to Arithmetic Constraints: Achronyme's ZK Compilation Pipeline"
description: "How Achronyme lowers source code into SSA, optimizes it, and emits R1CS or Plonkish constraints."
pubDate: "2026-03-12"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "zero-knowledge", "achronyme", "cryptography"]
draft: false
translationKey: "achronyme-zk-pipeline"
abstract: "A technical walk through Achronyme's circuit path: static validation, SSA lowering, optimization, witness layout, and the different cost models of R1CS and Plonkish arithmetization."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://zcash.github.io/halo2/concepts/arithmetization.html"
  - "https://learn.0xparc.org/materials/circom/additional-learning-resources/r1cs%20explainer/"
  - "https://eprint.iacr.org/2019/458.pdf"
---

Achronyme uses one parser for ordinary programs and proof circuits, then sends the resulting AST through different lowering paths. `ach run` needs dynamic control flow, allocation, and I/O. `ach circuit` must produce a fixed set of algebraic relations.

This article follows the circuit path. It ends at constraints and witness generation; the proving key and Groth16 ceremony are a separate trust boundary covered near the end.

## One AST, two execution models

The parser does not decide whether an addition belongs to a host program or a circuit. It produces the same source-level node in both cases. The command and surrounding context choose the next stage:

```text
source
  -> lexer and parser
  -> AST
       -> bytecode and host runtime
       -> circuit validation and lowering
```

The host runtime can allocate memory, read files when capabilities allow it, call native functions, and choose branches at runtime. A circuit cannot emit a different number of constraints after it sees a private value. Its shape must be known before proving.

The circuit path therefore enforces several restrictions:

- Loops need bounds that can be resolved before constraint emission.
- Host effects such as file or network I/O are rejected inside provable code.
- Dynamic dispatch is either resolved by the compiler or rejected.
- A conditional becomes an algebraic selection instead of skipping one branch.

Some `prove {}` blocks capture structural values from the host. Achronyme serializes them as templates and resolves those values before flattening the final circuit. [The ProveIR article](/articles/achronyme-prove-ir/) covers that boundary in detail.

## Lowering control flow into SSA

Circuit lowering assigns a fresh name to each computed value. Source-level mutation is rewritten into versions:

```ach
mut total = 0p0
total = total + a
total = total + b
assert_eq(total, expected)
```

The lowered form is conceptually:

```text
total$v0 = Const(0)
total$v1 = Add(total$v0, a)
total$v2 = Add(total$v1, b)
AssertEq(total$v2, expected)
```

Traditional SSA uses phi nodes to merge values from control-flow predecessors. The flattened circuit IR instead uses an explicit selection. For a boolean `cond` and branch values `left` and `right`, the result can be constrained as:

$$
out = cond \cdot left + (1 - cond) \cdot right
$$

The compiler must also constrain `cond` to be boolean, for example with $cond \cdot (cond - 1) = 0$. Both branch expressions exist in the circuit; `cond` selects the value that flows forward.

This representation makes data dependencies explicit and gives optimization passes a linear instruction stream to inspect.

## Optimization uses the constraint cost model

A normal compiler often optimizes CPU instructions, memory traffic, or binary size. A circuit compiler also cares about the number and kind of constraints handed to the prover.

Achronyme applies passes such as:

1. **Constant folding**, which evaluates expressions whose inputs are known.
2. **Boolean and bit-pattern propagation**, which records values already constrained to bits or bounded integers.
3. **Bound inference**, which replaces a field-width comparison with a smaller bounded comparison when the program proves a tighter width.
4. **Common subexpression elimination**, which reuses identical computations.
5. **Dead code elimination**, while preserving assertions and other instructions that create constraints.

The compiler also tracks flows from private inputs to detect suspicious values that never reach a constraint. That analysis is a guardrail, not a proof that every circuit is sound. It can reject known under-constrained patterns; it cannot replace review of the circuit semantics.

## R1CS emission

Groth16 commonly consumes a Rank-1 Constraint System. Each row has the form:

$$
(A \cdot w) \times (B \cdot w) = C \cdot w
$$

Here $w$ is the complete assignment vector. Achronyme lays it out with a constant-one slot, followed by public inputs and then private witness values:

```text
w = [1, public_0, public_1, ..., private_0, private_1, ...]
```

The first slot lets a linear combination include constants. Public values come before private values because the verifier needs a stable public prefix when checking a proof.

For this source relation:

```ach
pub x
witness y
assert_eq(x * y + 1, 42)
```

the compiler can rearrange the equation to $x \cdot y = 41$ and emit one multiplication constraint:

```text
A = [0, 1, 0]   // x
B = [0, 0, 1]   // y
C = [41, 0, 0]  // 41 * ONE
```

Large linear combinations can often share a constraint row without adding another multiplication constraint. Calling addition "free" is convenient shorthand, but it is not literally free: the matrices still grow and the prover still processes their coefficients.

Comparisons and bitwise operations are more expensive. A prime field has no native ordering, so a comparison usually needs range constraints and bit decomposition. Bound inference matters because decomposing an 8-bit value is much smaller than decomposing a value at the full field width.

## Plonkish emission

Achronyme can also lower circuit operations to a Plonkish backend. Instead of three sparse matrices, a Plonkish circuit places witness values into rows and columns and enables gates with selector polynomials. A common arithmetic gate looks like:

$$
q_L a + q_R b + q_M ab + q_O c + q_C = 0
$$

The selector values choose whether a row performs an addition, multiplication, or another supported relation. Exact signs and column layouts are backend conventions.

This changes the cost model. An R1CS linear combination can mention many values in one row, while a narrow Plonkish gate may need several rows. Plonkish systems can recover efficiency through copy constraints, custom gates, and lookup tables when the backend provides them.

![Constraint cost comparison: R1CS and Plonkish](/images/articles/achronyme-zk/constraint-cost-comparison.png)

A lookup can prove that an input-output tuple belongs to a precomputed table. That is useful for range checks and some bitwise operations, but it is not an automatic one-row replacement for every expensive gadget. Table construction, lookup arguments, and backend support are part of the cost.

## Fields and cryptographic primitives

The source language makes the selected prime field explicit. BN254 is important because Groth16 proofs over that curve interoperate with `snarkjs` and Ethereum verifier tooling. It is also the field used by the production proving gate for Achronyme 0.1.0. Other compiler targets can use other supported fields; BN254 is not a universal property of every Achronyme program.

Field libraries commonly use Montgomery representation internally to make modular multiplication efficient on ordinary CPUs. That representation is an implementation detail below the circuit IR. The compiler's responsibility is to preserve field semantics and bind serialized constants to the selected prime.

Poseidon is available because its arithmetic is friendlier to prime-field circuits than SHA-256. A Poseidon S-box can use $x^5$, implemented with three multiplications:

1. $x^2 = x \cdot x$
2. $x^4 = x^2 \cdot x^2$
3. $x^5 = x^4 \cdot x$

The full hash cost depends on its width, round constants, and backend. The useful comparison is structural: Poseidon uses field addition and multiplication directly, while SHA-256 requires many boolean and bitwise gadgets when expressed in an arithmetic circuit.

## Constraints are not the complete proof system

Emitting R1CS and assigning a witness does not by itself produce a production-safe Groth16 setup. The proving and verification keys must be bound to the exact circuit. A release also needs a policy for who controls setup entropy, how artifacts are checked, and what evidence can be published without exposing private material.

Achronyme 0.1.0 used an externally controlled phase 2 contribution, a precommitted drand beacon, and proofs checked in both directions by Achronyme and `snarkjs`. The [release story](/blog/achronyme-0-1-0/) explains the process, and the [immutable dossier](https://github.com/achronyme/achronyme/blob/cd0601402e03bbdff4b4ac4cae88c0e672d53ac8/release-evidence/0.1.0/final/README.md) contains the hashes and public interoperability artifacts.

The compiler can make unsupported effects explicit, lower control flow consistently, and catch classes of under-constrained dataflow. The proof backend and setup then establish different properties. Keeping those responsibilities separate makes it possible to state what was tested without claiming that one compiler pass proves the entire system correct.
