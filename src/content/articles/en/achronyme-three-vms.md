---
title: "Akron, Artik, Lysis: Why Achronyme Composes Three Virtual Machines Instead of One"
description: "When a single general-purpose VM isn't enough: how Achronyme ended up with three specialized virtual machines (one for scripting, one for witness generation, one for constraint emission), each with its own memory discipline."
pubDate: "2026-05-03"
tags: ["architecture", "compilers", "vm", "achronyme", "memory"]
draft: false
translationKey: "achronyme-three-vms"
abstract: "This article continues the architectural analysis of Achronyme's VM published in March, this time explaining how and why the project evolved from a single register-based virtual machine to a composition of three specialized VMs: Akron (scripting + prove blocks with heap and tri-color GC), Artik (deterministic witness generation with no heap and no GC), and Lysis (an SSA bytecode walked by the constraint frontend, with a single-static-store discipline). Each was born from an invariant the previous one couldn't sustain, and each one's memory discipline is exactly aligned with the question that VM exists to answer. The article argues that composing small machines with precise invariants yields less code and more guarantees than a unified VM that tries to absorb every case."
technicalDepth: "Advanced"
references:
  - "https://github.com/achronyme/achronyme"
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://en.wikipedia.org/wiki/Static_single-assignment_form"
  - "https://en.wikipedia.org/wiki/Tracing_garbage_collection"
---

Two months ago I published an article on the architecture of Achronyme's virtual machine: the stack-to-register transition, the lessons from Lua 5.0 and Dalvik, cache locality. That article is still correct, but it's incomplete: somewhere between March and May, Achronyme stopped having *one* virtual machine and ended up with three.

It wasn't a decision I made in front of a whiteboard. It was the cumulative consequence of running into two walls the original VM couldn't cross (first with witness generation, then with SHA-256), and realizing the right answer wasn't to make a bigger VM, but to compose several small VMs, each with its own memory discipline.

This article is the story of **Akron**, **Artik**, and **Lysis**: why each one exists, what problem it solves, and why together they are less than the sum of their parts in lines of code but more than the sum of their parts in structural guarantees.

## The trap of the general-purpose VM

The natural way to extend a VM when a new use case shows up is to add opcodes, add types, add paths in the dispatch loop. The consequence isn't just more code; it's more invariants the same machine has to sustain at the same time. A VM that has a heap with GC and at the same time has to be deterministic in latency for witness generation is a VM that breaks one of those two invariants on every design decision.

At some point along the way I realized that the three core responsibilities Achronyme was asking of its single VM were fundamentally incompatible:

1. **Scripting and `prove {}` blocks**: needs full dynamic semantics: closures, arbitrary allocation, values with unpredictable lifetimes. That asks for a *heap* with *garbage collection*.
2. **Witness generation**: runs inside the proof's hot path; it has to be deterministic in time and free of pauses. That asks for *no heap*, *no GC*.
3. **Constraint emission**: the circom frontend produces SSA so large that a single iter body of SHA-256 no longer fits in a register frame. That asks for *a heap with explicit spill discipline*, no GC but persistent slots.

Any single VM trying to sustain those three invariants at once solves all three poorly. The way out was to separate them.

## Akron: the scripting VM

Akron is the original VM, the one I described in the March article, now with a proper name. It's register-based, has forty-something opcodes, 64-bit values with a 4-bit tag in the top bits, and a tri-color mark-sweep garbage collector over its heap. It runs `.achb` (compiled bytecode of the full language), including the `prove { ... }` blocks a user writes in their code.

```text
// a = b + c in Akron bytecode (register-based)
ADD R0, R1, R2
```

Why can Akron afford a GC? Because its work is *human-perceptible*: scripting proofs, transforming data, configuration. A GC pause of a few milliseconds every so often breaks nothing. The user doesn't perceive that latency, and the values living in its heap can have arbitrary lifetimes (closures capturing variables, maps growing at runtime, concatenated strings).

Akron sustains the mental model of "a normal programming language with dynamic types". Heap + GC is the right answer to that question.

## Artik: the deterministic witness VM

The first limit appeared with witness generation. When a ZK proof is built, the circom frontend describes *which* signals exist and *which* constraints relate them, but it doesn't compute their values directly. That's the job of the *witness generator*, which runs the user's imperative functions (circom `function` declarations: `nbits`, `log2`, etc.) to produce the concrete numbers the cryptographic proof later signs over.

This code runs inside the proof's hot path: every time someone generates a proof, the witness gets recomputed. It has to be fast and, more importantly, **deterministic**. A GC pause in the middle of a witness computation may not break correctness (the final result is the same), but it breaks observational properties of the system (timing channels, predictable throughput under load, ability to run witness generation in memory-strict environments).

I tried first to lift witness generation onto Akron. It worked, but I couldn't guarantee the properties I needed. Any call that allocated a string or closed over a `Vec` could trigger a collection. The fix was to build a separate VM whose memory discipline was structurally incompatible with the problem:

**Artik** has roughly twenty-five opcodes, runs `.artik` bytecode lifted from the bodies of circom functions, uses SSA-style registers, and, critically, **has no heap and no GC**. Each value lives in a register with a statically computable lifetime; the dispatch loop is a switch over opcodes that only manipulate finite-field values and small integers. The R1CS backend dispatches it via a dedicated opcode (`WitnessOp::ArtikCall`).

```text
// Pseudocode for a circom function body lifted to Artik
LOAD_PARAM    R0, 0       // first parameter
CONST_FIELD   R1, 1
ADD_FIELD     R2, R0, R1
RET           R2
```

The invariant Artik holds is simple and verifiable: the memory used by an Artik call is exactly the sum of the registers declared in its bytecode, no more. That makes Artik trivially compatible with witness generation, precisely because it gave up the flexibility Akron needs.

## Lysis: the SSA VM the constraint frontend walks

The second limit appeared with SHA-256.

Achronyme's circom frontend lowers circom `template`s into its own SSA IR. For small circuits (Num2Bits, IsZero, EdDSA, MiMCSponge) that IR fits cleanly into a "register frame + a constraint emitter that walks the IR linearly" scheme. For SHA-256 with 64 bytes of input, that scheme breaks: a single iteration body of the main round generates so many SSA operations that the planned register frame doesn't contain them, and the constraint emitter (which I'd called the *Walker*) starts failing with frame overflow.

The obvious fix was to make the frame bigger. But the problem wasn't size; it was structural. What the Walker actually needed was an explicit *spill* mechanism: a heap where it could stash intermediate values when an iter body exceeded the frame, and strict rules about how that heap is used so the emitter could walk the bytecode without doing aliasing analysis.

**Lysis** is that VM. It has thirty-something opcodes, a header with a `heap_size_hint`, explicit `StoreHeap` and `LoadHeap` opcodes for controlled spill, and an `EmitWitnessCallHeap` opcode for invoking Artik with arguments resolved from the heap. But the key architectural decision isn't the presence of the heap; it's the invariant that governs its use:

> **Each heap slot is written exactly once.**

That rule (*single-static-store*) is what makes Lysis walkable by the constraint emitter without aliasing analysis. If every slot is written once, the bytecode's dependency graph is static and constructible in a single pass. There's no GC because there's no dynamic liveness to track; slots live until the frame ends, and since each one was written once, the reader can always recover the value without worrying about race conditions or overwrites.

```text
// Lysis pseudocode: spilling an SSA value to the heap
COMPUTE       %v3, %v1, %v2     // internal operation
STORE_HEAP    slot_42, %v3      // spill to heap (single-static-store)
...
LOAD_HEAP     %v77, slot_42     // recover later
EMIT_R1CS     %v77, ...         // the emitter reads from here
```

Lysis isn't a VM that's "more general" than Artik; it's a VM whose discipline (heap with single writes) is exactly aligned with the question the constraint emitter needs to answer: *"how do I connect constraints across the unrolled iterations of a large loop?"*.

## The invariant that ties the three together

Each VM's choice of memory model isn't a decision separate from its purpose; it's a *consequence* of the purpose.

| VM     | Question it answers                              | Memory          | GC  |
|--------|--------------------------------------------------|-----------------|-----|
| Akron  | "What does the user want to compute?"            | Heap            | Yes |
| Artik  | "What's the witness for this proof?"             | Registers only  | No  |
| Lysis  | "How do I connect constraints across iters?"     | Heap (1-store)  | No  |

Akron asks for flexibility and answers with a free heap and tri-color GC. Artik asks for determinism and answers by giving up the heap entirely. Lysis asks for spillability without aliasing and answers with a heap constrained by construction.

What three VMs gave me, and one didn't, is the ability to reason locally. When I'm writing code in Akron, I don't have to worry about whether an allocation breaks a witness invariant: Artik doesn't touch Akron's heap. When I'm debugging a constraint emitter on Lysis, I don't have to consider whether a slot might have been overwritten: the single-static-store invariant structurally forbids it.

## Why three, not two or four

The natural question is whether this separation is optimal or merely reflects historical accidents. My honest answer is: three is what the problem asked for, and any merger breaks an invariant.

- **Akron + Artik**: would force witness generation to coexist with GC. Unworkable for the reasons in the Artik section.
- **Akron + Lysis**: would force the scripting language to operate under single-static-store. Impossible for closures and ordinary mutation.
- **Artik + Lysis**: both share "no GC", but Artik is heap-less and Lysis is heap-with-discipline. Merging them would mean either giving Artik a heap it doesn't need, or stripping Lysis of a heap it does need. Either direction makes one of the two worse.

A hypothetical fourth VM would be one for *optimization passes* over the IR; perhaps it'll exist eventually if those passes accumulate enough complexity to justify their own bytecode. But today the optimization passes run as native Rust code over the SSA graph, and there's no clear invariant calling for a new VM. Three is right for today's problem; four would be complexity without justification.

## Conclusion

The temptation when a system starts breaking under load is to add features: a new flag, a new opcode, a special case. Sometimes that's the right call. But sometimes, what you're seeing isn't a bug in an abstraction; it's the abstraction trying to sustain two incompatible invariants at the same time. The way out isn't a patch; it's recognizing there are two problems pretending to be one, and splitting them.

In Achronyme that split produced three small virtual machines (each of which could be deleted and rebuilt in a couple of weeks if the problem changed) instead of one large machine no one could touch without breaking something distant. Each VM's memory discipline is strict because the question each one answers is strict. The aggregate complexity of the whole system didn't go up by composing three VMs; it went *down*, because each VM can be analyzed in isolation from the others.

If you take one thing from this article, let it be this: when an invariant breaks, before adding another special case, ask yourself whether what you have in front of you is really one system, or two systems that have been pretending to be one for months.
