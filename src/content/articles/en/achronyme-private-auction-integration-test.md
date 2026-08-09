---
title: "A Private Auction as an Achronyme Integration Test"
description: "A detailed walkthrough of one Achronyme program that joins structured concurrency, capabilities, Poseidon commitments, Merkle membership, and a Groth16 proof."
pubDate: "2026-08-09"
tags: ["achronyme", "structured-concurrency", "zero-knowledge", "groth16", "integration-testing"]
draft: false
translationKey: "achronyme-private-auction-integration-test"
abstract: "This article follows a three-bidder auction test from bounded TCP tasks to a detached Groth16 proof. It states the circuit claim precisely, separates host checks from proof constraints, explains the four public inputs and nine witness values, and records the security and engine boundaries the tests enforce."
technicalDepth: "Advanced"
references:
  - "https://achrony.me/docs/language/concurrency-and-io/"
  - "https://github.com/achronyme/achronyme/releases/tag/v0.1.0"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://eprint.iacr.org/2019/458.pdf"
---

The program is named the **Private Auction Integration Test**, with `private-auction-integration-test` as its working directory.

This deterministic Achronyme 0.1.0 program makes several language boundaries interact in one run:

1. Namespaced modules keep orchestration, transport, proof logic, registry construction, and artifact storage separate.
2. Structured concurrency owns six child tasks, including a deadline.
3. A bounded channel applies backpressure between the TCP server and its consumer.
4. Explicit host capabilities restrict the program to one loopback address and one output directory.
5. A Groth16 circuit checks three Poseidon commitment openings, a strict winner, and one Merkle membership path.
6. The program verifies the proof in process, persists a detached bundle, and verifies it again in a fresh CLI process.

"Bob wins" supplies the fixture. The test exercises an inspectable boundary between ordinary host execution and a zero-knowledge statement, then carries the result through serialization and independent verification.

## The observed result

I ran the project with `ach 0.1.0`, the interpreter engine, bids of 500, 750, and 300, and a fresh output directory. The run accepted three commitments, generated and verified a Groth16 proof, wrote four artifacts, and ended with:

```text
commitments accepted: 3
Proof generated (Groth16, 854 bytes)
Proof verified - 1,864 constraints
winner proof verified: true
artifact bytes written: 4128
PASS: private_auction_integration_test
```

The exact proof bytes are randomized and should not be expected to repeat. The receipt is deterministic because this test deliberately fixes its inputs and nonces.

With `--circuit-stats`, the same run reported 4 public inputs, 9 witness values, 22 counted IR instructions, and an estimated 2,501 R1CS constraints:

| Category | IR instructions | Estimated constraints | Share |
|---|---:|---:|---:|
| Poseidon hashes | 5 | 1,809 | 72.3% |
| Comparisons | 3 | 578 | 23.1% |
| Range checks | 3 | 99 | 4.0% |
| Selections | 4 | 8 | 0.3% |
| Assertions | 7 | 7 | 0.3% |

The 2,501 and 1,864 figures do not contradict each other. The statistics report estimates from the optimized circuit IR. Before proof generation, the R1CS backend eliminates linear constraints and reports the 1,864 constraints that remain in the actual proving system. One number describes the pre-emission cost model; the other describes the finalized R1CS used by Groth16.

## The claim, before the implementation

Let `H` be Achronyme's two-input Poseidon hash over BN254. The verifier receives four public field elements in this order:

```text
C_bob, C_alice, C_charlie, registry_root
```

The prover supplies 9 witness values:

```text
b_alice, b_bob, b_charlie,
n_alice, n_bob, n_charlie,
bob_leaf, lower_sibling, upper_sibling
```

The circuit proves that there are witness values satisfying all of the following:

```text
H(b_bob,     n_bob)     = C_bob
H(b_alice,   n_alice)   = C_alice
H(b_charlie, n_charlie) = C_charlie

0 <= b_alice   < 2^32
0 <= b_bob     < 2^32
0 <= b_charlie < 2^32

b_bob > 0
b_bob > b_alice
b_bob > b_charlie

MerkleVerify(
    registry_root,
    bob_leaf,
    [lower_sibling, upper_sibling],
    [1, 0]
)
```

In plain language: the commitment identified as Bob's opens to a positive 32-bit bid strictly greater than the two other committed 32-bit bids, and the supplied winner leaf occupies the expected position in the public registry root.

That is the cryptographic statement. The rest of the application is responsible for collecting the public commitments, choosing the public root, supplying the witness, controlling host access, and preserving the proof artifacts.

## Public data and private witness data

The boundary is easier to inspect as a table:

| Value | Circuit visibility | Appears in receipt | Sent over local TCP |
|---|---|---|---|
| Bob commitment | Public | Yes | Yes |
| Alice commitment | Public | Yes | Yes |
| Charlie commitment | Public | Yes | Yes |
| Registry root | Public | Yes | No |
| Three bids | Witness | No | No |
| Three nonces | Witness | No | No |
| Bob registry leaf | Witness | No | No |
| Two Merkle siblings | Witness | No | No |

"Witness" means the values are absent from the verifier's public input. Hiding still depends on the application's commitment scheme and its choice of nonces.

This test uses fixed nonces: 1111, 2222, and 3333. The fixed values make runs deterministic and leave low-domain bids open to a dictionary attack. Anyone who knows the source and sees a commitment can hash plausible bids with the known nonce until one matches. The demonstrated scope covers witness separation and proof plumbing. A production design needs unpredictable, unique blinding values and a protocol for protecting them.

## Five modules, one orchestrator

The first version of the program could have placed every operation in `main.ach`. Instead, the Achronyme module system gives each boundary an owner:

```text
src/main.ach
|-- transport.ach   TCP tasks, channel, deadline, and task outcomes
|-- auction.ach     commitments, proof statement, and receipt formatting
|-- registry.ach    four leaves, root, and the winner membership path
`-- artifacts.ach   concurrent writes and receipt read-back
```

`main.ach` imports each file into a namespace:

```ach
import "./transport.ach" as transport
import "./auction.ach" as auction
import "./registry.ach" as registry
import "./artifacts.ach" as artifacts
```

The orchestrator reads inputs, calls exported functions such as `transport::exchange_commitments`, and passes results to the next stage. Helpers such as `submit_commitment`, `collect_commitments`, and `write_artifact` remain private to their modules.

The source contract makes this ownership enforceable. It rejects network primitives, file creation, `prove winner`, or `merkle_verify` if they move back into `main.ach`, and it caps that file at 90 lines. A regression therefore cannot quietly turn the orchestrator into a second implementation of the modules.

## Stage 1: host inputs and commitments

The program reads an address, an output directory, and three integer bids. It converts the bids to field elements and rejects non-positive inputs before starting the protocol:

```ach
let alice_bid = parse_int(read_line()).to_field()
let bob_bid = parse_int(read_line()).to_field()
let charlie_bid = parse_int(read_line()).to_field()

assert(alice_bid > 0p0)
assert(bob_bid > 0p0)
assert(charlie_bid > 0p0)
```

Those three assertions are host checks. The proof circuit repeats positivity only for Bob. It range-checks Alice and Charlie but would allow either of them to be zero if the prove function were called directly from another host path.

That distinction matters:

- The complete application accepts three positive bids.
- The detached proof establishes that Bob is positive and strictly greater than two 32-bit bids.

The commitments are then computed outside the circuit:

```ach
export fn commitment(bid, nonce) {
    poseidon(bid, nonce)
}
```

The circuit recomputes all three hashes. The host cannot substitute a different bid or nonce without making the corresponding public commitment equality fail.

## Stage 2: structured concurrent transport

The transport module opens the loopback listener before spawning clients, then creates `channel(1)`. Capacity one is intentionally smaller than the three-message workload. The server cannot enqueue all commitments and run ahead indefinitely; `channel_send` suspends when the single slot is occupied until the consumer receives.

Inside one `concurrent` scope, the module creates six tasks:

```ach
let server_task = spawn collect_commitments(listener, commitment_events)
let consumer_task = spawn consume_commitments(commitment_events)
let deadline_task = spawn timeout_after(2000)

let alice_task = spawn submit_commitment(address, "alice", commit_alice, 1)
let bob_task = spawn submit_commitment(address, "bob", commit_bob, 2)
let charlie_task = spawn submit_commitment(address, "charlie", commit_charlie, 3)
```

Each client waits for a small staggered delay, connects, sends only `bidder:commitment`, waits for `accepted`, and closes its connection. The server accepts exactly three connections. A separate consumer drains exactly three channel messages and yields between receives.

The server races the deadline:

```ach
let server_race = await [server_task, deadline_task] as race
assert(server_race["index"] == 0)
assert(server_race["ok"] == true)
assert(server_race["value"] == 3)
```

If the server terminates first, it must have succeeded and returned three. The losing timer task is cancelled and joined by the structured scope. If the timer wins, the index assertion fails and scope failure cancels the remaining children cooperatively.

The client tasks use `await task as outcome`, converting success or failure into data before the module asserts each `ok` field. The consumer uses a normal `await`, so an unhandled consumer failure propagates through the scope. No task detaches and no handle escapes.

After every child has reached a terminal state, the scope returns the consumed count. Only then does the module close the owned channel.

## Stage 3: a fixed four-leaf registry

The registry is deliberately small and deterministic. Its leaves are:

```text
L_alice   = H(101, 9001)
L_bob     = H(102, 9002)
L_charlie = H(103, 9003)
L_reserve = H(104, 9004)
```

The public root is:

```text
right = H(L_charlie, L_reserve)
root  = H(H(L_alice, L_bob), right)
```

Bob's witness path is `[L_alice, right]` with direction indices `[1, 0]`. At the first level Bob is the right child, so Alice is placed on the left. At the second level the Alice/Bob node is the left child, so the Charlie/reserve node is placed on the right.

The two Merkle levels account for two of the five Poseidon hashes in the circuit. The other three open the bid commitments.

The circuit proves membership under the supplied root. It does not prove that numeric leaf payload 102 is legally or socially "Bob." A verifier needs an external registry definition that binds that public root and leaf position to bidder identities.

## Stage 4: the Groth16 winner circuit

The proof module declares only the four verifier-visible values in the `prove` parameter list. Every captured value used by the body becomes witness data:

```ach
let proof = prove winner(
    commit_bob: Public,
    commit_alice: Public,
    commit_charlie: Public,
    registry_root: Public
) {
    assert_eq(poseidon(bob_bid, bob_nonce_value), commit_bob)
    assert_eq(poseidon(alice_bid, alice_nonce_value), commit_alice)
    assert_eq(poseidon(charlie_bid, charlie_nonce_value), commit_charlie)

    range_check(alice_bid, 32)
    range_check(bob_bid, 32)
    range_check(charlie_bid, 32)
    assert(bob_bid > 0p0)
    assert(bob_bid > alice_bid)
    assert(bob_bid > charlie_bid)

    let bob_path: Field[2] = [bob_lower_sibling, bob_upper_sibling]
    let bob_indices: Field[2] = [0p1, 0p0]
    merkle_verify(registry_root, bidder_bob, bob_path, bob_indices)
}
```

The 32-bit range checks are essential. Comparisons over a prime field need an integer interpretation with a known bound. Without it, values near the modulus could be interpreted inconsistently with ordinary unsigned bids.

Strict `>` checks reject a tie involving Bob. There is no constraint comparing Alice with Charlie because their relative order does not affect the designated winner claim.

Bob is designated by the circuit interface. The circuit verifies that the designated commitment beats these two alternatives; it does not search an arbitrary list and choose a winner. That is enough for this integration test and too narrow for a general auction protocol.

## Stage 5: verification and artifact ownership

The returned proof is a first-class host value. `main.ach` immediately calls `verify_proof` and refuses to continue unless the result is true. This catches a failure before producing a receipt. Detached verification supplies the final portability check.

The artifact module serializes four independent documents:

```text
proof.json
public.json
verification_key.json
receipt.txt
```

It writes them with four tasks inside a second `concurrent` scope. Each task creates one owned file, writes its contents, closes it explicitly, and returns its byte count. The parent awaits all four counts and adds them.

After the scope exits, the module opens `receipt.txt`, reads it, closes the handle, and compares a full `read_file` result with the original receipt. The receipt exposes the winner label, three commitments, the root, and the accepted count. It does not contain bids or nonces.

The resulting bundle is sufficient for verification in a fresh process:

```sh
ach verify \
  --proof build/demo-output/proof.json \
  --public build/demo-output/public.json \
  --vkey build/demo-output/verification_key.json \
  --curve bn254 \
  --format json
```

The expected JSON contains `"valid": true`. Detached verification matters because an in-process check could accidentally depend on cached circuit state or objects that were never serialized.

## Capabilities and proving authority are separate

The runner grants four host permissions with exact targets:

```sh
--allow-read "$OUTPUT_DIR"
--allow-write "$OUTPUT_DIR"
--allow-connect "$ADDRESS"
--allow-listen "$ADDRESS"
```

It also opts into local proving parameters with `--insecure-dev-setup`. These are two independent authority decisions:

- File and network capabilities decide what host resources the program may access.
- The proving-key source decides whether proof generation is allowed and which setup material it trusts.

The security contract runs the program without host grants and requires a capability failure. It then grants the host resources but omits proving authority and requires proof generation to fail. Passing one boundary never implies permission at the other.

The project also sets finite VM budgets: 16 tasks, 16 resources, 16 task scopes, 16 pending native requests, 4 channels, and 16 channel operations. Running the same program with `PRIVATE_AUCTION_MAX_TASKS=2` must fail with a resource-limit error instead of silently allocating more.

## The negative tests are part of the result

A successful proof says little about whether the surrounding checks are wired correctly. The project therefore attacks several assumptions:

| Contract | Mutation or missing authority | Required result |
|---|---|---|
| Source | Move transport, proof, or file ownership into `main.ach` | Static contract fails |
| Host capabilities | Omit file and network grants | Program fails before unauthorized access |
| Proving authority | Omit both trusted store and development setup | Proof generation fails closed |
| Task budget | Reduce maximum tasks from 16 to 2 | Resource-limit failure |
| Winner constraint | Raise Alice's bid to 900 while Bob remains 750 | Unsatisfied circuit or proof failure |
| Public binding | Replace the first public input after proving | Detached verification returns `valid: false` |
| Artifact shape | Remove or corrupt proof, public input, key, or receipt | End-to-end contract fails |

The altered-public-input case is especially important. A valid proof is bound to its public inputs. Reusing the same proof with a different claimed winning commitment must not verify.

## Interpreter, JIT, and the AOT boundary

The engine contract runs the complete program twice, once with the interpreter and once with the LLVM JIT. It requires byte-identical receipts and verifies both detached proofs in fresh processes.

Proof-byte equality is outside the contract because Groth16 proof generation is randomized. Engine equivalence means both runs produce the same public receipt and independently valid proof bundles.

The test also inspects the compiled manifest and requires these effects:

```text
task,io.console,io.file,io.network,io.clock,prove,verify,circuit
```

Finally, it attempts standalone AOT compilation. Achronyme 0.1.0's installed AOT runtime does not provide `PROVE`, `VERIFY`, or `CIRCOM`, so this hybrid program must be rejected. The expected failure documents a capability boundary. It would be misleading to report AOT support after compiling only the host scaffold and omitting the proof stage.

## What this test proves, and what it does not

The verified bundle establishes one narrow statement:

> For the four public field elements in `public.json`, there is a 9-value witness that opens the three commitments to bounded bids, makes the designated Bob bid positive and strictly largest, and authenticates the designated registry leaf under the public root at path `[1, 0]`.

The complete application additionally checks positive host inputs, receives three commitment messages before a deadline, closes owned resources, stays within configured budgets, and writes a self-contained verification bundle.

It does not prove:

- that no fourth bidder exists;
- that every eligible bidder was allowed to participate;
- that the network sender owns the identity written before the colon;
- that the registry root represents a legally authoritative bidder list;
- that fixed nonces hide low-domain bids;
- that messages are confidential or authenticated merely because they use TCP;
- that a fair tie, withdrawal, replay, or auction-session policy exists;
- that the local single-party Groth16 setup is safe for production;
- that the standalone AOT runtime can execute proof effects.

Those exclusions define the boundary between a useful language integration test and a deployable auction protocol.

## What production would require

A production version would need at least:

1. Unpredictable, unique blinding values and a protocol for storing or deriving them safely.
2. An auction identifier bound into the public statement to prevent cross-session replay.
3. Authenticated bidder enrollment and transport that bind each identity to a session and its credentials.
4. A dynamic registry with a published rule connecting identities, leaves, positions, and roots.
5. A general winner-selection statement, including tie and invalid-bid policy.
6. A ceremony-derived proving key for this exact optimized circuit, loaded through a trusted store without `--insecure-dev-setup`.
7. Operational limits sized from measured workloads, with failure and recovery behavior tested under saturation.
8. A target decision for proof effects: interpreter/JIT deployment today, or additional AOT runtime support before claiming standalone execution.

## Running the contracts

With the integration project and Achronyme 0.1.0 installed, the positive run is:

```sh
./scripts/run-demo.sh
```

The four contracts can be executed separately:

```sh
bash test/source_contract.sh
bash test/e2e.sh
bash test/security_contract.sh
bash test/engine_contract.sh
```

On the run documented here, all four passed. Together they cover the success path, source responsibility, bounded host execution, fail-closed authority, constraint rejection, public-input binding, artifact portability, engine agreement, and an explicit unsupported AOT capability.

The private auction serves as a serious Achronyme integration test because it carries one claim from concurrent I/O, through a circuit, into a detached artifact another process can reject or verify. Its explicit limits are part of that result.
