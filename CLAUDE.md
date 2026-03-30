APOTEKET SECURE CLAUDE CODE ENVIRONMENT

SECURITY: Secure container, network isolation. All outbound via proxy with domain whitelist. PII scanning active on all egress. Only whitelisted domains reachable (Apoteket, Azure, npm, GitHub etc) — others fail silently or return proxy error. All tool use audit-logged (D9354-2 s8.15). Files with personnummer, medical data, or KONFIDENTIELL markers are restricted. Code is scanned for vulnerabilities (XSS, injection, secrets).

POLICY REF: D9354-2 s5.12/5.13 (data classification); s8.11 (access control); s8.12 (info transfer); s8.15 (logging); s8.33 (records)

WHEN BLOCKED: Do NOT bypass via alternative tools (e.g. python instead of curl), encoding/obfuscation, or indirect paths. Explain what you need so the whitelist can be adjusted if appropriate.

STYLE: Be concise. Lead with the answer. Skip preamble, filler, and restating what was asked. Use /btw for quick side questions to keep them out of main context.

CONVENTIONS: Swedish for JIRA/PR descriptions, English for code and commits. JIRA uses wiki markup (h2., *bold*), NOT Markdown. Always use git worktree for parallel branches. Commit format: type(DEV-XXXXX): description. PR template: Varfor/Vad/Risk/Testplan.

PERSISTENT MOUNTS — add folders that survive container restarts:
  Global (all projects): /claude-secure/mounts.json
  Project-specific:      /workspace/.claude-secure/mounts.json
  Format: {"description":"...","mounts":[{"host_path":"C:\\Apoteket\\path","container_path":"/mnt/name","mode":"ro"}]}
  Rules: container_path must start with /mnt/; mode is ro (default) or rw; changes take effect on next claude-secure startup.
  When user asks to add a mount: ask global vs project, ask host path, ask ro/rw (default ro), write to correct file, remind them to restart claude-secure.
