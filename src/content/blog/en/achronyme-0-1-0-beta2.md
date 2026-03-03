---
title: "Achronyme 0.1.0-beta2: The first usable release and editor tooling ecosystem"
description: "Celebrating the release of Achronyme 0.1.0-beta2, a major milestone featuring first-class functions, dynamic structures, and official editor support."
pubDate: "2026-03-03"
tags: ["achronyme", "release", "zk", "rust", "compiler"]
translationKey: "achronyme-0-1-0-beta2"
---

Today I am thrilled to announce the release of **Achronyme 0.1.0-beta2**. This is not just another release; it represents a fundamental milestone in the language's development. We have transitioned from an experimental engine to the first truly usable version for writing Zero-Knowledge circuits and general-purpose logic, all backed by a nascent tooling ecosystem.

## A Complete Language

In previous phases, Achronyme could compile basic math, but lacked the ergonomics we expect from a modern language. With this beta, we have introduced key features that transform the developer experience:

- **First-Class Functions and Closures:** You can now define user functions, pass them as arguments, and leverage lexical variable capture (*Upvalues*) with shared mutable state. We even support full recursion and nested functions.
- **Dynamic Data Structures:** We added native support for **Lists** (`[1, 2, 3]`) and **Maps** (`{"key": "value"}`), allowing for much richer data manipulation within the virtual machine.
- **Advanced Control Flow:** Integration of `while` loops, `for x in list` iterators, and value-returning `if`/`else` expressions, along with structured jumps (`break`, `continue`).

These additions make writing complex scripts and preparing witnesses for your ZK circuits a smooth and familiar experience.

## The Editor Ecosystem

A language is incomplete without the right tools. Writing code in notepad is fine for a prototype, but for a serious project, you need assistance.

That's why alongside this release, we are introducing the first ecosystem tooling support. We have developed a **Language Server Protocol (LSP)** (`ach-lsp`) and an official extension for **VS Code** (located in our `achronyme-editor` repository).

Now, when writing Achronyme code, you get:
- Accurate syntax highlighting.
- Real-time error detection.
- A much better debugging experience thanks to our new "Debug Symbol Table", which maps variable names in `.achb` binaries for detailed error reporting (O(1) "Happy Path").

## ZK Engine and Performance

Under the hood, the cryptographic engine continues to mature. We have solidified our SSA IR (Intermediate Representation) pipeline with multiple optimization passes (Constant folding, Dead code elimination, Boolean propagation).

Furthermore, the performance of our custom Rust VM is exceptional. In hot loop benchmarks, Achronyme VM is approximately **50% faster than Python 3**, processing 10 million iterations in ~0.41 seconds. All this while maintaining memory safety through strategies like "Stack Pinning" and a Mark-and-Sweep garbage collector rigorously tested with our `--stress-gc` mode.

## What's Next?

Beta 0.1.0-beta2 is a turning point. We have an expressive language, integrated development tools, and a robust testing pipeline with over 970 unit tests and 90 integration tests.

The next step is refining the proving backends (R1CS/Groth16 and Plonkish/KZG-PlonK) and expanding the standard library. I invite you to download this release, try out the VS Code extension, and start writing your own Zero-Knowledge circuits.

The future of Achronyme is here, and it's faster, safer, and more usable than ever!
