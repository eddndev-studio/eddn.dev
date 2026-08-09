---
title: "The Achronyme Beta Before 0.1.0"
description: "A dated look at the language and proving workflow that preceded the stable Achronyme release."
pubDate: "2026-03-14"
updatedDate: "2026-08-08"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

This article described Achronyme while it was still on `v0.1.0-beta.19`. I have kept it as a record of that stage, but corrected two claims that did not survive the stable release: the setup was automated, not trust-free, and the beta was still a prototype in several important ways.

For the completed release, read [Achronyme 0.1.0: stable at last](/en/blog/achronyme-0-1-0/).

## What the beta could do

Achronyme used one syntax for general-purpose execution and arithmetic circuits. A `prove(...)` block captured values from the surrounding scope, compiled its body as a circuit, generated a witness, and returned a proof to the running program.

```ach
let secret = 0p12345
let blinding = 0p98765
let commitment = poseidon(secret, blinding)

let p = prove(commitment: Public) {
    assert_eq(poseidon(secret, blinding), commitment)
}

print(proof_json(p))
assert(verify_proof(p))
```

The same source language had two execution paths:

- `ach run` executed dynamic code with closures, recursion, arrays, maps, strings, and managed memory.
- `ach circuit` lowered supported code into R1CS or Plonkish constraints. Loops needed static bounds, branches became selections, and functions were inlined into the circuit.

The `prove` block connected those paths. Host code prepared values; circuit code expressed what the proof constrained.

## What automation did and did not remove

The beta bundled native Groth16 and Plonkish backends, so ordinary proving did not require a separate Node.js process. It could also export `.r1cs` and `.wtns` files for `snarkjs` interoperability.

That convenience did not remove Groth16's trusted setup. During development the tool could create local keys automatically, but a production release still needed a circuit-bound ceremony, externally controlled entropy, artifact verification, and a clear retention policy. Stable 0.1.0 added that release gate and published its evidence.

## The useful parts of the preview

By March, the project already had an SSA-based circuit IR, compiler diagnostics, modules, a VS Code extension, and selectable prime fields. Those parts were real, but they did not make the whole system release-ready. Concurrency semantics, capabilities, backend conformance, reproducible gates, and trusted proving policy still needed work.

The beta article originally presented 0.1.0 as the next quick milestone. It took almost five more months. The delay is documented in the stable release note rather than hidden by rewriting this date.

Source and downloads: [github.com/achronyme/achronyme](https://github.com/achronyme/achronyme/releases/tag/v0.1.0).
