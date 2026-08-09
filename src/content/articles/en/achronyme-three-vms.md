---
title: "Akron, Artik, Lysis: Why Achronyme Uses Three Virtual Machines"
description: "How scripting, witness generation, and constraint emission led Achronyme to three different memory models."
pubDate: "2026-05-03"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "vm", "achronyme", "memory"]
draft: false
translationKey: "achronyme-three-vms"
abstract: "Achronyme separates dynamic scripting, witness generation, and constraint emission into Akron, Artik, and Lysis. Each VM uses the memory model required by its job instead of sharing one general-purpose runtime."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
  - "https://en.wikipedia.org/wiki/Tracing_garbage_collection"
---

My first article about Achronyme's VM covered the move from stack bytecode to registers. By May 2026, calling it "the VM" was already inaccurate. The project had three execution engines: **Akron**, **Artik**, and **Lysis**.

They were not created from a plan to maximize the number of VMs. Witness generation and large constraint programs imposed memory rules that conflicted with the dynamic language runtime. Splitting the machines made those rules explicit.

## Three jobs, three memory models

Achronyme needed to execute three kinds of work:

1. **User programs and `prove {}` blocks.** Closures, strings, maps, and values with dynamic lifetimes require managed heap allocation.
2. **Witness functions.** This code runs in the proving path. Its allocation should be bounded and predictable from the compiled program.
3. **Constraint emission.** Large, unrolled SSA programs need somewhere to spill intermediate values, but the emitter should not need general alias analysis or garbage collection.

Adding every requirement to one dispatch loop would couple unrelated invariants. A heap feature for scripting could affect witness execution; a restriction added for witness predictability could make ordinary language code awkward.

## Akron: the language runtime

Akron is the register VM used for compiled `.achb` programs. It supports the dynamic parts of the language and executes the host side of `prove {}` blocks. Its values can outlive a single expression, so it has a heap and a tracing garbage collector.

```text
// a = b + c in Akron bytecode
ADD R0, R1, R2
```

Garbage collection is appropriate here because closures, maps, arrays, and strings do not have lifetimes that the bytecode compiler can always determine statically. A pause is a runtime tradeoff Akron accepts in exchange for that flexibility.

## Artik: bounded witness execution

The Circom frontend needs to evaluate imperative helper functions while building a witness. I first tried to execute them through Akron. That reused more code, but it also allowed heap allocation and collection inside the proving path.

Artik is a smaller register machine for those helper functions. It operates on finite-field values and small integers, and it has no general heap or garbage collector:

```text
LOAD_PARAM    R0, 0
CONST_FIELD   R1, 1
ADD_FIELD     R2, R0, R1
RET           R2
```

The register count in the bytecode bounds the storage required by an Artik call. That removes allocator and collector behavior from this part of witness generation. It does not make the entire prover constant-time, and it should not be presented as a complete timing-channel defense. It gives the runtime a narrower property that can be checked from the program.

## Lysis: spill storage with one write per slot

The next limit appeared while lowering large Circom templates such as SHA-256. An unrolled round could create more SSA intermediates than the original register frame could hold. Simply increasing the frame postponed the overflow without expressing how long spilled values remained valid.

Lysis provides explicit spill instructions:

```text
COMPUTE       %v3, %v1, %v2
STORE_HEAP    slot_42, %v3
...
LOAD_HEAP     %v77, slot_42
EMIT_R1CS     %v77, ...
```

Its heap follows one central rule:

> Each heap slot is written exactly once.

With single-static-store, the constraint emitter can build dependencies in one pass. A later read cannot observe an overwritten value, and slots remain valid until the frame ends. Lysis therefore gets spill storage without adopting Akron's object model or garbage collector.

Lysis can also resolve arguments from its heap when it invokes Artik witness code. The two machines cooperate, but they retain different memory rules.

## The boundary between them

| VM | Responsibility | Storage | GC |
|---|---|---|---|
| Akron | Dynamic Achronyme programs | Registers and managed heap | Yes |
| Artik | Witness helper functions | Registers | No |
| Lysis | Constraint-program traversal | Registers and single-write spill slots | No |

The separation reduces the number of cases each engine must handle. An Akron allocation cannot trigger collection inside Artik. A Lysis slot cannot be overwritten because the bytecode validator rejects a second store. Problems can be investigated within the machine that owns the relevant invariant.

## Why I did not merge them

The possible pairs share implementation details but not the same contract:

- Merging Akron and Artik would reintroduce managed allocation into witness helper execution or remove features required by the language runtime.
- Merging Akron and Lysis would force dynamic language values into a single-write storage model.
- Merging Artik and Lysis would either give Artik spill storage it does not need or remove the storage that lets Lysis handle large unrolled programs.

Three is not a permanent law. If the compiler changes, these boundaries can change too. It is simply the smallest split I found that let each execution path state its memory rules without exceptions from the other two.

The source lives in the [Achronyme repository](https://github.com/achronyme/achronyme). The useful design test is whether each VM's invariant remains enforceable at its bytecode boundary. If that stops being true, the split should be reconsidered rather than defended for historical reasons.
