---
title: "Achronyme: A Language for Zero-Knowledge Proofs"
description: "Introducing Achronyme — write readable code, generate cryptographic proofs. One language, two execution targets, zero ceremony."
pubDate: "2026-03-14"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

If you've ever written a ZK circuit, you know the pain. You write constraints in one DSL, generate witnesses in JavaScript, download a Powers of Tau file, run a trusted setup, invoke snarkjs three separate times, and pray everything lines up. Seven steps, three tools, two languages — just to prove you know a number.

I built Achronyme to make this simpler.

## What is Achronyme?

Achronyme is a programming language where the same syntax can run as a general-purpose program or compile to arithmetic constraints for zero-knowledge proofs.

Here's what proving a Poseidon commitment looks like:

```ach
let secret = 0p12345
let blinding = 0p98765

let p = prove {
    witness secret
    witness blinding
    public commitment
    assert_eq(poseidon(secret, blinding), commitment)
}

print(proof_json(p))    // Groth16 proof, verifiable on-chain
assert(verify_proof(p)) // verified
```

Six lines. One file. The `prove {}` block compiles a circuit, captures variables from scope, generates a witness, and returns a cryptographic proof — all inline. No ceremony.

Compare that to the Circom equivalent: write a template, compile to WASM, generate witness with JavaScript, download ptau, run trusted setup, prove, verify. Seven steps across three different tools.

The reason this works is that Achronyme doesn't separate "the language you think in" from "the language the prover understands." The same source code serves both roles.

## Dual Execution

That's possible because of dual execution — the same source, two targets:

**VM mode** (`ach run`) gives you a real programming language — closures, recursion, mark-sweep GC, arrays, maps, strings, 43 native functions. Write algorithms, manipulate data, prepare inputs.

**Circuit mode** (`ach circuit`) compiles the same syntax to R1CS or Plonkish constraints over BN254. Loops unroll statically, `if/else` becomes `mux`, functions inline at every call site. The output is a flat constraint system ready for proof generation.

The `prove {}` block bridges both: it runs inside the VM but compiles its body as a circuit.

## Native Provers

Achronyme includes native Groth16 (ark-groth16) and PlonK (halo2-KZG) backends compiled directly into the binary. No Node.js, no snarkjs, no external dependencies. Proofs are generated in-process.

```bash
# Groth16 (default)
ach run my_proof.ach

# PlonK
ach run my_proof.ach --prove-backend plonkish

# Compile circuit + generate Solidity verifier
ach circuit vote.ach --inputs "..." --solidity Verifier.sol
```

The `.r1cs` and `.wtns` output files are also snarkjs-compatible, so you can use external tooling if you prefer.

## What's Included

This isn't a prototype. The current release (v0.1.0-beta.7) is the result of months of work on correctness, developer experience, and tooling:

- **1,300+ unit tests and 150+ integration tests** — every feature is tested across both execution modes, every commit runs CI
- **SSA IR with 4 optimization passes** — taint analysis catches under-constrained variables before you waste 20 minutes on a failed proof; boolean propagation eliminates redundant constraints automatically
- **Rustc-style diagnostics** — when something goes wrong, you get source snippets, "did you mean?" suggestions, and warning codes — not a raw constraint index
- **Module system** — `import`/`export` with circular dependency detection, so circuits can share code without copy-pasting
- **VS Code extension** — syntax highlighting and real-time error detection via LSP, because writing constraints blind is how bugs happen
- **Install script** — one command, no Rust toolchain required

## Get Started

```bash
curl -fsSL https://achrony.me/install.sh | sh
```

This installs the `ach` binary to `~/.local/bin`. Then:

```bash
ach --version          # verify
ach run script.ach     # run a program
ach circuit circ.ach   # compile a circuit
ach disassemble f.ach  # inspect bytecode or IR
```

The source is at [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme). Docs at [docs.achrony.me](https://docs.achrony.me). VS Code extension at [achronyme-editor](https://github.com/achronyme/achronyme-editor).

## What's Next

The roadmap toward 1.0:

- **0.1.0** — first stable release (stdlib, polished imports)
- **0.2.0** — LSP completions, go-to-definition, hover docs
- **0.3.0** — browser playground (WASM compiler + VM)
- **1.0.0** — stable API freeze, multi-curve support

If you write ZK circuits and you're tired of the ceremony, try porting one of your existing circuits to Achronyme and see how it feels. If something breaks or doesn't make sense, [open an issue](https://github.com/achronyme/achronyme/issues) — that's the most useful feedback at this stage.
