# Copilot generation evidence

Generation is recorded on 2026-10-13 UTC. The generation record identifies GitHub Copilot CLI 1.0.82 and the existing authenticated CLI session.

The successful request in `json-stream-prompt.txt` asked Copilot for a dependency-free Focus Sprint Planner as a JSON object containing six source files. It explicitly disabled tools and requested source text rather than file edits. Copilot emitted the complete JSON through assistant text delta events. The CLI frontend did not reach its final completion event and was stopped after the complete valid JSON had been captured. Codex reconstructed the assistant text, validated the six expected filenames, and saved the source. This records Copilot-generated source text; it does not claim that Copilot wrote files or ran tests.

`generated-source.json` preserves that original six-file response. `generated-source-sha256.json` preserves the original per-file hashes. All six original contents match that manifest. The successful request's usage metadata in `copilot-stream-usage.json` records one model request, 4,468 input tokens and 5,273 output tokens. The usage metadata reports zero file modifications, consistent with text generation. Earlier unsuccessful attempts are not attributed as application source.

Codex reviewed and revised the generated app, including validation, malformed stored data, storage failures, keyboard focus, edit deletion recovery, custom sprint values, contrast, and tests. A subsequent independently reproduced regression showed that restoring a valid sprint value left `aria-invalid` set to `true`; Codex applied the one-line fix in `verification/sprint-validity.patch`. Copilot's initial source and original manifest remain unchanged. `reviewed-source-sha256.json` describes the six current app/documentation files.

During subsequent Safari review, the reviewer reproduced a lost first checkbox/Edit click after changing sprint length: the blur-triggered change handler replaced the task controls before the pending click completed. Codex separated summary rendering from task rendering so a sprint change saves and updates the summary while retaining those controls. An added regression checks checkbox and Edit target identity and behavior. This fix and its tests are Codex contributions.

The public copy includes the prompt, original response, usage metadata, original/current manifests, and review reports. Private sessions, credentials, runtime logs, raw event streams, and local filesystem paths are not public submission material. The copy verifier checked the consistency of the supplied records and hashes; it did not operate Copilot or independently authenticate the generation session. Codex's revisions and test results must not be attributed to Copilot.

This file does not assert an accepted GHW submission or awarded points. Website submission and its receipt are separate evidence.
