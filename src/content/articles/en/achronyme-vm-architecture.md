---
title: "Anatomy of a Virtual Machine: From Stack to Registers in Achronyme"
description: "Why Achronyme moved from stack bytecode to a register VM, and what that tradeoff changed."
pubDate: "2026-03-07"
updatedDate: "2026-08-08"
tags: ["architecture", "compilers", "vm", "achronyme"]
draft: false
translationKey: "achronyme-vm-architecture"
abstract: "A comparison of stack and register bytecode using Achronyme's first VM rewrite. The register design enlarged individual instructions but reduced dispatches in the workloads measured at the time."
technicalDepth: "Advanced"
references:
  - "https://www.lua.org/doc/jucs05.pdf"
  - "https://source.android.com/docs/core/runtime/dalvik-bytecode"
---

Achronyme began with a tree-walk interpreter. It evaluated the abstract syntax tree directly, which was useful while the language changed every day, but expensive once the same nodes started running inside loops. The first bytecode implementation used an operand stack. The next one used virtual registers.

This article records why I made that second change. It describes the VM as it existed in March 2026; Achronyme later split execution across [three specialized machines](/articles/achronyme-three-vms/).

## What "virtual machine" means here

This is a process virtual machine, not a virtualized operating system. It executes Achronyme bytecode through a dispatch loop:

1. Fetch the instruction at the instruction pointer.
2. Decode its opcode and operands.
3. Execute it and advance or replace the instruction pointer.

The bytecode format determines where each instruction reads and writes values. That choice affects instruction density, compiler complexity, and the amount of dispatch work performed by the interpreter.

![Stack vs Register VM Architecture](/images/articles/achronyme-vm/architecture-comparison.svg)

## Stack bytecode

A stack VM keeps operands on a last-in, first-out stack. Instructions such as `ADD` do not name their inputs because the top two stack values are implied.

For `a = b + c`, a simple stack compiler might emit:

```text
0001: LOAD_LOCAL 1  // push b
0002: LOAD_LOCAL 2  // push c
0003: ADD           // pop b and c, then push the result
0004: STORE_LOCAL 0 // store the result in a
```

The encoding can be compact. The cost is the stream of load and store instructions needed to move values between locals and the operand stack. For arithmetic-heavy Achronyme programs, those instructions increased the number of trips through the dispatch loop without doing arithmetic themselves.

That does not make stack VMs generally slow. They are simple to generate, easy to validate, and often compact. It means their tradeoff was a poor fit for the workloads I was measuring.

## Register bytecode

A register VM gives each function a frame containing virtual registers. Instructions name their sources and destination explicitly:

```text
// Format: OPCODE destination, source1, source2
0001: ADD R0, R1, R2
```

One instruction now performs the data movement that the stack version expressed with four. The instruction itself is wider because it must encode three register indices.

Lua 5.0 is the clearest precedent for this design. Dalvik used a register-oriented format as well, although its constraints and runtime were different from Achronyme's. I used those systems as references for the bytecode layout, not as evidence that the same performance result would automatically carry over.

## What changed in Achronyme

In the programs I compared during the rewrite, the register compiler emitted close to half as many dispatched instructions as the stack compiler. That is an instruction-count result, not a claim that every program became twice as fast. Wider bytecode increases code size, and total runtime still depends on branches, allocations, native calls, cache behavior, and the work performed by each opcode.

Registers also made dataflow clearer in the compiler. A value's producer and consumers were explicit in the instruction stream, which helped later work on SSA-like lowering and specialized execution paths.

I originally attributed part of the improvement to cache locality. The register frame is contiguous and avoids constant operand-stack shuffling, but I did not publish hardware-counter measurements for that version. The defensible result is the reduction in dispatched instructions; a precise cache claim would need separate measurement.

## The tradeoff

The migration exchanged compact bytecode for fewer dispatches and more explicit dataflow. That choice fit Achronyme's arithmetic-heavy programs and made later compiler work easier. It would not be the right choice for every interpreter.

The important part was measuring the actual instruction stream. The stack design looked efficient when I compared opcode widths. It looked different when I counted the extra loads and stores required by a real program.
