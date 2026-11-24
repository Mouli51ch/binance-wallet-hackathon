<!--
One task, one PR. The `board` job reads the lines below, so keep the labels exactly as written.
Delete nothing. If a line does not apply, write "n/a" and why.
-->

**Task:** T-

**Serves:** <!-- copy the Serves line from your TASKS.md row: Agent ID depth, Practicality,
Completion, Innovation, Pioneer award, or unblocks. -->

**Acceptance, and the number it hit:** <!-- the acceptance line from your row, then what you
measured. "submit costs 182k gas" not "works". -->

**Evidence:** <!-- tx hash, BscScan link, Actions run, deployed URL, recording. `board` refuses
`Status: done` without one. -->

**Finding:** <!-- what you discovered that nobody expected, with its number. Write "none" only if
you genuinely looked. -->

---

- [ ] `TASKS.md` row updated: `Status: in-review <this PR>`, and the branch matches `Branch:`
- [ ] I changed only files in my row's `Touches:` line
- [ ] `/code-review` at medium run
- [ ] `superpowers:verification-before-completion` run
- [ ] Scoring, hashing or settlement logic has its failing test first, committed before the implementation
- [ ] No private key, seed phrase or keyed RPC URL anywhere in the diff
- [ ] No em dashes or en dashes anywhere in the diff

**Dependency:** <!-- Required only if this PR adds a dependency. Say why the stdlib, a native
platform feature, or an already-installed package will not do. -->

**Diff-size:** <!-- Required only if the diff is over 600 changed lines. Split, or say why not. -->

**Second reviewer needed?** <!-- CI cannot see these, so a human must. Tick and name them. -->

- [ ] Touches `contracts/src`, the keeper, keys or anything that sends a transaction, so `/security-review` was also run
- [ ] Changes the interface (`docs/ARCHITECTURE.md`: function signatures, commit hash encoding, units), so the contract owner and the skill and website owner agreed

**Reviewer:** <!-- name, or "CI only". Not the person who wrote the code. -->
